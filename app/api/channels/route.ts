import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CONFIG_PATH = "/home/node/.openclaw/openclaw.json";

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
    ],
    instructions:
      "1. Message @BotFather on Telegram\n2. Send /newbot and follow prompts\n3. Copy the bot token here\n4. Run `openclaw channels add telegram --token <TOKEN>`",
  },
  gmail: {
    name: "Gmail",
    fields: [
      { key: "email", label: "Email Address", placeholder: "you@gmail.com" },
      {
        key: "appPassword",
        label: "App Password",
        placeholder: "xxxx xxxx xxxx xxxx",
        secret: true,
      },
    ],
    instructions:
      "1. Go to Google Account > Security > 2-Step Verification\n2. At the bottom, select App passwords\n3. Generate a password for 'Mail'\n4. Use that 16-character password here",
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
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>) {
  const dir = CONFIG_PATH.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
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

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
