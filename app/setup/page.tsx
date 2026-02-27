"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────

interface ProviderInfo {
  id: string;
  name: string;
  envKey: string;
  consoleUrl: string;
  color: { bg: string; text: string; border: string };
  keyConfigured: boolean;
}

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  model: string;
  enabled: boolean;
}

interface ProviderKeyState {
  value: string;
  testing: boolean;
  valid: boolean | null;
  saved: boolean;
}

interface ChannelState {
  telegram: { botToken: string; uid: string };
  whatsapp: { phoneNumber: string };
}

const STEP_LABELS = ["Welcome", "About You", "API Keys", "Agents", "Channels", "Review"];
const DEFAULT_AGENTS = ["main", "ninja", "ops", "cto"];

const AGENT_DESCRIPTIONS: Record<string, string> = {
  main: "Master orchestrator — routes requests and coordinates agents",
  ninja: "Full-stack developer — builds apps, APIs, and tools",
  ops: "Operations architect — plans builds, reviews, and deploys",
  cto: "Tech advisor — architecture decisions and platform maintenance",
  accounting: "Invoicing and expenses — manages financial documents",
  finance: "Financial analyst — models, deals, budgets, and costs",
  legal: "Compliance specialist — contracts and regulatory review",
  marketing: "Content creator — blog posts, social media, and research",
};

// ── Wizard Component ──────────────────────────────────────────────────

