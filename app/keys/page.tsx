"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface KeyInfo {
  id: string;
  section: string;
  provider: string;
  keyType: string;
  maskedValue: string;
  status: "valid" | "unknown" | "error";
  lastUsed?: string;
}

interface KeysData {
  providers: KeyInfo[];
  authProfiles: KeyInfo[];
  integrations: KeyInfo[];
  gateway: KeyInfo[];
}

export default function KeysPage() {
  const [data, setData] = useState<KeysData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<
    Record<string, { valid: boolean; tested: boolean }>
  >({});

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      toast.error("Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function testKey(keyId: string) {
    setTesting((prev) => new Set([...prev, keyId]));
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", keyId }),
      });
      const result = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [keyId]: { valid: result.valid ?? false, tested: true },
      }));
      if (result.valid) {
        toast.success(`${keyId} is valid`);
      } else {
        toast.error(`${keyId} test failed`);
      }
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting((prev) => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy")
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading keys...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Keys & Connections</h1>

      {/* AI Model Providers */}
      <Section title="AI Model Providers" icon="🤖">
        {data?.providers.length === 0 ? (
          <EmptyState text="No API keys configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or XAI_API_KEY environment variables." />
        ) : (
          <div className="space-y-2">
            {data?.providers.map((key) => (
              <KeyRow
                key={key.id}
                info={key}
                testResult={testResults[key.id]}
                isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)}
                onCopy={() => copyToClipboard(key.maskedValue)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Agent Auth Profiles */}
      <Section title="Agent Auth Profiles" icon="🔐">
        {data?.authProfiles.length === 0 ? (
          <EmptyState text="No auth profiles found. These are managed by OpenClaw per agent." />
        ) : (
          <div className="space-y-2">
            {data?.authProfiles.map((key) => (
              <KeyRow
                key={key.id}
                info={key}
                testResult={testResults[key.id]}
                isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)}
                onCopy={() => copyToClipboard(key.maskedValue)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Third-Party Integrations */}
      <Section title="Third-Party Integrations" icon="🔗">
        {data?.integrations.length === 0 ? (
          <EmptyState text="No integrations detected." />
        ) : (
          <div className="space-y-2">
            {data?.integrations.map((key) => (
              <KeyRow
                key={key.id}
                info={key}
                testResult={testResults[key.id]}
                isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)}
                onCopy={() => copyToClipboard(key.maskedValue)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Gateway & Internal */}
      <Section title="Gateway & Internal" icon="🌐">
        {data?.gateway.length === 0 ? (
          <EmptyState text="No gateway configuration found." />
        ) : (
          <div className="space-y-2">
            {data?.gateway.map((key) => (
              <KeyRow
                key={key.id}
                info={key}
                testResult={testResults[key.id]}
                isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)}
                onCopy={() => copyToClipboard(key.maskedValue)}
              />
            ))}
          </div>
        )}
      </Section>

      <div className="mt-6 text-xs text-gray-600 text-center">
        All key operations are performed server-side. Keys are never sent to the browser.
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        {children}
      </div>
    </section>
  );
}

function KeyRow({
  info,
  testResult,
  isTesting,
  onTest,
  onCopy,
}: {
  info: KeyInfo;
  testResult?: { valid: boolean; tested: boolean };
  isTesting: boolean;
  onTest: () => void;
  onCopy: () => void;
}) {
  const statusColor =
    testResult?.tested
      ? testResult.valid
        ? "bg-green-900/50 text-green-400"
        : "bg-red-900/50 text-red-400"
      : info.status === "valid"
        ? "bg-green-900/50 text-green-400"
        : info.status === "error"
          ? "bg-red-900/50 text-red-400"
          : "bg-gray-700 text-gray-400";

  const statusText = testResult?.tested
    ? testResult.valid
      ? "valid"
      : "invalid"
    : info.status;

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{info.provider}</div>
          <div className="text-xs text-gray-500">
            {info.keyType} · {info.maskedValue}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3">
        <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor}`}>
          {statusText}
        </span>
        <button
          onClick={onTest}
          disabled={isTesting}
          className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
        >
          {isTesting ? "..." : "Test"}
        </button>
        <button
          onClick={onCopy}
          className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Copy masked value"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-gray-500 text-sm text-center py-4">{text}</p>;
}
