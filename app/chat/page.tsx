"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type ConnectionStatus = "idle" | "streaming" | "error";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || status === "streaming") return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStatus("streaming");

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk") {
              fullText += data.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: fullText } : m
                )
              );
            } else if (data.type === "done" && data.output && !fullText) {
              fullText = data.output;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: fullText } : m
                )
              );
            } else if (data.type === "error") {
              fullText += `\n\n*Error: ${data.text}*`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: fullText } : m
                )
              );
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      if (!fullText) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "*No response received. Is the gateway running?*" }
              : m
          )
        );
      }

      setStatus("idle");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: `*Connection error: ${err instanceof Error ? err.message : "Unknown error"}. Make sure the gateway is running.*`,
              }
            : m
        )
      );
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  function clearConversation() {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setStatus("idle");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚀</span>
          <div>
            <h1 className="font-semibold">Chat with Tom</h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === "streaming"
                    ? "bg-blue-400 animate-pulse"
                    : status === "error"
                      ? "bg-red-400"
                      : "bg-green-400"
                }`}
              />
              {status === "streaming"
                ? "Tom is thinking..."
                : status === "error"
                  ? "Connection error"
                  : "Ready"}
            </div>
          </div>
        </div>
        <button
          onClick={clearConversation}
          className="text-xs px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          Clear conversation
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <div className="text-5xl mb-4">🚀</div>
              <h2 className="text-lg font-medium text-gray-300 mb-2">
                Chat with Tom
              </h2>
              <p className="text-sm max-w-md">
                Tom is the master orchestrator of ClawOS. Ask him anything — he
                can delegate to specialist agents as needed.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3"
                  : "bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md px-4 py-3"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
                  <span>🚀</span>
                  <span className="font-medium">Tom</span>
                </div>
              )}
              <div className="text-sm prose prose-invert prose-sm max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:rounded-lg [&_code]:text-blue-300">
                {msg.role === "assistant" ? (
                  msg.content ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                    </span>
                  )
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Tom... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none max-h-32"
            style={{ minHeight: "48px" }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || status === "streaming"}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors whitespace-nowrap"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
