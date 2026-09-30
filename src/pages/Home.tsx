import { useEffect, useRef, useState } from "react";
import { Menu, UserCircle2, Copy } from "lucide-react";
import ChatInput from "../components/ChatInput";
import { useApp } from "../context/AppContext";
import type { AppPage } from "../types";

interface HomeProps {
  onOpenMenu: () => void;
  onNavigate: (page: AppPage) => void;
  onOpenAccount: () => void;
}

type Msg = {
  role: "user" | "assistant";
  content: string;
};

function formatText(text: string) {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) =>
      part.startsWith("```") ? (
        <pre key={i}>
          {part.replace(/^```\w*\n?/, "").replace(/```$/, "")}
        </pre>
      ) : (
        part
          .split(/\n\n+/)
          .filter(Boolean)
          .map((p, j) => (
            <p key={`${i}-${j}`}>
              {p
                .replace(/^###\s+/gm, "")
                .replace(/^##\s+/gm, "")
                .replace(/^#\s+/gm, "")}
            </p>
          ))
      )
    );
}

export default function Home({
  onOpenMenu,
  onOpenAccount,
}: HomeProps) {
  const {
    activeChatId,
    setActiveChatId,
    createChat,
    loadMessages,
    saveMessage,
  } = useApp();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const requestRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    if (!activeChatId) {
      setMessages([]);
      setLoading(false);
      setCopied(null);
      setInputKey((v) => v + 1);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const saved = await loadMessages(activeChatId);

        if (!cancelled) {
          setMessages(
            saved.map((m) => ({
              role: m.role,
              content: m.content,
            }))
          );
          setInputKey((v) => v + 1);
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, loadMessages]);

  const startNewChat = () => {
    sessionRef.current += 1;

    requestRef.current?.abort();
    requestRef.current = null;

    setLoading(false);
    setMessages([]);
    setCopied(null);

    // Forces ChatInput to remount and clear its internal text.
    setInputKey((v) => v + 1);

    setActiveChatId(null);
  };

  const handleSend = async (message: string) => {
    const text = message.trim();

    if (!text || loading) return;

    const requestId = ++sessionRef.current;

    // Immediately clear ChatInput.
    setInputKey((v) => v + 1);

    let chatId = activeChatId;

    const history = messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Show YOU message immediately.
    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: text,
      },
    ]);

    setLoading(true);

    try {
      if (!chatId) {
        chatId = await createChat(text.slice(0, 45) || "New chat");
      }

      if (!chatId || requestId !== sessionRef.current) return;

      // Save YOU message.
      await saveMessage(chatId, "user", text);

      if (requestId !== sessionRef.current) return;

      setActiveChatId(chatId);

      const controller = new AbortController();
      requestRef.current = controller;

      const timeout = window.setTimeout(() => {
        controller.abort();
      }, 9000);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            message: text,
            history,
          }),
          signal: controller.signal,
        });

        const raw = await response.text();

        let data: {
          ok?: boolean;
          text?: string;
          error?: string;
        } = {};

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(
            raw.trim() ||
              `DOG server returned an invalid response (${response.status}).`
          );
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              `DOG could not get a response (${response.status}).`
          );
        }

        const answer = String(data.text || "").trim();

        if (!answer) {
          throw new Error("DOG returned an empty response.");
        }

        if (requestId !== sessionRef.current) return;

        // Show DOG response immediately.
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: answer,
          },
        ]);

        await saveMessage(chatId, "assistant", answer);
      } finally {
        window.clearTimeout(timeout);

        if (requestRef.current === controller) {
          requestRef.current = null;
        }
      }
    } catch (error) {
      if (requestId !== sessionRef.current) return;

      const errorText =
        error instanceof Error
          ? error.name === "AbortError"
            ? "DOG request timed out. Please try again."
            : error.message
          : "DOG could not get a response.";

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: errorText,
        },
      ]);

      if (chatId) {
        try {
          await saveMessage(chatId, "assistant", errorText);
        } catch {
          // Keep the error visible even if saving fails.
        }
      }
    } finally {
      if (requestId === sessionRef.current) {
        setLoading(false);
        requestRef.current = null;
      }
    }
  };

  return (
    <div className="home chat-active">
      <header className="mobile-header">
        <button
          className="menu-button"
          onClick={onOpenMenu}
          aria-label="Open menu"
        >
          <Menu size={25} />
        </button>

        <div />

        <button
          className="mobile-profile-button"
          onClick={onOpenAccount}
          aria-label="Open account"
        >
          <UserCircle2 size={25} />
        </button>
      </header>

      <section className="discussion-screen">
        <div className="discussion-messages">
          {messages.map((m, i) => (
            <div
              className={`message-bubble ${m.role}`}
              key={`${i}-${m.content.slice(0, 12)}`}
            >
              <div className="preview-label">
                {m.role === "user" ? "You" : "DOG"}
              </div>

              <div className="preview-message">
                {m.role === "assistant" ? (
                  formatText(m.content)
                ) : (
                  <p>{m.content}</p>
                )}
              </div>

              {m.role === "assistant" && (
                <button
                  className="copy-response"
                  onClick={() => {
                    void navigator.clipboard?.writeText(m.content);
                    setCopied(String(i));

                    window.setTimeout(
                      () => setCopied(null),
                      1200
                    );
                  }}
                >
                  <Copy size={14} />
                  {copied === String(i) ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          ))}

          {loading && (
            <div className="ai-loading">
              <div className="preview-label">DOG</div>
              <div className="preview-message">
                DOG is thinking…
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="chat-section chat-section-active">
        <ChatInput
          key={`${activeChatId ?? "new"}-${inputKey}`}
          onSend={handleSend}
          disabled={loading}
        />
      </section>
    </div>
  );
         }
