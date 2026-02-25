"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

type ConnectionStatus = "idle" | "streaming" | "error";

const STORAGE_KEY = "clawos-chat-conversations";
const MAX_CONVERSATIONS = 50;

interface StoredConversation {
  id: string;
  title: string;
  messages: { id: string; role: "user" | "assistant"; content: string; timestamp: string }[];
  createdAt: string;
}

function saveToStorage(conversations: Conversation[]) {
  try {
    const serialized: StoredConversation[] = conversations.slice(0, MAX_CONVERSATIONS).map((c) => ({
      id: c.id,
      title: c.title,
      messages: c.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      })),
      createdAt: c.createdAt.toISOString(),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch { /* storage full or unavailable */ }
}

function loadFromStorage(): { conversations: Conversation[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { conversations: [], activeId: null };
    const stored: StoredConversation[] = JSON.parse(raw);
    const conversations: Conversation[] = stored.map((c) => ({
      id: c.id,
      title: c.title,
      messages: c.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      })),
      createdAt: new Date(c.createdAt),
    }));
    return { conversations, activeId: conversations.length > 0 ? conversations[0].id : null };
  } catch {
    return { conversations: [], activeId: null };
  }
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [showAllChats, setShowAllChats] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Ref-based accumulator so rapid SSE chunks don't lose data through React batching
  const fullTextRef = useRef("");

  const activeConversation = conversations.find((c) => c.id === activeId);
  const messages = activeConversation?.messages || [];
  const pastConversations = conversations.filter((c) => c.id !== activeId);
  const visiblePast = showAllChats ? pastConversations : pastConversations.slice(0, 5);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const { conversations: loaded, activeId: loadedActiveId } = loadFromStorage();
    if (loaded.length > 0) {
      setConversations(loaded);
      setActiveId(loadedActiveId);
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage whenever conversations change (after hydration)
  useEffect(() => {
    if (hydrated) {
      saveToStorage(conversations);
    }
  }, [conversations, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  function newChat() {
    if (abortRef.current) abortRef.current.abort();
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: "New conversation",
      messages: [],
      createdAt: new Date(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setStatus("idle");
    setInput("");
  }

  function switchChat(id: string) {
    // Don't abort — let background stream complete
    setActiveId(id);
    setStatus("idle");
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || status === "streaming") return;

    // Ensure we have an active conversation
    let convId = activeId;
    if (!convId) {
      const conv: Conversation = {
        id: crypto.randomUUID(),
        title: text.slice(0, 40),
        messages: [],
        createdAt: new Date(),
      };
      setConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      setActiveId(convId);
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date() };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "", timestamp: new Date() };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const title = c.messages.length === 0 ? text.slice(0, 40) : c.title;
        return { ...c, title, messages: [...c.messages, userMsg, assistantMsg] };
      })
    );
    setInput("");
    setStatus("streaming");
    fullTextRef.current = "";

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      // Buffer for incomplete SSE lines split across chunks
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value, { stream: true });
        sseBuffer += raw;

        // Process complete lines only
        const lines = sseBuffer.split("\n");
        // Keep the last (possibly incomplete) line in the buffer
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk") {
              fullTextRef.current += data.text;
              updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
            } else if (data.type === "done") {
              // Always prefer the full output from the done event
              // This catches cases where chunks were missed or incomplete
              if (data.output) {
                const finalText = data.output.trim();
                if (finalText && finalText.length >= fullTextRef.current.length) {
                  fullTextRef.current = finalText;
                }
              }
              updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
            } else if (data.type === "error") {
              fullTextRef.current += `\n\n*Error: ${data.text}*`;
              updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
            }
          } catch { /* skip unparseable lines */ }
        }
      }

      // Process any remaining buffer
      if (sseBuffer.startsWith("data: ")) {
        try {
          const data = JSON.parse(sseBuffer.slice(6));
          if (data.type === "chunk") {
            fullTextRef.current += data.text;
          } else if (data.type === "done" && data.output) {
            const finalText = data.output.trim();
            if (finalText && finalText.length >= fullTextRef.current.length) {
              fullTextRef.current = finalText;
            }
          }
          updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
        } catch { /* skip */ }
      }

      if (!fullTextRef.current) {
        updateAssistantMsg(convId!, assistantMsg.id, "*No response. Is the gateway running?*");
      }
      setStatus("idle");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") { setStatus("idle"); return; }
      setStatus("error");
      updateAssistantMsg(convId!, assistantMsg.id,
        fullTextRef.current
          ? fullTextRef.current + `\n\n*Connection closed: ${err instanceof Error ? err.message : "Unknown"}*`
          : `*Connection error: ${err instanceof Error ? err.message : "Unknown"}*`
      );
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  function updateAssistantMsg(convId: string, msgId: string, content: string) {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        return { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, content } : m)) };
      })
    );
  }

  function clearConversation() {
    if (abortRef.current) abortRef.current.abort();
    if (activeId) {
      setConversations((prev) => prev.filter((c) => c.id !== activeId));
    }
    setActiveId(null);
    setStatus("idle");
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-8">
      {/* Chat history sidebar */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-800">
          <button onClick={newChat} className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeConversation && (
            <button
              onClick={() => switchChat(activeConversation.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm bg-gray-800 text-white truncate"
            >
              {activeConversation.title || "New conversation"}
            </button>
          )}
          {visiblePast.length > 0 && (
            <div className="pt-2 mt-2 border-t border-gray-800">
              <div className="px-3 text-xs text-gray-500 mb-1">Previous</div>
              {visiblePast.map((c) => (
                <button
                  key={c.id}
                  onClick={() => switchChat(c.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white truncate transition-colors"
                >
                  {c.title}
                </button>
              ))}
              {pastConversations.length > 5 && !showAllChats && (
                <button onClick={() => setShowAllChats(true)} className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300">
                  Show {pastConversations.length - 5} more...
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div>
              <h1 className="font-semibold">Chat with Tom</h1>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className={`w-2 h-2 rounded-full ${status === "streaming" ? "bg-blue-400 animate-pulse" : status === "error" ? "bg-red-400" : "bg-green-400"}`} />
                {status === "streaming" ? "Tom is thinking..." : status === "error" ? "Connection error" : "Ready"}
              </div>
            </div>
          </div>
          <button onClick={clearConversation} className="text-xs px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            Clear conversation
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="text-5xl mb-4">🚀</div>
                <h2 className="text-lg font-medium text-gray-300 mb-2">Chat with Tom</h2>
                <p className="text-sm max-w-md">Tom is the master orchestrator. Ask him anything — he can delegate to specialist agents.</p>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${msg.role === "user" ? "bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3" : "bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md px-4 py-3"}`}>
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
                    <span>🚀</span><span className="font-medium">Tom</span>
                  </div>
                )}
                <div className="text-sm prose prose-invert prose-sm max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:rounded-lg [&_code]:text-blue-300">
                  {msg.role === "assistant" ? (
                    msg.content ? <ReactMarkdown>{msg.content}</ReactMarkdown> : (
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
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Message Tom... (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none max-h-32"
              style={{ minHeight: "48px" }}
            />
            <button onClick={sendMessage} disabled={!input.trim() || status === "streaming"} className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors whitespace-nowrap">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