function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  // Step 1: About You
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("English");

  // Step 2: API Keys
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerKeys, setProviderKeys] = useState<Record<string, ProviderKeyState>>({});

  // Step 3: Agents
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set(DEFAULT_AGENTS));

  // Step 4: Channels
  const [channels, setChannels] = useState<ChannelState>({
    telegram: { botToken: "", uid: "" },
    whatsapp: { phoneNumber: "" },
  });

  // Saving states
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  // ── Fetch initial data ────────────────────────────────────────────

  const fetchSetupData = useCallback(async () => {
    try {
      const res = await fetch("/api/setup");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      if (data.setupComplete) {
        router.push("/");
        return;
      }

      setProviders(data.providers || []);
      setAgents(data.agents || []);

      // Initialize provider key states
      const keys: Record<string, ProviderKeyState> = {};
      for (const p of data.providers || []) {
        keys[p.id] = { value: "", testing: false, valid: p.keyConfigured ? true : null, saved: p.keyConfigured };
      }
      setProviderKeys(keys);

      // Initialize enabled agents from config
      const enabled = new Set<string>();
      for (const a of data.agents || []) {
        if (a.enabled || DEFAULT_AGENTS.includes(a.id)) {
          enabled.add(a.id);
        }
      }
      setEnabledAgents(enabled);
    } catch {
      toast.error("Failed to load setup data");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSetupData();
  }, [fetchSetupData]);

  // Auto-detect timezone
  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setTimezone("UTC");
    }
  }, []);

  // ── Action handlers ───────────────────────────────────────────────

  async function saveUser() {
    setSaving(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveUser", name, timezone, language }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }
      toast.success("Profile saved");
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function testKey(providerId: string) {
    const keyState = providerKeys[providerId];
    if (!keyState?.value.trim()) {
      toast.error("Enter an API key first");
      return;
    }

    setProviderKeys((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], testing: true, valid: null },
    }));

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testProviderKey", providerId, apiKey: keyState.value.trim() }),
      });
      const data = await res.json();

      setProviderKeys((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], testing: false, valid: data.valid },
      }));

      if (data.valid) {
        toast.success(`${providerId} key is valid`);
        // Auto-save valid key
        await saveKey(providerId, keyState.value.trim());
      } else {
        toast.error(`${providerId} key invalid (status: ${data.status})`);
      }
    } catch {
      setProviderKeys((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], testing: false, valid: false },
      }));
      toast.error("Connection failed");
    }
  }

  async function saveKey(providerId: string, value: string) {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveProviderKey", envKey: provider.envKey, value }),
      });
      if (res.ok) {
        setProviderKeys((prev) => ({
          ...prev,
          [providerId]: { ...prev[providerId], saved: true },
        }));
      }
    } catch {
      // Silently fail — key is tested but save failed
    }
  }

  async function saveAgents() {
    setSaving(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enableAgents", agentIds: Array.from(enabledAgents) }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }
      toast.success("Agent configuration saved");
      setStep(4);
    } catch (err: any) {
      toast.error(err.message || "Failed to save agents");
    } finally {
      setSaving(false);
    }
  }

  async function saveChannel(channelType: string, config: Record<string, string>) {
    // Filter out empty values
    const filtered = Object.fromEntries(Object.entries(config).filter(([, v]) => v.trim()));
    if (Object.keys(filtered).length === 0) return;

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "configureChannel", channelType, config: filtered }),
      });
      if (res.ok) {
        toast.success(`${channelType} configured`);
      }
    } catch {
      toast.error(`Failed to configure ${channelType}`);
    }
  }

  async function completeSetup() {
    setLaunching(true);
    try {
      // Save any pending channel configs
      if (channels.telegram.botToken.trim() || channels.telegram.uid.trim()) {
        await saveChannel("telegram", channels.telegram);
      }
      if (channels.whatsapp.phoneNumber.trim()) {
        await saveChannel("whatsapp", channels.whatsapp);
      }

      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "completeSetup" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }

      toast.success("ClawOS is ready!");
      router.push("/");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete setup");
    } finally {
      setLaunching(false);
    }
  }

  // ── Validation ────────────────────────────────────────────────────

  const hasValidKey = Object.values(providerKeys).some((k) => k.valid === true);

  function canProceed(): boolean {
    switch (step) {
      case 0: return true;
      case 1: return name.trim().length > 0;
      case 2: return hasValidKey;
      case 3: return enabledAgents.size > 0;
      case 4: return true; // channels are optional
      case 5: return true;
      default: return false;
    }
  }

  // ── Navigation ────────────────────────────────────────────────────

  function handleNext() {
    if (step === 1) {
      saveUser();
      return;
    }
    if (step === 3) {
      saveAgents();
      return;
    }
    if (step === 5) {
      completeSetup();
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  // ── Loading state ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading setup...</div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Progress bar */}
      <div className="pt-8 pb-4 px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    i < step
                      ? "bg-blue-600 text-white"
                      : i === step
                        ? "bg-blue-500 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-950"
                        : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {i < step ? "\u2713" : i + 1}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-1 ${i < step ? "bg-blue-600" : "bg-gray-800"}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            {STEP_LABELS.map((label, i) => (
              <span key={label} className={`text-xs ${i === step ? "text-blue-400" : "text-gray-600"}`}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {step === 0 && <StepWelcome />}
          {step === 1 && (
            <StepAboutYou
              name={name} setName={setName}
              timezone={timezone} setTimezone={setTimezone}
              language={language} setLanguage={setLanguage}
            />
          )}
          {step === 2 && (
            <StepApiKeys
              providers={providers}
              providerKeys={providerKeys}
              setProviderKeys={setProviderKeys}
              onTest={testKey}
            />
          )}
          {step === 3 && (
            <StepAgents
              agents={agents}
              enabledAgents={enabledAgents}
              setEnabledAgents={setEnabledAgents}
            />
          )}
          {step === 4 && (
            <StepChannels
              channels={channels}
              setChannels={setChannels}
            />
          )}
          {step === 5 && (
            <StepReview
              name={name}
              timezone={timezone}
              language={language}
              providers={providers}
              providerKeys={providerKeys}
              agents={agents}
              enabledAgents={enabledAgents}
              channels={channels}
            />
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="border-t border-gray-800 px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            {step > 0 && (
              <button
                onClick={handleBack}
                className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 4 && (
              <button
                onClick={() => setStep(5)}
                className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors"
              >
                Skip for now
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed() || saving || launching}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
            >
              {saving
                ? "Saving..."
                : launching
                  ? "Launching..."
                  : step === 0
                    ? "Get Started"
                    : step === 5
                      ? "Launch ClawOS"
                      : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 0: Welcome ───────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div className="text-center py-16">
      <div className="text-7xl mb-6">&#x1f43e;</div>
      <h1 className="text-4xl font-bold text-white mb-4">Welcome to ClawOS</h1>
      <p className="text-lg text-gray-400 max-w-md mx-auto mb-2">
        Your personal AI operating system with a team of specialist agents ready to work for you.
      </p>
      <p className="text-sm text-gray-600">Setup takes about 5 minutes</p>
    </div>
  );
}

// ── Step 1: About You ─────────────────────────────────────────────────

function StepAboutYou({
  name, setName, timezone, setTimezone, language, setLanguage,
}: {
  name: string; setName: (v: string) => void;
  timezone: string; setTimezone: (v: string) => void;
  language: string; setLanguage: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">About You</h2>
      <p className="text-gray-400 mb-8">Tell your agents who they're working for.</p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Your Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Yair"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoFocus
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {Intl.supportedValuesOf("timeZone").map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {["English", "Hebrew", "Spanish", "French", "German", "Japanese", "Chinese", "Korean", "Portuguese", "Arabic"].map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: API Keys ──────────────────────────────────────────────────

function StepApiKeys({
  providers,
  providerKeys,
  setProviderKeys,
  onTest,
}: {
  providers: ProviderInfo[];
  providerKeys: Record<string, ProviderKeyState>;
  setProviderKeys: React.Dispatch<React.SetStateAction<Record<string, ProviderKeyState>>>;
  onTest: (providerId: string) => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">API Keys</h2>
      <p className="text-gray-400 mb-8">
        Connect at least one AI provider. Your agents use these to think.
      </p>

      <div className="space-y-4">
        {providers.map((p) => {
          const keyState = providerKeys[p.id] || { value: "", testing: false, valid: null, saved: false };

          return (
            <div key={p.id} className={`bg-gray-900 rounded-xl border ${keyState.valid === true ? "border-green-700" : keyState.valid === false ? "border-red-700" : "border-gray-800"} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.color.bg} ${p.color.text}`}>
                    {p.name}
                  </span>
                  {keyState.valid === true && (
                    <span className="text-green-400 text-xs">&#x2713; Connected</span>
                  )}
                  {keyState.valid === false && (
                    <span className="text-red-400 text-xs">&#x2717; Invalid</span>
                  )}
                </div>
                <a
                  href={p.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Get API Key &rarr;
                </a>
              </div>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyState.value}
                  onChange={(e) =>
                    setProviderKeys((prev) => ({
                      ...prev,
                      [p.id]: { ...prev[p.id], value: e.target.value, valid: null },
                    }))
                  }
                  placeholder={keyState.saved ? "Key configured (enter new to replace)" : `${p.envKey}`}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => onTest(p.id)}
                  disabled={keyState.testing || !keyState.value.trim()}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg text-sm transition-colors whitespace-nowrap"
                >
                  {keyState.testing ? "Testing..." : "Test"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!hasAtLeastOneKey(providerKeys) && (
        <p className="text-yellow-500 text-sm mt-4">
          At least one valid API key is required to continue.
        </p>
      )}
    </div>
  );
}

function hasAtLeastOneKey(keys: Record<string, ProviderKeyState>): boolean {
  return Object.values(keys).some((k) => k.valid === true);
}

// ── Step 3: Agents ────────────────────────────────────────────────────

function StepAgents({
  agents,
  enabledAgents,
  setEnabledAgents,
}: {
  agents: AgentInfo[];
  enabledAgents: Set<string>;
  setEnabledAgents: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  function toggle(id: string) {
    if (id === "main") return; // can't disable main
    setEnabledAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Your Agents</h2>
      <p className="text-gray-400 mb-8">
        Choose which specialist agents to activate. You can change this later.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {agents.map((agent) => {
          const isMain = agent.id === "main";
          const isEnabled = enabledAgents.has(agent.id);

          return (
            <button
              key={agent.id}
              onClick={() => toggle(agent.id)}
              className={`text-left p-4 rounded-xl border transition-colors ${
                isEnabled
                  ? "bg-gray-900 border-blue-700 ring-1 ring-blue-700/50"
                  : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{agent.emoji}</span>
                  <span className="font-medium text-white">{agent.name}</span>
                </div>
                {isMain ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-400">Required</span>
                ) : (
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    isEnabled ? "bg-blue-600 border-blue-600" : "border-gray-600"
                  }`}>
                    {isEnabled && <span className="text-white text-xs">&#x2713;</span>}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {AGENT_DESCRIPTIONS[agent.id] || `${agent.name} agent`}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 4: Channels ──────────────────────────────────────────────────

function StepChannels({
  channels,
  setChannels,
}: {
  channels: ChannelState;
  setChannels: React.Dispatch<React.SetStateAction<ChannelState>>;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Channels</h2>
      <p className="text-gray-400 mb-8">
        Connect messaging channels so your agents can reach you. This is optional — you can always use the dashboard chat.
      </p>

      <div className="space-y-4">
        {/* Telegram */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">&#x2708;&#xFE0F;</span>
            <h3 className="font-medium text-white">Telegram</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Bot Token</label>
              <input
                type="password"
                value={channels.telegram.botToken}
                onChange={(e) => setChannels((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, botToken: e.target.value },
                }))}
                placeholder="123456:ABC-DEF..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Your Telegram User ID</label>
              <input
                value={channels.telegram.uid}
                onChange={(e) => setChannels((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, uid: e.target.value },
                }))}
                placeholder="123456789"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-gray-600">
              Create a bot with @BotFather, then get your UID from @userinfobot
            </p>
          </div>
        </div>

        {/* WhatsApp */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">&#x1F4AC;</span>
            <h3 className="font-medium text-white">WhatsApp</h3>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Phone Number</label>
            <input
              value={channels.whatsapp.phoneNumber}
              onChange={(e) => setChannels((prev) => ({
                ...prev,
                whatsapp: { ...prev.whatsapp, phoneNumber: e.target.value },
              }))}
              placeholder="+1234567890"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-600 mt-2">
              QR code pairing will be available after setup
            </p>
          </div>
        </div>

        {/* Gmail — Coming soon */}
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-5 opacity-60">
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x2709;&#xFE0F;</span>
            <h3 className="font-medium text-white">Gmail</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Coming soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Review & Launch ───────────────────────────────────────────

function StepReview({
  name, timezone, language,
  providers, providerKeys,
  agents, enabledAgents,
  channels,
}: {
  name: string;
  timezone: string;
  language: string;
  providers: ProviderInfo[];
  providerKeys: Record<string, ProviderKeyState>;
  agents: AgentInfo[];
  enabledAgents: Set<string>;
  channels: ChannelState;
}) {
  const connectedProviders = providers.filter((p) => providerKeys[p.id]?.valid === true);
  const activeAgents = agents.filter((a) => enabledAgents.has(a.id));
  const hasTelegram = channels.telegram.botToken.trim() && channels.telegram.uid.trim();
  const hasWhatsApp = channels.whatsapp.phoneNumber.trim();

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Review & Launch</h2>
      <p className="text-gray-400 mb-8">Everything looks good. Ready to launch your AI team.</p>

      <div className="space-y-4">
        {/* Profile */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Profile</h3>
          <div className="text-white">{name}</div>
          <div className="text-xs text-gray-500">{timezone} &middot; {language}</div>
        </div>

        {/* Providers */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">AI Providers</h3>
          <div className="flex flex-wrap gap-2">
            {connectedProviders.map((p) => (
              <span key={p.id} className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.color.bg} ${p.color.text}`}>
                {p.name} &#x2713;
              </span>
            ))}
            {connectedProviders.length === 0 && (
              <span className="text-gray-500 text-sm">No providers connected</span>
            )}
          </div>
        </div>

        {/* Agents */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Active Agents ({activeAgents.length})</h3>
          <div className="flex flex-wrap gap-2">
            {activeAgents.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-800 text-gray-300">
                <span>{a.emoji}</span> {a.name}
              </span>
            ))}
          </div>
        </div>

        {/* Channels */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Channels</h3>
          {!hasTelegram && !hasWhatsApp ? (
            <span className="text-gray-500 text-sm">None configured (dashboard chat available)</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hasTelegram && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-blue-900/50 text-blue-400">Telegram &#x2713;</span>
              )}
              {hasWhatsApp && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-green-900/50 text-green-400">WhatsApp &#x2713;</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page Export ────────────────────────────────────────────────────────

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      }
    >
      <SetupWizard />
    </Suspense>
  );
}
