import { useEffect, useRef, useState } from "react";
import { Menu, UserCircle2, Copy } from "lucide-react";
import DogLoader from "../components/DogLoader";
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
  const [copied, setCopied] = useState<number | null>(null);

  const requestRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);

  const isEmpty = messages.length === 0 && !loading;

  useEffect(() => {
    let cancelled = false;

    if (!activeChatId) {
      setMessages([]);
      setLoading(false);
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
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, loadMessages]);

  const handleSend = async (message: string) => {
    const text = message.trim();

    if (!text || loading) return;

    const requestId = ++sessionRef.current;
    let chatId = activeChatId;

    const history = messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((current) => [
      ...current,
      { role: "user", content: text },
    ]);

    setLoading(true);

    try {
      if (!chatId) {
        chatId = await createChat(text.slice(0, 45) || "New chat");
      }

      if (!chatId || requestId !== sessionRef.current) return;

      await saveMessage(chatId, "user", text);

      if (requestId !== sessionRef.current) return;

      setActiveChatId(chatId);

      const controller = new AbortController();
      requestRef.current = controller;

      const timeout = window.setTimeout(() => {
        controller.abort();
      }, 8500);

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
        };

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(
            raw || `Invalid DOG response (${response.status})`
          );
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              `DOG server error (${response.status})`
          );
        }

        const answer = String(data.text || "").trim();

        if (!answer) {
          throw new Error("DOG returned an empty response.");
        }

        if (requestId !== sessionRef.current) return;

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
          // Keep visible error.
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

      {isEmpty && (
        <section className="hero-section">
          <DogLoader size={150} />

          <h1>What would you like to build?</h1>

          <p>
            Turn your ideas into something real.
          </p>

          <div className="hero-action">
            Write or edit
          </div>
        </section>
      )}

      {!isEmpty && (
        <section className="discussion-screen">
          <div className="discussion-messages">
            {messages.map((message, index) => (
              <div
                key={`${index}-${message.content.slice(0, 10)}`}
                className={`message-bubble ${message.role}`}
              >
                <div className="preview-label">
                  {message.role === "user" ? "You" : "DOG"}
                </div>

                <div className="preview-message">
                  {message.role === "assistant" ? (
                    formatText(message.content)
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>

                {message.role === "assistant" && (
                  <button
                    className="copy-response"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        message.content
                      );

                      setCopied(index);

                      window.setTimeout(
                        () => setCopied(null),
                        1200
                      );
                    }}
                  >
                    <Copy size={14} />
                    {copied === index ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            ))}

            {loading && (
              <div className="ai-loading">
                <DogLoader
                  size={72}
                  label="DOG is thinking…"
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section
        className={`chat-section ${
          !isEmpty ? "chat-section-active" : ""
        }`}
      >
        <ChatInput
          onSend={handleSend}
          disabled={loading}
        />
      </section>
    </div>
  );
      }
