// server/agent.ts — bounded Claude Fable 5 tool-use loop, dispatching tool
// calls through an injected runner (e.g. the reporeason MCP). Shares the
// Anthropic client with server/llm.ts. On a Fable refusal it throws so the
// caller can degrade to a single-shot completion.
import { client, FABLE_MODEL, MAX_TOKENS, EFFORT, textOf } from "./llm.ts";

export interface AnthropicTool { name: string; description: string; input_schema: any; }
export interface ToolRunner {
  run(name: string, args: any): Promise<string>;
  /** Told about a call the tool budget refused, so nothing is assumed to have run. */
  skipped?(name: string, args: any): void;
}

/** Map MCP tool defs to Anthropic tool schema. */
export function toAnthropicTools(mcpTools: any[]): AnthropicTool[] {
  return (mcpTools || []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema ?? t.parameters ?? { type: "object", properties: {} },
  }));
}

/**
 * The repo-reason gate. The first three ranks are read with no tools on the request, the tools
 * open with the rest of the dossier, and at least one call runs before the interpretation is kept.
 * `required` is what the harness runs itself if the model will not make a call. The loop enforces
 * this instead of `tool_choice`, because the later Fable models reject a forced tool choice.
 */
export interface ReadGate {
  opening: string; remainder: string;
  required: { name: string; args: any };
}

export const GATE_NUDGE =
  "Make at least one reasoning tool call now, before writing the interpretation.";

export async function runReasoningAgent(
  system: string, user: string, tools: AnthropicTool[], runner: ToolRunner,
  maxIters = 4, maxToolCalls = 8,
): Promise<string> {
  return reasonLoop(system, [{ role: "user", content: user }], tools, runner, maxIters, maxToolCalls);
}

/** Read the opening ranks with the tools withheld, then reason and interpret with them open. */
export async function runGatedAgent(
  system: string, gate: ReadGate, tools: AnthropicTool[], runner: ToolRunner,
  maxIters = 4, maxToolCalls = 8,
): Promise<string> {
  const messages: any[] = [{ role: "user", content: gate.opening }];
  const read: any = await client().messages.create({
    model: FABLE_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    system,
    messages,
  } as any);
  if (read.stop_reason === "refusal") throw new Error("Claude declined during reasoning");
  messages.push({ role: "assistant", content: read.content });
  messages.push({ role: "user", content: gate.remainder });
  return reasonLoop(system, messages, tools, runner, maxIters, maxToolCalls, gate.required);
}

async function reasonLoop(
  system: string, messages: any[], tools: AnthropicTool[], runner: ToolRunner,
  maxIters: number, maxToolCalls: number, required?: ReadGate["required"],
): Promise<string> {
  let toolCalls = 0;
  let succeeded = 0;   // budget counts attempts; the gate counts calls that actually returned
  let nudged = false;

  const runRequired = async (spec: ReadGate["required"]) => {
    console.log(`[agent] gate ran the required call itself: ${spec.name}`);
    const frame = await runner.run(spec.name, spec.args);
    succeeded++;
    return `The required reasoning call was made for you. Its result:\n${frame}\n\nNow write the interpretation.`;
  };

  for (let i = 0; i < maxIters; i++) {
    const resp: any = await client().messages.create({
      model: FABLE_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT },
      system,
      messages,
      tools: tools.length ? tools : undefined,
    } as any);
    if (resp.stop_reason === "refusal") throw new Error("Claude declined during reasoning");

    // Echo the assistant turn back verbatim (thinking/tool_use blocks intact).
    messages.push({ role: "assistant", content: resp.content });
    const toolUses = (resp.content || []).filter((b: any) => b?.type === "tool_use");
    if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (!required || succeeded > 0) return textOf(resp.content);
      if (!nudged) {
        nudged = true;
        messages.push({ role: "user", content: GATE_NUDGE });
        continue;
      }
      toolCalls++;
      messages.push({ role: "user", content: await runRequired(required) });
      continue;
    }

    const results: any[] = [];
    for (const tu of toolUses) {
      let result: string;
      if (toolCalls >= maxToolCalls) {
        result = "tool budget exhausted";
        runner.skipped?.(tu.name, tu.input);
      } else {
        toolCalls++;
        try {
          console.log(`[agent] tool call ${toolCalls}/${maxToolCalls}: ${tu.name}`);
          result = await runner.run(tu.name, tu.input);
          succeeded++;
        } catch (err: any) {
          result = `tool error: ${err.message}`;
        }
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    messages.push({ role: "user", content: results });
    if (toolCalls >= maxToolCalls) break;
  }

  // Budget spent with nothing returned: the gate still needs its call before anything is written.
  if (required && succeeded === 0) messages.push({ role: "user", content: await runRequired(required) });

  // Forced final answer with tools withheld.
  const final: any = await client().messages.create({
    model: FABLE_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    system,
    messages: [...messages, { role: "user", content: "Provide your final interpretation now, no more tools." }],
  } as any);
  return textOf(final.content);
}

/** True when a reason_verify reply granted permission. */
function verifyGranted(result: string): boolean {
  try {
    return JSON.parse(result)?.permission === "granted";
  } catch {
    return false;
  }
}

/**
 * The reasoning path proper: runReasoningAgent, reporting whether the answer was grounded.
 * It is grounded only if the latest reason_verify on every frame it verified granted
 * permission, so a later revise, a failed verify or one the budget skipped takes a grant
 * back. An unverified
 * answer is kept, because it may still be informed by a frame and a second completion
 * would only know less, but the caller must not cache it as reasoned. Throws when no tools
 * are available, so the caller makes a plain single-shot completion instead.
 */
export async function runGroundedAgent(
  system: string, user: string, tools: AnthropicTool[], runner: ToolRunner,
  maxIters = 4, maxToolCalls = 8, gate?: ReadGate,
): Promise<{ text: string; grounded: boolean }> {
  if (tools.length === 0) throw new Error("no reasoning tools available");
  const verdicts = new Map<string, boolean>();    // exploration id -> its latest verdict
  const watching: ToolRunner = {
    async run(name, args) {
      if (name !== "reason_verify") return runner.run(name, args);
      const id = String(args?.exploration_id ?? "");
      verdicts.set(id, false);                    // a verify that throws grants nothing
      const result = await runner.run(name, args);
      verdicts.set(id, verifyGranted(result));
      return result;
    },
    skipped(name, args) {
      if (name === "reason_verify") verdicts.set(String(args?.exploration_id ?? ""), false);
    },
  };
  const text = gate
    ? await runGatedAgent(system, gate, tools, watching, maxIters, maxToolCalls)
    : await runReasoningAgent(system, user, tools, watching, maxIters, maxToolCalls);
  const grounded = verdicts.size > 0 && [...verdicts.values()].every(Boolean);
  return { text, grounded };
}
