import { normalizeRichImageValue } from "./richImage";
import type { RichImageValue } from "./types";

export type MarkdownRichImageSegment =
  | { type: "markdown"; content: string }
  | { type: "richImage"; alt: string; value: RichImageValue };

const richImageBlockPattern =
  /^[ \t]*:::\s*(?:ap-rich-image|rich-image|富图片)\s*\r?\n([\s\S]*?)\r?\n[ \t]*:::\s*$/gm;

export function parseRichImageMarkdown(markdown: string) {
  const segments: MarkdownRichImageSegment[] = [];
  let cursor = 0;

  for (const match of markdown.matchAll(richImageBlockPattern)) {
    const index = match.index ?? 0;
    const before = markdown.slice(cursor, index);
    if (before) {
      segments.push({ type: "markdown", content: before });
    }

    const parsed = parseRichImageBlock(match[1]);
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

function stripCodeFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
