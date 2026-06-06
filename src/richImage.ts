import type { RichImageValue } from "./types";

const defaultFps = 8;

export function defaultRichImageValue(
  mode: RichImageValue["mode"] = "single",
): RichImageValue {
  return {
    mode,
    frames: [],
    fps: defaultFps,
    loop: true,
    sampling: "point",
    compression: "none",
  };
}

export function normalizeRichImageValue(
  value: unknown,
  fallbackMode: RichImageValue["mode"] = "single",
): RichImageValue {
  if (typeof value === "string") {
    return {
      ...defaultRichImageValue("single"),
      frames: value ? [value] : [],
    };
  }

  if (Array.isArray(value)) {
    return {
      ...defaultRichImageValue("sequence"),
      frames: value.filter(
        (item): item is string => typeof item === "string" && Boolean(item),
      ),
    };
  }

  if (value && typeof value === "object") {
    const source = value as Partial<RichImageValue>;
    const frames = Array.isArray(source.frames)
      ? source.frames.filter(
          (item): item is string => typeof item === "string" && Boolean(item),
        )
      : [];
    const mode =
      source.mode === "sequence" || source.mode === "single"
        ? source.mode
        : fallbackMode;
    return {
      mode,
      frames,
      fps: normalizeFps(source.fps),
      loop: source.loop !== false,
      sampling: "point",
      compression: "none",
    };
  }

  return defaultRichImageValue(fallbackMode);
}

export function richImageFramePaths(value: unknown) {
  return normalizeRichImageValue(value).frames;
}

export function richImageHasFrames(value: unknown) {
  return richImageFramePaths(value).length > 0;
}

export function richImageFrameDelay(value: RichImageValue) {
  return Math.round(1000 / normalizeFps(value.fps));
}

function normalizeFps(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return defaultFps;
  return Math.min(60, Math.max(1, Math.round(numeric)));
}
