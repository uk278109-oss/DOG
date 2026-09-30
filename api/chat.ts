import type { VercelRequest, VercelResponse } from "@vercel/node";

const REQUEST_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `
You are DOG, a helpful AI assistant.

Never mention internal providers, routing, API keys, environment variables,
or which model generated the response.

For coding requests:
- If requirements are incomplete, ask the useful clarification questions first.
- If requirements are clear, provide working code.
- Keep answers practical and direct.
`.trim();

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function normalizeMessages(body: any): ChatMessage[] {
  const history = Array.isArray(body?.history)
    ? body.history
        .filter(
          (m: any) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim()
        )
        .map((m: any) => ({
          role: m.role,
          content: m.content.trim(),
        }))
    : [];

  const message =
    typeof body?.message === "string"
      ? body.message.trim()
      : "";

  if (message) {
    const last = history[history.length - 1];

    if (
      !last ||
      last.role !== "user" ||
      last.content !== message
    ) {
      history.push({
        role: "user",
        content: message,
      });
    }
  }

  return [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...history.slice(-20),
  ];
}

async function xaiRequest(
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;

  if (!apiKey) {
    throw new Error("DOG API key is not configured.");
  }

  const response = await fetch(
    "https://api.x.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:
          process.env.XAI_TEXT_MODEL ||
          process.env.GROK_TEXT_MODEL ||
          "grok-beta",
        messages,
        temperature: 0.7,
      }),
      signal,
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error ||
        `DOG provider returned ${response.status}`
    );
  }

  const text = String(
    data?.choices?.[0]?.message?.content || ""
  ).trim();

  if (!text) {
    throw new Error("Empty DOG response.");
  }

  return text;
}

async function geminiRequest(
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("DOG API key is not configured.");
  }

  const system = messages.find(
    (m) => m.role === "system"
  )?.content;

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const model =
    process.env.GEMINI_TEXT_MODEL ||
    "gemini-1.5-flash";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: system
          ? {
              parts: [{ text: system }],
            }
          : undefined,
        contents,
        generationConfig: {
          temperature: 0.7,
        },
      }),
      signal,
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `DOG provider returned ${response.status}`
    );
  }

  const text = String(
    data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text || "")
      .join("") || ""
  ).trim();

  if (!text) {
    throw new Error("Empty DOG response.");
  }

  return text;
}

async function raceProviders(
  messages: ChatMessage[]
): Promise<string> {
  const controllers = [
    new AbortController(),
    new AbortController(),
  ];

  const providers = [
    xaiRequest(messages, controllers[0].signal),
    geminiRequest(messages, controllers[1].signal),
  ];

  return new Promise<string>((resolve, reject) => {
    let failures = 0;
    let finished = false;
    const errors: string[] = [];

    const timer = setTimeout(() => {
      if (finished) return;

      finished = true;
      controllers.forEach((controller) => controller.abort());

      reject(
        new Error(
          "DOG timed out. Please try again."
        )
      );
    }, REQUEST_TIMEOUT_MS);

    providers.forEach((promise) => {
      promise
        .then((text) => {
          if (finished) return;

          finished = true;
          clearTimeout(timer);

          // First successful provider wins.
          // Stop the other request to avoid unnecessary usage.
          controllers.forEach((controller) => {
            controller.abort();
          });

          resolve(text);
        })
        .catch((error) => {
          if (finished) return;

          failures++;

          errors.push(
            error instanceof Error
              ? error.message
              : "Provider failed."
          );

          if (failures === providers.length) {
            finished = true;
            clearTimeout(timer);

            reject(
              new Error(
                errors.join(" | ") ||
                  "DOG could not get a response."
              )
            );
          }
        });
    });
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed.",
    });
  }

  try {
    const messages = normalizeMessages(req.body);

    const hasUserMessage = messages.some(
      (m) => m.role === "user" && m.content.trim()
    );

    if (!hasUserMessage) {
      return res.status(400).json({
        ok: false,
        error: "Message is required.",
      });
    }

    const text = await raceProviders(messages);

    return res.status(200).json({
      ok: true,
      text,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "DOG could not get a response.";

    return res.status(502).json({
      ok: false,
      error: message,
    });
  }
    }
