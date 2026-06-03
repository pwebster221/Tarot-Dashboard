// server/agent.ts — bounded OpenAI function-calling loop against LiteLLM,
// dispatching tool calls through an injected runner (e.g. reporeason MCP).
export interface OAITool { type: "function"; function: { name: string; description: string; parameters: any }; }
export interface ToolRunner { run(name: string, args: any): Promise<string>; }

export function toOpenAITools(mcpTools: any[]): OAITool[] {
  return (mcpTools || []).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema ?? t.parameters ?? { type: "object", properties: {} },
    },
  }));
}

async function chat(body: any): Promise<any> {
  const base = process.env.LITELLM_BASE, key = process.env.LITELLM_API_KEY;
  if (!base || !key) throw new Error("LITELLM_BASE and LITELLM_API_KEY must be set");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "alder-1-0", max_tokens: 2048, ...body }),
  });
  if (!res.ok) throw new Error(`LiteLLM ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function runReasoningAgent(
  system: string, user: string, tools: OAITool[], runner: ToolRunner, maxIters = 4,
): Promise<string> {
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  for (let i = 0; i < maxIters; i++) {
    const data = await chat({ messages, tools: tools.length ? tools : undefined });
    const msg = data?.choices?.[0]?.message;
    if (!msg) return "";
    messages.push(msg);
    const calls = msg.tool_calls;
    if (!calls || !calls.length) return msg.content ?? "";
    for (const call of calls) {
      let result: string;
      try {
        const args = JSON.parse(call.function?.arguments || "{}");
        result = await runner.run(call.function.name, args);
      } catch (err: any) {
        result = `tool error: ${err.message}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  const data = await chat({ messages: [...messages, { role: "user", content: "Provide your final interpretation now, no more tools." }] });
  return data?.choices?.[0]?.message?.content ?? "";
}
