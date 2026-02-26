"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: "image" | "document" | "text" | "spreadsheet";
  mimeType: string;
  path: string;
  extractedText: string | null;
  previewUrl?: string; // local object URL for image preview
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  files?: FileAttachment[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  sessionId: string;
}

type ConnectionStatus = "idle" | "streaming" | "waiting" | "error";

const STORAGE_KEY = "clawos-chat-conversations";
const MAX_CONVERSATIONS = 50;

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  files?: FileAttachment[];
}
interface StoredConversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: string;
  sessionId: string;
}

function saveToStorage(conversations: Conversation[]) {
  try {
    const serialized: StoredConversation[] = conversations
      .slice(0, MAX_CONVERSATIONS)
      .map((c) => ({
        id: c.id,
        title: c.title,
        messages: c.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
          files: m.files?.map((f) => ({ ...f, previewUrl: undefined })),
        })),
        createdAt: c.createdAt.toISOString(),
        sessionId: c.sessionId,
      }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    /* storage full or unavailable */
  }
}

function loadFromStorage(): {
  conversations: Conversation[];
  activeId: string | null;
} {
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
        files: m.files,
      })),
      createdAt: new Date(c.createdAt),
      sessionId: c.sessionId || crypto.randomUUID(),
    }));
    return {
      conversations,
      activeId: conversations.length > 0 ? conversations[0].id : null,
    };
  } catch {
    return { conversations: [], activeId: null };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICON: Record<string, string> = {
  image: "🖼️",
  document: "📄",
  text: "📝",
  spreadsheet: "📊",
};

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [showAllChats, setShowAllChats] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullTextRef = useRef("");

  const activeConversation = conversations.find((c) => c.id === activeId);
  const messages = activeConversation?.messages || [];
  const pastConversations = conversations.filter((c) => c.id !== activeId);
  const visiblePast = showAllChats
    ? pastConversations
    : pastConversations.slice(0, 5);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    const { conversations: loaded, activeId: loadedActiveId } =
      loadFromStorage();
    if (loaded.length > 0) {
      setConversations(loaded);
      setActiveId(loadedActiveId);
    }
    setHydrated(true);
  }, []);

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

  const updateAssistantMsg = useCallback(
    (convId: string, msgId: string, content: string) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === msgId ? { ...m, content } : m
            ),
          };
        })
      );
    },
    []
  );

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startFollowUpPolling(
    convId: string,
    msgId: string,
    baseline: number,
    sessionId: string
  ) {
    stopPolling();
    setStatus("waiting");

    let currentBaseline = baseline;
    let lastActivity = Date.now();
    const startTime = Date.now();
    const MAX_TOTAL_MS = 90_000;
    const IDLE_TIMEOUT_MS = 30_000;
    let separatorAdded = false;

    pollRef.current = setInterval(async () => {
      if (
        Date.now() - startTime > MAX_TOTAL_MS ||
        Date.now() - lastActivity > IDLE_TIMEOUT_MS
      ) {
        stopPolling();
        setStatus("idle");
        return;
      }

      try {
        const res = await fetch(
          `/api/chat/follow-ups?baseline=${currentBaseline}&sessionId=${encodeURIComponent(sessionId)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        if (data.messages && data.messages.length > 0) {
          if (!separatorAdded) {
            fullTextRef.current += "\n\n---\n\n";
            separatorAdded = true;
          }
          for (const msg of data.messages) {
            fullTextRef.current += msg + "\n\n";
          }
          updateAssistantMsg(convId, msgId, fullTextRef.current);
          lastActivity = Date.now();
        }

        if (data.lineCount) {
          currentBaseline = data.lineCount;
        }
      } catch {
        // keep trying
      }
    }, 3000);
  }

  // --- File upload ---

  async function uploadFile(file: File): Promise<FileAttachment | null> {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Upload failed");
        return null;
      }
      const data = await res.json();
      const attachment: FileAttachment = {
        id: data.id,
        name: data.name,
        size: data.size,
        type: data.type,
        mimeType: data.mimeType,
        path: data.path,
        extractedText: data.extractedText,
      };

      // Create local preview URL for images
      if (attachment.type === "image") {
        attachment.previewUrl = URL.createObjectURL(file);
      }

      return attachment;
    } catch {
      alert("Upload failed");
      return null;
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    const results = await Promise.all(fileArray.map(uploadFile));
    const successful = results.filter(Boolean) as FileAttachment[];
    if (successful.length > 0) {
      setPendingFiles((prev) => [...prev, ...successful]);
    }
    setUploading(false);
  }

  function removePendingFile(id: string) {
    setPendingFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  // --- Build message text with file content ---

  function buildMessageWithFiles(
    text: string,
    files: FileAttachment[]
  ): string {
    if (files.length === 0) return text;

    const parts: string[] = [];
    if (text) parts.push(text);

    for (const f of files) {
      if (f.extractedText) {
        parts.push(
          `[Attached file: ${f.name}]\n\`\`\`\n${f.extractedText.slice(0, 30000)}\n\`\`\``
        );
      } else if (f.type === "image") {
        parts.push(
          `[Attached image: ${f.name} — saved at ${f.path}]`
        );
      } else {
        parts.push(
          `[Attached file: ${f.name} (${formatSize(f.size)}) — saved at ${f.path}]`
        );
      }
    }

    return parts.join("\n\n");
  }

  // --- Chat actions ---

  function newChat() {
    if (abortRef.current) abortRef.current.abort();
    stopPolling();
    setPendingFiles([]);
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: "New conversation",
      messages: [],
      createdAt: new Date(),
      sessionId: crypto.randomUUID(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setStatus("idle");
    setInput("");
  }

  function switchChat(id: string) {
    setActiveId(id);
  }

  async function sendMessage() {
    const text = input.trim();
    const files = [...pendingFiles];
    if ((!text && files.length === 0) || status === "streaming" || status === "waiting")
      return;

    stopPolling();

    let convId = activeId;
    let convSessionId = activeConversation?.sessionId;
    if (!convId) {
      const newSessionId = crypto.randomUUID();
      const conv: Conversation = {
        id: crypto.randomUUID(),
        title: (text || files[0]?.name || "File").slice(0, 40),
        messages: [],
        createdAt: new Date(),
        sessionId: newSessionId,
      };
      setConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      convSessionId = newSessionId;
      setActiveId(convId);
    }

    // Build the full message text that gets sent to Tom
    const fullMessage = buildMessageWithFiles(text, files);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || `Sent ${files.length} file${files.length > 1 ? "s" : ""}`,
      timestamp: new Date(),
      files: files.length > 0 ? files : undefined,
    };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const title =
          c.messages.length === 0
            ? (text || files[0]?.name || "File").slice(0, 40)
            : c.title;
        return {
          ...c,
          title,
          messages: [...c.messages, userMsg, assistantMsg],
        };
      })
    );
    setInput("");
    setPendingFiles([]);
    setStatus("streaming");
    fullTextRef.current = "";

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullMessage, sessionId: convSessionId }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let sseBuffer = "";
      let spawned = false;
      let baseline = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value, { stream: true });
        sseBuffer += raw;

        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk") {
              fullTextRef.current += data.text;
              updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
            } else if (data.type === "done") {
              if (data.output) {
                const finalText = data.output.trim();
                if (
                  finalText &&
                  finalText.length >= fullTextRef.current.length
                ) {
                  fullTextRef.current = finalText;
                }
              }
              updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
              spawned = !!data.spawned;
              baseline = data.baseline || 0;
            } else if (data.type === "error") {
              fullTextRef.current += `\n\n*Error: ${data.text}*`;
              updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
            }
          } catch {
            /* skip */
          }
        }
      }

      if (sseBuffer.startsWith("data: ")) {
        try {
          const data = JSON.parse(sseBuffer.slice(6));
          if (data.type === "chunk") {
            fullTextRef.current += data.text;
          } else if (data.type === "done") {
            if (data.output) {
              const finalText = data.output.trim();
              if (
                finalText &&
                finalText.length >= fullTextRef.current.length
              ) {
                fullTextRef.current = finalText;
              }
            }
            spawned = !!data.spawned;
            baseline = data.baseline || 0;
          }
          updateAssistantMsg(convId!, assistantMsg.id, fullTextRef.current);
        } catch {
          /* skip */
        }
      }

      if (!fullTextRef.current) {
        updateAssistantMsg(
          convId!,
          assistantMsg.id,
          "*No response. Is the gateway running?*"
        );
      }

      if (spawned && baseline > 0) {
        startFollowUpPolling(convId!, assistantMsg.id, baseline, convSessionId!);
      } else {
        setStatus("idle");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
      updateAssistantMsg(
        convId!,
        assistantMsg.id,
        fullTextRef.current
          ? fullTextRef.current +
              `\n\n*Connection closed: ${err instanceof Error ? err.message : "Unknown"}*`
          : `*Connection error: ${err instanceof Error ? err.message : "Unknown"}*`
      );
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  async function stopGeneration() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    stopPolling();
    try {
      await fetch("/api/chat/stop", { method: "POST" });
    } catch {
      /* best effort */
    }
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          const msgs = [...c.messages];
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === "assistant") {
              const current = msgs[i].content;
              msgs[i] = {
                ...msgs[i],
                content: current
                  ? current + "\n\n*Stopped by user*"
                  : "*Stopped by user*",
              };
              break;
            }
          }
          return { ...c, messages: msgs };
        })
      );
    }
    setStatus("idle");
  }

  async function refreshFromSession() {
    if (status === "streaming") return;
    try {
      const params = activeConversation?.sessionId
        ? `?sessionId=${encodeURIComponent(activeConversation.sessionId)}`
        : "";
      const res = await fetch(`/api/chat/latest${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.userMessage || data.responses.length === 0) return;
      const combined = data.responses.join("\n\n---\n\n");
      const convId = activeId;
      if (convId) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const msgs = [...c.messages];
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].role === "assistant") {
                if (combined.length > msgs[i].content.length) {
                  msgs[i] = { ...msgs[i], content: combined };
                }
                break;
              }
            }
            return { ...c, messages: msgs };
          })
        );
        fullTextRef.current = combined;
      } else {
        const conv: Conversation = {
          id: crypto.randomUUID(),
          title: data.userMessage.slice(0, 40),
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              content: data.userMessage,
              timestamp: new Date(),
            },
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: combined,
              timestamp: new Date(),
            },
          ],
          createdAt: new Date(),
          sessionId: crypto.randomUUID(),
        };
        setConversations((prev) => [conv, ...prev]);
        setActiveId(conv.id);
        fullTextRef.current = combined;
      }
      stopPolling();
      setStatus("idle");
    } catch {
      /* silently fail */
    }
  }

  function clearConversation() {
    if (abortRef.current) abortRef.current.abort();
    stopPolling();
    setPendingFiles([]);
    if (activeId) {
      setConversations((prev) => prev.filter((c) => c.id !== activeId));
    }
    setActiveId(null);
    setStatus("idle");
  }

  // --- Render ---

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-8">
      {/* Chat history sidebar */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-800">
          <button
            onClick={newChat}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
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
                <button
                  onClick={() => setShowAllChats(true)}
                  className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300"
                >
                  Show {pastConversations.length - 5} more...
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div
        className="flex-1 flex flex-col min-w-0 relative"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-50 bg-blue-600/20 border-2 border-dashed border-blue-400 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="bg-gray-900 px-6 py-4 rounded-xl text-blue-300 text-lg font-medium">
              Drop files here
            </div>
          </div>
        )}

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
                      : status === "waiting"
                        ? "bg-yellow-400 animate-pulse"
                        : status === "error"
                          ? "bg-red-400"
                          : "bg-green-400"
                  }`}
                />
                {status === "streaming"
                  ? "Tom is thinking..."
                  : status === "waiting"
                    ? "Agents working..."
                    : status === "error"
                      ? "Connection error"
                      : "Ready"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshFromSession}
              disabled={status === "streaming"}
              title="Pull latest responses from session"
              className="text-xs px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={clearConversation}
              className="text-xs px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="text-5xl mb-4">🚀</div>
                <h2 className="text-lg font-medium text-gray-300 mb-2">
                  Chat with Tom
                </h2>
                <p className="text-sm max-w-md">
                  Tom is the master orchestrator. Ask him anything — he can
                  delegate to specialist agents.
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  You can also drag & drop files here
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

                {/* File attachments */}
                {msg.files && msg.files.length > 0 && (
                  <div className="mb-2 space-y-2">
                    {msg.files.map((f) => (
                      <div key={f.id}>
                        {f.type === "image" && f.previewUrl ? (
                          <div className="rounded-lg overflow-hidden max-w-xs">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.previewUrl}
                              alt={f.name}
                              className="max-w-full max-h-48 rounded-lg"
                            />
                            <div className="text-xs opacity-70 mt-1">
                              {f.name} ({formatSize(f.size)})
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2">
                            <span className="text-lg">
                              {FILE_ICON[f.type] || "📎"}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm truncate">{f.name}</div>
                              <div className="text-xs opacity-60">
                                {formatSize(f.size)}
                                {f.extractedText
                                  ? " — content extracted"
                                  : ""}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
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

        {/* Pending files preview */}
        {pendingFiles.length > 0 && (
          <div className="px-6 py-2 border-t border-gray-800 bg-gray-900/30">
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 text-sm group"
                >
                  {f.type === "image" && f.previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={f.previewUrl}
                      alt={f.name}
                      className="w-8 h-8 rounded object-cover"
                    />
                  ) : (
                    <span>{FILE_ICON[f.type] || "📎"}</span>
                  )}
                  <span className="truncate max-w-[120px] text-gray-300">
                    {f.name}
                  </span>
                  <button
                    onClick={() => removePendingFile(f.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50">
          <div className="flex gap-3 items-end">
            {/* File upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || status === "streaming"}
              title="Attach files"
              className="px-3 py-3 text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-50 rounded-xl transition-colors"
            >
              {uploading ? (
                <span className="inline-block w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="text-lg">📎</span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.xls,.xlsx,.csv,.txt,.json,.md,.xml,.html,.yml,.yaml,.log"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData.items;
                const files: File[] = [];
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind === "file") {
                    const file = items[i].getAsFile();
                    if (file) files.push(file);
                  }
                }
                if (files.length > 0) {
                  e.preventDefault();
                  handleFiles(files);
                }
              }}
              placeholder={
                pendingFiles.length > 0
                  ? "Add a message or just hit Send..."
                  : "Message Tom... (Enter to send, Shift+Enter for newline)"
              }
              rows={1}
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none max-h-32"
              style={{ minHeight: "48px" }}
            />

            {status === "streaming" || status === "waiting" ? (
              <button
                onClick={stopGeneration}
                className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors whitespace-nowrap"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim() && pendingFiles.length === 0}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors whitespace-nowrap"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for programmatic trigger */}
    </div>
  );
}
