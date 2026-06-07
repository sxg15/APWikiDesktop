import { normalizeRichImageValue } from "./richImage";
import { normalizeTileSizeValue } from "./tileSize";
import type { RichImageValue, TileSizeValue } from "./types";

export type MarkdownRichImageSegment =
  | { type: "markdown"; content: string }
  | { type: "richImage"; alt: string; value: RichImageValue }
  | { type: "tileSize"; value: TileSizeValue };

const customBlockPattern =
  /^[ \t]*:::\s*(ap-rich-image|rich-image|富图片|ap-tile-size|tile-size|瓦片尺寸)\s*\r?\n([\s\S]*?)\r?\n[ \t]*:::\s*$/gm;

export function parseRichImageMarkdown(markdown: string) {
  const segments: MarkdownRichImageSegment[] = [];
  let cursor = 0;

  for (const match of markdown.matchAll(customBlockPattern)) {
    const index = match.index ?? 0;
    const before = markdown.slice(cursor, index);
    if (before) {
      segments.push({ type: "markdown", content: before });
    }

    const parsed = parseCustomBlock(match[1], match[2]);
    if (parsed) {
      segments.push(parsed);
    } else {
      segments.push({ type: "markdown", content: match[0] });
    }
    cursor = index + match[0].length;
  }

  const after = markdown.slice(cursor);
  if (after || segments.length === 0) {
    segments.push({ type: "markdown", content: after });
  }

  return segments;
}

function parseCustomBlock(
  blockType: string,
  value: string,
): MarkdownRichImageSegment | undefined {
  if (
    blockType === "ap-tile-size" ||
    blockType === "tile-size" ||
    blockType === "瓦片尺寸"
  ) {
    return parseTileSizeBlock(value);
  }
  return parseRichImageBlock(value);
}

function parseRichImageBlock(value: string): MarkdownRichImageSegment | undefined {
  try {
    const parsed = JSON.parse(stripCodeFence(value.trim())) as { alt?: unknown };
    const richImage = normalizeRichImageValue(parsed);
    if (!richImage.frames.length) return undefined;
    return {
      type: "richImage",
      alt: typeof parsed.alt === "string" ? parsed.alt : "富图片",
      value: richImage,
    };
  } catch {
    return undefined;
  }
}

function parseTileSizeBlock(value: string): MarkdownRichImageSegment | undefined {
  try {
    return {
      type: "tileSize",
      value: normalizeTileSizeValue(JSON.parse(stripCodeFence(value.trim()))),
    };
  } catch {
    return undefined;
  }
}

function stripCodeFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
