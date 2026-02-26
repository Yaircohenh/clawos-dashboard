import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = "/tmp/clawos-uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".csv",
  ".json",
  ".md",
  ".log",
  ".xml",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".ts",
  ".js",
  ".py",
  ".sh",
]);

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function extractPdfText(filePath: string): string {
  // Use python to extract basic PDF text (no external deps needed)
  try {
    const script = `
import sys
try:
    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    # Simple PDF text extraction: find text between BT/ET blocks
    # This is basic but works for many PDFs without external libs
    text_parts = []
    i = 0
    while i < len(data):
        # Look for text objects
        idx = data.find(b'(', i)
        if idx == -1:
            break
        # Find matching close paren (handle escapes)
        j = idx + 1
        depth = 1
        while j < len(data) and depth > 0:
            if data[j:j+1] == b'\\\\':
                j += 2
                continue
            if data[j:j+1] == b'(':
                depth += 1
            elif data[j:j+1] == b')':
                depth -= 1
            j += 1
        if depth == 0:
            try:
                chunk = data[idx+1:j-1].decode('latin-1')
                # Filter for readable text
                readable = ''.join(c if c.isprintable() or c in '\\n\\r\\t' else ' ' for c in chunk)
                readable = readable.strip()
                if len(readable) > 2:
                    text_parts.append(readable)
            except:
                pass
        i = j
    result = ' '.join(text_parts)
    # Clean up excessive whitespace
    import re
    result = re.sub(r'\\s+', ' ', result).strip()
    print(result[:50000])  # Cap at 50k chars
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
    const result = execFileSync("python3", ["-c", script, filePath], {
      encoding: "utf-8",
      timeout: 15000,
    });
    return result.trim();
  } catch {
    return "";
  }
}

function extractXlsText(filePath: string): string {
  // Use python csv module for CSV, basic text extraction for xlsx
  try {
    const ext = getExtension(filePath);
    if (ext === ".csv") {
      const script = `
import csv, sys
with open(sys.argv[1], 'r', errors='replace') as f:
    reader = csv.reader(f)
    rows = []
    for i, row in enumerate(reader):
        if i > 500: break  # Cap rows
        rows.append(' | '.join(row))
    print('\\n'.join(rows))
`;
      return execFileSync("python3", ["-c", script, filePath], {
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
    }
    // For xlsx/xls without openpyxl, just note the file path
    return "";
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`chat-upload:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 }
      );
    }

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const id = crypto.randomUUID().slice(0, 8);
    const fileName = `${id}-${safeName}`;

    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const filePath = join(UPLOAD_DIR, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, buffer);

    const ext = getExtension(file.name);
    let extractedText = "";
    let fileType: "image" | "document" | "text" | "spreadsheet" = "document";

    if (IMAGE_EXTENSIONS.has(ext)) {
      fileType = "image";
      // No text extraction for images
    } else if (TEXT_EXTENSIONS.has(ext)) {
      fileType = "text";
      extractedText = buffer.toString("utf-8").slice(0, 50000);
    } else if (ext === ".pdf") {
      fileType = "document";
      extractedText = extractPdfText(filePath);
    } else if (ext === ".csv") {
      fileType = "spreadsheet";
      extractedText = extractXlsText(filePath);
    } else if (ext === ".xlsx" || ext === ".xls") {
      fileType = "spreadsheet";
      // No extraction without openpyxl — reference path only
    }

    return NextResponse.json({
      id,
      name: file.name,
      fileName,
      path: filePath,
      size: file.size,
      type: fileType,
      mimeType: file.type,
      extractedText: extractedText || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
