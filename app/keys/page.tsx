"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import Link from "next/link";

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

// Cross-references: which features need which keys
const KEY_DEPENDENCIES: { key: string; features: { label: string; href: string }[] }[] = [
  { key: "ANTHROPIC_API_KEY", features: [
    { label: "All agents (primary model provider)", href: "/agents" },
    { label: "Chat with Tom", href: "/chat" },
  ]},
  { key: "OPENAI_API_KEY", features: [
    { label: "LanceDB vector search", href: "/memory" },
    { label: "Skills requiring embeddings", href: "/skills" },
  ]},
  { key: "GITHUB_TOKEN", features: [
    { label: "GitHub skill", href: "/skills" },
    { label: "gh-issues skill", href: "/skills" },
  ]},
  { key: "XAI_API_KEY", features: [
    { label: "xAI/Grok model fallback", href: "/agents" },
  ]},
];

export default function KeysPage() {
  const [data, setData] = useState<KeysData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; tested: boolean }>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);

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
    setTesting(prev => new Set([...prev, keyId]));
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", keyId }),
      });
      const result = await res.json();
      setTestResults(prev => ({ ...prev, [keyId]: { valid: result.valid ?? false, tested: true } }));
      if (result.valid) toast.success(`${keyId} is valid`);
      else toast.error(`${keyId} test failed`);
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(prev => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });
    }
  }

  async function addKey() {
    if (!newName.trim() || !newValue.trim()) {
      toast.error("Name and value are required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name: newName.trim(), value: newValue.trim(), type: "env" }),
      });
      if (res.ok) {
        toast.success(`Added ${newName}`);
        setShowAddForm(false);
        setNewName("");
        setNewValue("");
        fetchKeys();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to add key");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setAdding(false);
    }
  }

  async function removeKey(name: string) {
    if (!confirm(`Remove ${name}? The environment variable will be unset.`)) return;
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", name }),
      });
      if (res.ok) {
        toast.success(`Removed ${name}`);
        fetchKeys();
      } else {
        toast.error("Failed to remove");
      }
    } catch {
      toast.error("Failed");
    }
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Keys & Connections</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          + Add Key
        </button>
      </div>

      {/* Add Key Form */}
      {showAddForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">Add Environment Variable</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Variable Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value.toUpperCase())}
                placeholder="OPENAI_API_KEY"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-blue-500" />
              <div className="text-xs text-gray-600 mt-1">Use UPPER_SNAKE_CASE</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Value</label>
              <input type="password" value={newValue} onChange={e => setNewValue(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addKey} disabled={adding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm">
              {adding ? "Adding..." : "Add Key"}
            </button>
            <button onClick={() => { setShowAddForm(false); setNewName(""); setNewValue(""); }}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* AI Model Providers */}
      <Section title="AI Model Providers" icon="🤖">
        {data?.providers.length === 0 ? (
          <EmptyState text="No API keys configured. Click '+ Add Key' to set ANTHROPIC_API_KEY, OPENAI_API_KEY, or XAI_API_KEY." />
        ) : (
          <div className="space-y-2">
            {data?.providers.map(key => (
              <KeyRow key={key.id} info={key}
                testResult={testResults[key.id]} isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)}
                onRemove={() => removeKey(key.provider.toUpperCase().replace(/[/ ]/g, "_") + "_API_KEY")} />
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
            {data?.authProfiles.map(key => (
              <KeyRow key={key.id} info={key}
                testResult={testResults[key.id]} isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)} />
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
            {data?.integrations.map(key => (
              <KeyRow key={key.id} info={key}
                testResult={testResults[key.id]} isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)} />
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
            {data?.gateway.map(key => (
              <KeyRow key={key.id} info={key}
                testResult={testResults[key.id]} isTesting={testing.has(key.id)}
                onTest={() => testKey(key.id)} />
            ))}
          </div>
        )}
      </Section>

      {/* Cross-References */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span>🔀</span> Key Dependencies
        </h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 mb-3">Which features depend on which keys:</p>
          <div className="space-y-3">
            {KEY_DEPENDENCIES.map(dep => {
              const isSet = data?.providers.some(p => p.id.includes(dep.key.toLowerCase().replace("_api_key", "")));
              return (
                <div key={dep.key} className="flex items-start gap-3">
                  <span className={`mt-0.5 ${isSet ? "text-green-400" : "text-red-400"}`}>
                    {isSet ? "●" : "○"}
                  </span>
                  <div>
                    <div className="font-mono text-sm">{dep.key}</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {dep.features.map(f => (
                        <Link key={f.href} href={f.href}
                          className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded">
                          {f.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mt-6 text-xs text-gray-600 text-center">
        All key operations are performed server-side. Full key values are never sent to the browser.
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span>{title}
      </h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">{children}</div>
    </section>
  );
}

function KeyRow({ info, testResult, isTesting, onTest, onRemove }: {
  info: KeyInfo;
  testResult?: { valid: boolean; tested: boolean };
  isTesting: boolean;
  onTest: () => void;
  onRemove?: () => void;
}) {
  const statusColor = testResult?.tested
    ? testResult.valid ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
    : info.status === "valid" ? "bg-green-900/50 text-green-400"
    : info.status === "error" ? "bg-red-900/50 text-red-400"
    : "bg-gray-700 text-gray-400";

  const statusText = testResult?.tested ? (testResult.valid ? "valid" : "invalid") : info.status;

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{info.provider}</div>
          <div className="text-xs text-gray-500">{info.keyType} · {info.maskedValue}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3">
        <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor}`}>{statusText}</span>
        <button onClick={onTest} disabled={isTesting}
          className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50">
          {isTesting ? "..." : "Test"}
        </button>
        {onRemove && (
          <button onClick={onRemove}
            className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-gray-500 text-sm text-center py-4">{text}</p>;
}
