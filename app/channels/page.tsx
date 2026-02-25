"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface ChannelTemplate {
  name: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
  instructions: string;
}

export default function ChannelsPage() {
  const [templates, setTemplates] = useState<Record<string, ChannelTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [channelStatuses, setChannelStatuses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      const res = await fetch("/api/channels");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || {});
      }
    } catch {
      toast.error("Failed to load channels");
    } finally {
      setLoading(false);
    }
  }

  async function saveChannel(type: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", channelType: type, config: formData }),
      });
      if (res.ok) {
        toast.success(`${templates[type]?.name || type} saved`);
        setChannelStatuses(prev => ({ ...prev, [type]: true }));
        setActiveChannel(null);
        setFormData({});
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleChannel(type: string, enabled: boolean) {
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", channelType: type, enabled }),
      });
      if (res.ok) {
        toast.success(`Channel ${enabled ? "enabled" : "disabled"}`);
        setChannelStatuses(prev => ({ ...prev, [type]: enabled }));
      }
    } catch {
      toast.error("Failed");
    }
  }

  const channelIcons: Record<string, string> = {
    whatsapp: "💬",
    telegram: "✈️",
    gmail: "📧",
    googlechat: "💭",
    slack: "💼",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading channels...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Channels</h1>
      <p className="text-gray-400 text-sm mb-6">
        Connect messaging channels so you can talk to Tom from anywhere.
        Each channel bridges incoming messages to the gateway.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(templates).map(([type, template]) => {
          const isConfigured = channelStatuses[type];
          const isActive = activeChannel === type;

          return (
            <div key={type} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden hover:border-gray-700 transition-colors">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{channelIcons[type] || "📡"}</span>
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <span className={`text-xs ${isConfigured ? "text-green-400" : "text-gray-500"}`}>
                        {isConfigured ? "Configured" : "Not configured"}
                      </span>
                    </div>
                  </div>
                  {isConfigured && (
                    <button
                      onClick={() => toggleChannel(type, !channelStatuses[type])}
                      className={`px-2 py-1 rounded text-xs ${
                        channelStatuses[type]
                          ? "bg-green-900/50 text-green-400 hover:bg-green-900"
                          : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                      }`}
                    >
                      {channelStatuses[type] ? "Enabled" : "Disabled"}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => {
                    setActiveChannel(isActive ? null : type);
                    setFormData({});
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {isActive ? "Hide setup" : isConfigured ? "Reconfigure" : "Set up"} →
                </button>
              </div>

              {isActive && (
                <div className="border-t border-gray-800 p-5">
                  {/* Instructions */}
                  <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
                    <div className="text-xs font-medium text-gray-400 mb-2">Setup Instructions:</div>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap">{template.instructions}</pre>
                  </div>

                  {/* Fields */}
                  <div className="space-y-3 mb-4">
                    {template.fields.map(field => (
                      <div key={field.key}>
                        <label className="text-xs text-gray-500 mb-1 block">{field.label}</label>
                        <input
                          type={field.secret ? "password" : "text"}
                          value={formData[field.key] || ""}
                          onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => saveChannel(type)}
                    disabled={saving}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm"
                  >
                    {saving ? "Saving..." : "Save Configuration"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="font-semibold mb-2">How channels work</h3>
        <p className="text-sm text-gray-400">
          Channels connect external messaging platforms to the ClawOS gateway.
          When a message arrives on a channel, it&apos;s routed to Tom (the master orchestrator),
          who can respond directly or delegate to specialist agents. Responses flow back
          through the same channel.
        </p>
      </div>
    </div>
  );
}
