import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { checkRateLimit } from "@/lib/rate-limit";
import { openclawConfigPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

function getConfigPath() { return openclawConfigPath(); }

interface ChannelConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, string>;
}

const CHANNEL_TEMPLATES: Record<
  string,
  { name: string; fields: { key: string; label: string; placeholder: string; secret?: boolean }[] ; instructions: string }
> = {
  whatsapp: {
    name: "WhatsApp",
    fields: [
      { key: "phoneNumber", label: "Phone Number", placeholder: "+1234567890" },
    ],
    instructions:
      "1. Run `openclaw channels add whatsapp`\n2. Scan the QR code with WhatsApp on your phone\n3. The gateway will bridge messages to Tom\n\nNote: Requires WhatsApp Business API or the openclaw-whatsapp plugin.",
  },
  telegram: {
    name: "Telegram",
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        placeholder: "123456:ABC-DEF...",
        secret: true,
      },
      {
        key: "uid",
        label: "Your Telegram User ID",
        placeholder: "123456789",
      },
      {
        key: "pairingCode",
        label: "Pairing Code (optional)",
        placeholder: "Auto-generated after save",
      },
    ],
    instructions:
      "1. Message @BotFather on Telegram\n2. Send /newbot and follow prompts\n3. Copy the bot token here\n4. Find your User ID: message @userinfobot\n5. Run `openclaw channels add telegram --token <TOKEN>`\n6. Use pairing code to link your Telegram account",
  },
  gmail: {
    name: "Gmail",
    fields: [
      { key: "email", label: "Email Address", placeholder: "you@gmail.com" },
      { key: "authMethod", label: "Auth Method", placeholder: "app-password" },
      {
        key: "appPassword",
        label: "App Password",
        placeholder: "xxxx xxxx xxxx xxxx",
        secret: true,
      },
      { key: "imapServer", label: "IMAP Server", placeholder: "imap.gmail.com" },
      { key: "imapPort", label: "IMAP Port", placeholder: "993" },
    ],
    instructions:
      "Method 1 — App Password (recommended):\n1. Go to Google Account > Security > 2-Step Verification\n2. At the bottom, select App passwords\n3. Generate a password for 'Mail'\n4. Use that 16-character password here\n\nMethod 2 — IMAP Direct:\n1. Set Auth Method to 'imap'\n2. Enter your IMAP server and port\n3. Use for non-Gmail IMAP providers",
  },
  googlechat: {
    name: "Google Chat",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://chat.googleapis.com/v1/spaces/..." },
    ],
    instructions:
      "1. Open Google Chat space > Manage webhooks\n2. Create a new webhook\n3. Copy the webhook URL here\n4. Messages from Tom will be posted to this space",
  },
  slack: {
    name: "Slack",
    fields: [
      {
        key: "botToken",
        label: "Bot OAuth Token",
        placeholder: "xoxb-...",
        secret: true,
      },
      {
        key: "channelId",
        label: "Channel ID",
        placeholder: "C0123456789",
      },
    ],
    instructions:
      "1. Create a Slack App at api.slack.com/apps\n2. Add Bot Token Scopes: chat:write, channels:history\n3. Install to workspace and copy the Bot OAuth Token\n4. Get Channel ID from channel details (right-click > View channel details)",
  },
};

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(getConfigPath(), "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>) {
  const dir = getConfigPath().replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

function runFile(bin: string, args: string[]): string {
  try {
    const stdout = execFileSync(bin, args, {
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return (stdout as string).trim();
  } catch (err: any) {
    if (err?.stdout) return (err.stdout as string).trim();
    return "";
  }
}

export async function GET() {
  return NextResponse.json({ templates: CHANNEL_TEMPLATES });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`channels:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  switch (action) {
    case "save": {
      const channelType = body.channelType as string;
      const channelConfig = body.config as Record<string, string>;

      if (!channelType || !CHANNEL_TEMPLATES[channelType]) {
        return NextResponse.json({ error: "Invalid channel type" }, { status: 400 });
      }

      const config = readConfig();
      if (!config.channels) config.channels = {};
      const channels = config.channels as Record<string, unknown>;
      channels[channelType] = {
        enabled: true,
        ...channelConfig,
      };
      writeConfig(config);

      // Auto-enable the corresponding gateway plugin
      const pluginMap: Record<string, string> = {
        whatsapp: "whatsapp",
        telegram: "telegram",
        gmail: "imap",
        slack: "slack",
      };
      const pluginName = pluginMap[channelType];
      if (pluginName) {
        runFile("openclaw", ["plugins", "enable", pluginName]);
      }

      // Lock down DM policy to allowlist — never send pairing codes to strangers
      runFile("openclaw", ["config", "set", `channels.${channelType}.dmPolicy`, "allowlist"]);

      return NextResponse.json({ success: true });
    }

    case "toggle": {
      const channelType = body.channelType as string;
      const enabled = body.enabled as boolean;

      if (!channelType) {
        return NextResponse.json({ error: "Invalid channel type" }, { status: 400 });
      }

      const config = readConfig();
      if (!config.channels) config.channels = {};
      const channels = config.channels as Record<string, unknown>;
      if (!channels[channelType]) channels[channelType] = {};
      (channels[channelType] as Record<string, unknown>).enabled = !!enabled;
      writeConfig(config);

      return NextResponse.json({ success: true });
    }

    case "qr": {
      const output = runFile("openclaw", ["channels", "whatsapp", "qr"]);
      return NextResponse.json({ output: output || "No QR output. Is the WhatsApp plugin running?" });
    }

    case "healthCheck": {
      const output = runFile("openclaw", ["channels", "status"]);
      const statuses: Record<string, { connected: boolean; detail: string }> = {};
      const lines = output.split("\n");
      for (const line of lines) {
        const match = line.match(/^-\s*(\w+)\s+\w+:\s+(enabled|disabled),\s*(.*)/);
        if (match) {
          const name = match[1].toLowerCase();
          statuses[name] = {
            connected: match[2] === "enabled",
            detail: match[3].trim(),
          };
        }
      }
      return NextResponse.json({ statuses, raw: output });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
