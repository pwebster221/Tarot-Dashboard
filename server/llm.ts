// server/llm.ts — single-shot completion against the LiteLLM OpenAI-compatible API.

export async function callLiteLLM(system: string, user: string): Promise<string> {
  const base = process.env.LITELLM_BASE;
  const key = process.env.LITELLM_API_KEY;
  if (!base || !key) {
    throw new Error("LITELLM_BASE and LITELLM_API_KEY must be set");
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "alder-1-0",
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
