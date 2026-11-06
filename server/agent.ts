// server/agent.ts — bounded Claude Fable 5 tool-use loop, dispatching tool
// calls through an injected runner (e.g. the reporeason MCP). Shares the
// Anthropic client with server/llm.ts. On a Fable refusal it throws so the
// caller can degrade to a single-shot completion.
import { client, FABLE_MODEL, MAX_TOKENS, EFFORT, textOf } from "./llm.ts";

export interface AnthropicTool { name: string; description: string; input_schema: any; }
export interface ToolRunner { run(name: string, args: any): Promise<string>; }

/** Map MCP tool defs to Anthropic tool schema. */
export function toAnthropicTools(mcpTools: any[]): AnthropicTool[] {
  return (mcpTools || []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema ?? t.parameters ?? { type: "object", properties: {} },
  }));
}

export async function runReasoningAgent(
  system: string, user: string, tools: AnthropicTool[], runner: ToolRunner,
  maxIters = 4, maxToolCalls = 8,
): Promise<string> {
  const messages: any[] = [{ role: "user", content: user }];
  let toolCalls = 0;

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
      return textOf(resp.content);
    }

    const results: any[] = [];
    for (const tu of toolUses) {
      let result: string;
      if (toolCalls >= maxToolCalls) {
        result = "tool budget exhausted";
      } else {
        toolCalls++;
        try {
          console.log(`[agent] tool call ${toolCalls}/${maxToolCalls}: ${tu.name}`);
          result = await runner.run(tu.name, tu.input);
        } catch (err: any) {
          result = `tool error: ${err.message}`;
        }
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    messages.push({ role: "user", content: results });
    if (toolCalls >= maxToolCalls) break;
  }

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
 * permission, so a later revise or a failed verify takes a grant back. An unverified
 * answer is kept, because it may still be informed by a frame and a second completion
 * would only know less, but the caller must not cache it as reasoned. Throws when no tools
 * are available, so the caller makes a plain single-shot completion instead.
 */
export async function runGroundedAgent(
  system: string, user: string, tools: AnthropicTool[], runner: ToolRunner,
  maxIters = 4, maxToolCalls = 8,
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
  };
  const text = await runReasoningAgent(system, user, tools, watching, maxIters, maxToolCalls);
  const grounded = verdicts.size > 0 && [...verdicts.values()].every(Boolean);
  return { text, grounded };
}
