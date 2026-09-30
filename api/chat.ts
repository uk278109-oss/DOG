import type { VercelRequest, VercelResponse } from "@vercel/node";

const REQUEST_TIMEOUT_MS = 8000;

type Message = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `
You are DOG, a helpful AI assistant.

For coding requests:
- If requirements are unclear, ask the necessary question.
- If requirements are clear, provide working code.
- Be practical and direct.

Never mention internal providers, API keys,
routing, environment variables, or backend implementation.
`.trim();

function getMessages(body: any): Message[] {
  const history = Array.isArray(body?.history)
    ? body.history
        .filter(
          (m: any) =>
            m &&
            (m.role === "user" ||
              m.role === "assistant") &&
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

  return history.slice(-20);
}

function timeoutController() {
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  return controller;
}

async function askGrok(
  messages: Message[],
  controller: AbortController
) {
  const key =
    process.env.XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim();

  if (!key) {
    throw new Error("Grok API key is not configured.");
  }

  const response = await fetch(
    "https://api.x.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:
          process.env.XAI_TEXT_MODEL?.trim() ||
          process.env.GROK_TEXT_MODEL?.trim() ||
          "grok-beta",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          ...messages,
        ],
        temperature: 0.4,
      }),
      signal: controller.signal,
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Grok returned ${response.status}`
    );
  }

  const text = String(
    data?.choices?.[0]?.message?.content || ""
  ).trim();

  if (!text) {
    throw new Error("Grok returned an empty response.");
  }

  return text;
}

async function askGemini(
  messages: Message[],
  controller: AbortController
) {
  const key = process.env.GEMINI_API_KEY?.trim();

  if (!key) {
    throw new Error("Gemini API key is not configured.");
  }

  const model =
    process.env.GEMINI_TEXT_MODEL?.trim() ||
    "gemini-1.5-flash";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_PROMPT,
            },
          ],
        },
        contents: messages.map((m) => ({
          role:
            m.role === "assistant"
              ? "model"
              : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: 0.4,
        },
      }),
      signal: controller.signal,
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Gemini returned ${response.status}`
    );
  }

  const text = String(
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || "")
      .join("") || ""
  ).trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

async function raceProviders(messages: Message[]) {
  const grokController = timeoutController();
  const geminiController = timeoutController();

  return new Promise<string>((resolve, reject) => {
    let failures = 0;
    let finished = false;

    const errors: string[] = [];

    const success = (text: string) => {
      if (finished) return;

      finished = true;

      // Stop losing request immediately.
      grokController.abort();
      geminiController.abort();

      resolve(text);
    };

    const failure = (error: unknown) => {
      if (finished) return;

      failures++;

      errors.push(
        error instanceof Error
          ? error.message
          : "Provider failed."
      );

      if (failures === 2) {
        finished = true;

        reject(
          new Error(
            errors.join(" | ") ||
              "DOG could not get a response."
          )
        );
      }
    };

    void askGrok(messages, grokController)
      .then(success)
      .catch(failure);

    void askGemini(messages, geminiController)
      .then(success)
      .catch(failure);
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed.",
    });
  }

  try {
    const messages = getMessages(req.body);

    if (!messages.length) {
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
        ? error.name === "AbortError"
          ? "DOG timed out. Please try again."
          : error.message
        : "DOG could not get a response.";

    return res.status(502).json({
      ok: false,
      error: message,
    });
  }
        }
