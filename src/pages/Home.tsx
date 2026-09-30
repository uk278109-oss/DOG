import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Menu,
  Image as ImageIcon,
  Code2,
  Brain,
  UserCircle2,
  Copy,
  Plus,
  RotateCcw,
} from "lucide-react";

import DogLoader from "../components/DogLoader";
import ChatInput from "../components/ChatInput";
import { useAuth } from "../context/AuthContext";
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

export default function Home({
  onOpenMenu,
  onNavigate,
  onOpenAccount,
}: HomeProps) {
  const { user } = useAuth();

  const {
    memoryEnabled,
    activeChatId,
    setActiveChatId,
    createChat,
    loadMessages,
    saveMessage,
    chats,
  } = useApp();

  const [messages, setMessages] =
    useState<Msg[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [copied, setCopied] =
    useState<string | null>(null);

  const [newSession, setNewSession] =
    useState(true);

  const requestRef =
    useRef<AbortController | null>(null);

  const sessionRef =
    useRef(0);

  /*
   * Load a selected existing chat.
   */
  useEffect(() => {
    let cancelled = false;

    if (!activeChatId) {
      setMessages([]);
      setNewSession(true);
      return;
    }

    setNewSession(false);

    const run = async () => {
      try {
        const saved =
          await loadMessages(
            activeChatId
          );

        if (cancelled) return;

        setMessages(
          saved.map((message) => ({
            role: message.role,
            content: message.content,
          }))
        );
      } catch (error) {
        if (cancelled) return;

        setMessages([
          {
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : "DOG could not load this chat.",
          },
        ]);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    activeChatId,
    loadMessages,
  ]);

  /*
   * Start a genuinely fresh conversation.
   */
  const startNewChat = () => {
    sessionRef.current += 1;

    requestRef.current?.abort();
    requestRef.current = null;

    setLoading(false);
    setMessages([]);
    setCopied(null);
    setNewSession(true);
    setActiveChatId(null);
  };

  /*
   * Send message.
   *
   * Important:
   * 1. Show the message immediately.
   * 2. Create/save chat.
   * 3. Ask DOG.
   * 4. Show/save response.
   *
   * A Firebase/API failure must never erase
   * the user's message.
   */
  const handleSend = async (
    rawMessage: string
  ) => {
    const message = rawMessage.trim();

    if (!message || loading) return;

    const requestId =
      ++sessionRef.current;

    requestRef.current?.abort();

    /*
     * Immediately show the user's message.
     */
    setNewSession(false);

    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: message,
      },
    ]);

    setLoading(true);

    let chatId =
      activeChatId;

    try {
      /*
       * Create a chat only when needed.
       */
      if (!chatId) {
        chatId = await createChat(
          message.slice(0, 45) ||
            "New chat"
        );

        if (!chatId) {
          throw new Error(
            "DOG could not create the conversation."
          );
        }
      }

      if (
        requestId !==
        sessionRef.current
      ) {
        return;
      }

      /*
       * Save the user's message.
       */
      await saveMessage(
        chatId,
        "user",
        message
      );

      if (
        requestId !==
        sessionRef.current
      ) {
        return;
      }

      /*
       * Now make this chat active.
       */
      setActiveChatId(chatId);

      /*
       * Include the message being sent.
       * Do not depend on React state having updated yet.
       */
      const currentHistory =
        messages.slice(-12);

      const history = [
        ...currentHistory,
        {
          role: "user" as const,
          content: message,
        },
      ];

      const controller =
        new AbortController();

      requestRef.current =
        controller;

      const timeout =
        window.setTimeout(() => {
          controller.abort();
        }, 30000);

      try {
        const response =
          await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              message,
              history,
            }),
            signal:
              controller.signal,
          });

        const raw =
          await response.text();

        let data: any = {};

        if (raw.trim()) {
          try {
            data = JSON.parse(raw);
          } catch {
            throw new Error(
              raw.trim().slice(0, 1000)
            );
          }
        }

        if (!response.ok) {
          throw new Error(
            data?.error ||
              data?.message ||
              `DOG server error (${response.status}).`
          );
        }

        const answer =
          typeof data?.text ===
          "string"
            ? data.text.trim()
            : "";

        if (!answer) {
          throw new Error(
            "DOG returned an empty response."
          );
        }

        /*
         * Put the complete answer into the UI
         * immediately. No artificial typing delay
         * can make the app look stuck.
         */
        if (
          requestId ===
          sessionRef.current
        ) {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: answer,
            },
          ]);
        }

        /*
         * Save DOG response.
         */
        await saveMessage(
          chatId,
          "assistant",
          answer
        );
      } finally {
        window.clearTimeout(
          timeout
        );
      }
    } catch (error) {
      if (
        requestId !==
        sessionRef.current
      ) {
        return;
      }

      let errorMessage =
        "DOG could not get a response.";

      if (
        error instanceof Error
      ) {
        if (
          error.name ===
          "AbortError"
        ) {
          errorMessage =
            "DOG took too long to respond. Please try again.";
        } else {
          errorMessage =
            error.message;
        }
      }

      /*
       * Never hide the user's message.
       * Show the actual error in the chat.
       */
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: errorMessage,
        },
      ]);

      /*
       * If a chat was created, also save
       * the error so refresh doesn't make
       * the conversation look empty.
       */
      if (chatId) {
        try {
          await saveMessage(
            chatId,
            "assistant",
            errorMessage
          );
        } catch {
          // UI already contains the error.
        }
      }
    } finally {
      if (
        requestId ===
        sessionRef.current
      ) {
        setLoading(false);
        requestRef.current = null;
      }
    }
  };

  const activeTitle =
    chats.find(
      (chat) =>
        chat.id === activeChatId
    )?.title ||
    "New discussion";

  const inChat = !newSession;

  const formatText = (
    text: string
  ) => {
    return text
      .split(
        /(```[\s\S]*?```)/g
      )
      .map((part, index) => {
        if (
          part.startsWith("```")
        ) {
          return (
            <pre key={index}>
              {part
                .replace(
                  /^```\w*\n?/,
                  ""
                )
                .replace(
                  /```$/,
                  ""
                )}
            </pre>
          );
        }

        return part
          .split(/\n\n+/)
          .map((paragraph, i) => (
            <p
              key={`${index}-${i}`}
            >
              {paragraph
                .replace(
                  /^###\s+/gm,
                  ""
                )
                .replace(
                  /^##\s+/gm,
                  ""
                )
                .replace(
                  /^#\s+/gm,
                  ""
                )}
            </p>
          ));
      });
  };

  return (
    <div
      className={`home ${
        inChat
          ? "chat-active"
          : "home-idle"
      }`}
    >
      <header className="mobile-header">
        <button
          className="menu-button"
          onClick={onOpenMenu}
          aria-label="Open menu"
        >
          <Menu size={25} />
        </button>

        <div className="mobile-brand">
          DOG
        </div>

        <button
          className="mobile-profile-button"
          onClick={onOpenAccount}
          aria-label="Open account"
        >
          <UserCircle2 size={25} />
        </button>
      </header>

      {!inChat && (
        <>
          <section className="feature-section">
            <button
              className="feature-card compact-feature"
              onClick={() =>
                onNavigate("images")
              }
            >
              <div className="feature-icon">
                <ImageIcon size={26} />
              </div>

              <div className="feature-title">
                Image Creation
              </div>
            </button>

            <button
              className="feature-card compact-feature"
              onClick={() =>
                onNavigate("code")
              }
            >
              <div className="feature-icon">
                <Code2 size={26} />
              </div>

              <div className="feature-title">
                Code Builder
              </div>
            </button>
          </section>

          <section className="hero-section">
            <DogLoader size={92} />

            <h1>
              Hello,{" "}
              {user?.displayName?.split(
                " "
              )[0] || "there"}
              .
              <br />
              What are you building?
            </h1>

            {memoryEnabled && (
              <div className="memory-hint">
                <Brain size={16} />
                Memory is on
              </div>
            )}
          </section>
        </>
      )}

      {inChat && (
        <section className="discussion-screen">
          <div className="discussion-head">
            <strong>
              {activeTitle}
            </strong>

            <button
              onClick={startNewChat}
            >
              <Plus size={16} />
              New discussion
            </button>
          </div>

          <div className="discussion-messages">
            {messages.map(
              (message, index) => (
                <div
                  className={`message-bubble ${message.role}`}
                  key={`${index}-${message.content.slice(
                    0,
                    10
                  )}`}
                >
                  <div className="preview-label">
                    {message.role ===
                    "user"
                      ? "You"
                      : "DOG"}
                  </div>

                  <div className="preview-message">
                    {message.role ===
                    "assistant" ? (
                      formatText(
                        message.content
                      )
                    ) : (
                      <p>
                        {
                          message.content
                        }
                      </p>
                    )}
                  </div>

                  {message.role ===
                    "assistant" && (
                    <button
                      className="copy-response"
                      onClick={() => {
                        void navigator.clipboard?.writeText(
                          message.content
                        );

                        setCopied(
                          String(index)
                        );

                        window.setTimeout(
                          () =>
                            setCopied(
                              null
                            ),
                          1200
                        );
                      }}
                    >
                      <Copy size={14} />

                      {copied ===
                      String(index)
                        ? "Copied"
                        : "Copy"}
                    </button>
                  )}
                </div>
              )
            )}

            {loading && (
              <div className="ai-loading">
                <DogLoader
                  size={46}
                  label="DOG is thinking…"
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section
        className={`chat-section ${
          inChat
            ? "chat-section-active"
            : ""
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
