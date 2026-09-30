import type { VercelRequest, VercelResponse } from "@vercel/node";

type Role = "user" | "assistant" | "system";
type ChatMessage = {
  role: Role;
  content: string;
};

type RequestBody = {
  message?: string;
  messages?: ChatMessage[];
  history?: ChatMessage[];
};

const SYSTEM_PROMPT = `You are DOG, a helpful AI assistant.

For normal questions, answer directly and clearly.

For coding requests:
- If the user's idea is incomplete, ask useful questions first.
- If the requirements are clear, provide working code.
- Help the user understand and improve their idea.
- Do not mention internal providers, model names, API keys, routing, or environment variables.

Use readable Markdown.`;

const REQUEST_TIMEOUT_MS = 15000;

function normalize(body: RequestBody): ChatMessage[] {
  const source =
    Array.isArray(body.messages) && body.messages.length
      ? body.messages
      : Array.isArray(body.history)
        ? body.history
        : [];

  const clean = source.filter(
    (item) =>
      item &&
      typeof item.content === "string" &&
      ["user", "assistant", "system"].includes(item.role)
  );

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  if (message) {
    const last = clean[clean.length - 1];

    if (
      !last ||
      last.role !== "user" ||
      last.content !== message
    ) {
      clean.push({
        role: "user",
        content: message,
      });
    }
  }

  return clean.slice(-20);
}

function openAIMessages(messages: ChatMessage[]) {
  return [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...messages.filter(
      (message) => message.role !== "system"
    ),
  ];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeout = REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "DOG AI request timed out. Please try again."
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readResponse(response: Response) {
  const raw = await response.text();

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      raw,
    };
  }
}

async function xai(messages: ChatMessage[]) {
  const key =
    process.env.XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "xAI/Grok API key is not configured."
    );
  }

  const model =
    process.env.XAI_TEXT_MODEL?.trim() ||
    process.env.GROK_TEXT_MODEL?.trim() ||
    "grok-4-1-fast-reasoning";

  const response = await fetchWithTimeout(
    "https://api.x.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: openAIMessages(messages),
        temperature: 0.4,
        max_tokens: 4096,
      }),
    }
  );

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error ||
        data?.raw ||
        `xAI request failed (${response.status})`
    );
  }

  const text =
    data?.choices?.[0]?.message?.content;

  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      "xAI returned an empty response."
    );
  }

  return text.trim();
}

async function customEngine(messages: ChatMessage[]) {
  const base =
    process.env.DOG_ENGINE_BASE_URL?.trim();

  const key =
    process.env.DOG_ENGINE_API_KEY?.trim();

  const model =
    process.env.DOG_ENGINE_MODEL?.trim();

  if (!base || !model) {
    throw new Error(
      "Custom DOG Engine is not configured."
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  const response = await fetchWithTimeout(
    `${base.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: openAIMessages(messages),
        temperature: 0.4,
        max_tokens: 4096,
      }),
    }
  );

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error ||
        data?.raw ||
        `DOG Engine failed (${response.status})`
    );
  }

  const text =
    data?.choices?.[0]?.message?.content;

  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      "DOG Engine returned an empty response."
    );
  }

  return text.trim();
}

async function gemini(messages: ChatMessage[]) {
  const key =
    process.env.GEMINI_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "Gemini API key is not configured."
    );
  }

  const model =
    process.env.GEMINI_TEXT_MODEL?.trim() ||
    "gemini-2.5-flash";

  const contents = messages
    .filter(
      (message) => message.role !== "system"
    )
    .map((message) => ({
      role:
        message.role === "assistant"
          ? "model"
          : "user",
      parts: [
        {
          text: message.content,
        },
      ],
    }));

  const response = await fetchWithTimeout(
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
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error ||
        data?.raw ||
        `Gemini failed (${response.status})`
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(
        (part: { text?: string }) =>
          part.text || ""
      )
      .join("") || "";

  if (!text.trim()) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  return text.trim();
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const body =
      (req.body || {}) as RequestBody;

    const messages = normalize(body);

    if (!messages.length) {
      return res.status(400).json({
        ok: false,
        error: "A message is required.",
      });
    }

    /*
     * Run configured engines independently.
     * The first successful response wins.
     */
    const providers = [
      {
        name: "xAI",
        run: () => xai(messages),
      },
      {
        name: "DOG Engine",
        run: () =>
          customEngine(messages),
      },
      {
        name: "Gemini",
        run: () => gemini(messages),
      },
    ];

    const errors: string[] = [];

    const result = await new Promise<{
      text: string;
    }>((resolve, reject) => {
      let remaining = providers.length;
      let settled = false;

      for (const provider of providers) {
        provider
          .run()
          .then((text) => {
            if (settled) return;

            settled = true;
            resolve({
              text,
            });
          })
          .catch((error) => {
            errors.push(
              `${provider.name}: ${
                error instanceof Error
                  ? error.message
                  : "Request failed"
              }`
            );

            remaining -= 1;

            if (
              remaining === 0 &&
              !settled
            ) {
              settled = true;

              reject(
                new Error(
                  errors.join(" | ")
                )
              );
            }
          });
      }
    });

    return res.status(200).json({
      ok: true,
      text: result.text,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "DOG could not get a response.",
    });
  }
        }
