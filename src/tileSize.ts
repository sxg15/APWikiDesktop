import type { TileSizeValue } from "./types";

const tileSizeKeys = ["up", "right", "down", "left"] as const;

export function defaultTileSizeValue(): TileSizeValue {
  return { up: 0, right: 0, down: 0, left: 0 };
}

export function normalizeTileSizeValue(value: unknown): TileSizeValue {
  if (!value || typeof value !== "object") return defaultTileSizeValue();
  const source = value as Partial<
    Record<(typeof tileSizeKeys)[number] | "上" | "右" | "下" | "左", unknown>
  >;
  return {
    up: normalizeTileSizeNumber(source.up ?? source["上"]),
    right: normalizeTileSizeNumber(source.right ?? source["右"]),
    down: normalizeTileSizeNumber(source.down ?? source["下"]),
    left: normalizeTileSizeNumber(source.left ?? source["左"]),
  };
}

export function tileSizeHasCells(value: unknown) {
  const normalized = normalizeTileSizeValue(value);
  return tileSizeKeys.some((key) => normalized[key] > 0);
}

function normalizeTileSizeNumber(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.min(20, Math.max(0, Math.floor(numberValue)));
}
