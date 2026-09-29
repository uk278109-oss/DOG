import type { VercelRequest, VercelResponse } from "@vercel/node";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };
type RequestBody = { message?: string; messages?: ChatMessage[]; history?: ChatMessage[] };

const SYSTEM_PROMPT = `You are DOG, a helpful AI assistant. For coding requests, collaborate first when requirements are unclear, then provide accurate working code. Use readable markdown. Never mention internal providers, APIs, routing, model names, or environment variables.`;
const REQUEST_TIMEOUT_MS = 25000;

function normalize(body: RequestBody): ChatMessage[] {
  const history = Array.isArray(body.messages) && body.messages.length ? body.messages : (Array.isArray(body.history) ? body.history : []);
  const clean = history.filter(m => m && typeof m.content === "string" && ["user", "assistant", "system"].includes(m.role));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message) {
    const last = clean[clean.length - 1];
    if (!last || last.role !== "user" || last.content !== message) clean.push({ role: "user", content: message });
  }
  return clean.slice(-20);
}

function payload(messages: ChatMessage[]) {
  return [{ role: "system", content: SYSTEM_PROMPT }, ...messages.filter(m => m.role !== "system")];
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("DOG Engine timed out while waiting for an AI response.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return {} as any;
  try { return JSON.parse(raw); } catch { return { raw }; }
}

async function xai(messages: ChatMessage[]) {
  const key = (process.env.XAI_API_KEY || process.env.GROK_API_KEY)?.trim();
  if (!key) throw new Error("DOG Engine is not configured.");
  const model = (process.env.XAI_TEXT_MODEL || process.env.GROK_TEXT_MODEL)?.trim() || "grok-4-1-fast-reasoning";
  const response = await fetchWithTimeout("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: payload(messages), temperature: 0.4, max_tokens: 8192 })
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(`DOG Engine ${response.status}: ${data?.error?.message || data?.raw || "Request failed"}`);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("DOG Engine returned an empty response.");
  return text;
}

async function openAICompatible(messages: ChatMessage[]) {
  const base = process.env.DOG_ENGINE_BASE_URL?.trim();
  const key = process.env.DOG_ENGINE_API_KEY?.trim();
  const model = process.env.DOG_ENGINE_MODEL?.trim();
  if (!base || !model) throw new Error("DOG Engine endpoint is not configured.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await fetchWithTimeout(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: payload(messages), temperature: 0.4, max_tokens: 8192 })
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(`DOG Engine ${response.status}: ${data?.error?.message || data?.raw || "Request failed"}`);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("DOG Engine returned an empty response.");
  return text;
}

async function gemini(messages: ChatMessage[]) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("DOG Engine is not configured.");
  const model = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-flash";
  const contents = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 8192 } })
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(`DOG Engine ${response.status}: ${data?.error?.message || data?.raw || "Request failed"}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  if (!text.trim()) throw new Error("DOG Engine returned an empty response.");
  return text;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const messages = normalize((req.body || {}) as RequestBody);
    if (!messages.length) return res.status(400).json({ ok: false, error: "A message is required." });

    const errors: string[] = [];
    for (const [name, fn] of [["xAI", xai], ["DOG Engine", openAICompatible], ["Gemini", gemini]] as const) {
      try {
        const text = await fn(messages);
        return res.status(200).json({ ok: true, text });
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : "Request failed"}`);
      }
    }
    return res.status(502).json({ ok: false, error: errors.join(" | ") || "DOG could not get a response." });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message : "DOG could not get a response." });
  }
}
