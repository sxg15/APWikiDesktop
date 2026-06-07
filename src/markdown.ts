import type {
  FieldDefinition,
  KnowledgeEntry,
  KnowledgeTemplate,
  ParameterRow,
  RichImageValue,
  TileSizeValue,
} from "./types";
import {
  defaultRichImageValue,
  normalizeRichImageValue,
} from "./richImage";
import {
  defaultTileSizeValue,
  normalizeTileSizeValue,
} from "./tileSize";

export function defaultValueForField(field: FieldDefinition): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "boolean") return false;
  if (field.type === "number") return 0;
  if (
    field.type === "multiselect" ||
    field.type === "tags"
  ) {
    return [];
  }
  if (
    field.type === "richImage" ||
    field.type === "image" ||
    field.type === "frameSequence"
  ) {
    return defaultRichImageValue(
      field.type === "frameSequence" ? "sequence" : "single",
    );
  }
  if (field.type === "parameterTable") return [];
  if (field.type === "tileSize") return defaultTileSizeValue();
  return "";
}

export function valuesFromTemplate(template: KnowledgeTemplate) {
  return Object.fromEntries(
    template.fields.map((field) => [field.id, defaultValueForField(field)]),
  );
}

export function entryTitle(template: KnowledgeTemplate, entry: KnowledgeEntry) {
  const configured = textFieldById(template, template.titleFieldId);
  const preferred =
    configured ??
    template.fields.find((field) =>
      ["name", "displayName", "title", "methodName"].includes(field.id),
    ) ??
    template.fields.find((field) => field.type === "text");
  const raw = preferred ? entry.values[preferred.id] : entry.title;
  const title = textValue(raw);
  return title || "未命名知识";
}

export function entryListDescription(
  template: KnowledgeTemplate,
  entry: KnowledgeEntry,
) {
  const field = textFieldById(template, template.descriptionFieldId);
  return field ? textValue(entry.values[field.id]) : "";
}

export function entryIconAssetPath(
  template: KnowledgeTemplate,
  entry: KnowledgeEntry,
) {
  return entryIconAssetPaths(template, entry)[0] ?? "";
}

export function entryIconAssetPaths(
  template: KnowledgeTemplate,
  entry: KnowledgeEntry,
) {
  return entryIconRichImage(template, entry).frames;
}

export function entryIconRichImage(
  template: KnowledgeTemplate,
  entry: KnowledgeEntry,
): RichImageValue {
  const field = template.fields.find(
    (item) =>
      item.id === template.iconFieldId &&
      (item.type === "richImage" ||
        item.type === "image" ||
        item.type === "frameSequence"),
  );
  if (!field) return defaultRichImageValue("single");
  const value = entry.values[field.id];
  return normalizeRichImageValue(
    value,
    field.type === "frameSequence" ? "sequence" : "single",
  );
}

export function renderMarkdownTemplate(
  template: KnowledgeTemplate,
  entry: KnowledgeEntry,
) {
  const byId = new Map(template.fields.map((field) => [field.id, field]));
  const byLabel = new Map(template.fields.map((field) => [field.label, field]));
  const richImageFields = template.fields.filter(isRichImageField);

  const rendered = template.markdownTemplate.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const normalized = String(key).trim();
    if (normalized === "title") return entryTitle(template, entry);
    if (normalized === "templateName") return template.name;
    if (normalized === "createdAt") return formatDate(entry.createdAt);
    if (normalized === "updatedAt") return formatDate(entry.updatedAt);

    const field = byId.get(normalized) ?? byLabel.get(normalized);
    if (!field) return "";
    return formatValue(field, entry.values[field.id], entry);
  });
  const missingRichImages = richImageFields
    .filter((field) => !templateUsesField(template.markdownTemplate, field))
    .map((field) => formatValue(field, entry.values[field.id], entry))
    .filter(Boolean);
  return insertAfterFirstHeading(rendered, missingRichImages.join("\n\n"));
}

export function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatValue(field: FieldDefinition, value: unknown, entry: KnowledgeEntry) {
  if (field.type === "parameterTable") return formatParameterTable(value);
  if (field.type === "tags" || field.type === "multiselect") {
    return Array.isArray(value) ? value.filter(Boolean).join("，") : "";
  }
  if (
    field.type === "richImage" ||
    field.type === "image" ||
    field.type === "frameSequence"
  ) {
    return formatRichImage(field.label, value, entry, field.type);
  }
  if (field.type === "tileSize") return formatTileSize(value);
  if (field.type === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatRichImage(
  label: string,
  value: unknown,
  entry: KnowledgeEntry,
  fieldType: FieldDefinition["type"],
) {
  const richImage = normalizeRichImageValue(
    value,
    fieldType === "frameSequence" ? "sequence" : "single",
  );
  if (!richImage.frames.length) return "";
  const payload: RichImageValue & { alt: string } = {
    ...richImage,
    alt: label,
    frames: richImage.frames.map((frame) => markdownAssetPath(frame, entry)),
    sampling: "point",
    compression: "none",
  };
  return `\n\n:::ap-rich-image\n${JSON.stringify(payload)}\n:::\n\n`;
}

function formatTileSize(value: unknown) {
  const tileSize: TileSizeValue = normalizeTileSizeValue(value);
  return `\n\n:::ap-tile-size\n${JSON.stringify(tileSize)}\n:::\n\n`;
}

function isRichImageField(field: FieldDefinition) {
  return (
    field.type === "richImage" ||
    field.type === "image" ||
    field.type === "frameSequence"
  );
}

function templateUsesField(markdownTemplate: string, field: FieldDefinition) {
  return new RegExp(`\\{\\{\\s*${escapeRegExp(field.id)}\\s*\\}\\}`).test(
    markdownTemplate,
  ) || new RegExp(`\\{\\{\\s*${escapeRegExp(field.label)}\\s*\\}\\}`).test(
    markdownTemplate,
  );
}

function insertAfterFirstHeading(markdown: string, insert: string) {
  const normalizedInsert = insert.trim();
  if (!normalizedInsert) return markdown;
  const heading = markdown.match(/^(#{1,6}\s+.+)(\r?\n|$)/);
  if (!heading?.index && heading?.[0]) {
    return `${heading[0]}\n${normalizedInsert}\n\n${markdown.slice(heading[0].length).trimStart()}`;
  }
  return `${normalizedInsert}\n\n${markdown}`;
}

function markdownAssetPath(value: string, entry: KnowledgeEntry) {
  if (/^(data:|blob:|https?:)/.test(value)) return value;
  const normalized = value.replace(/\\/g, "/");
  const entryPrefix = `entries/${entry.templateId}/${entry.id}/`;
  if (normalized.startsWith(entryPrefix)) {
    return normalized.slice(entryPrefix.length);
  }
  return normalized;
}

function formatParameterTable(value: unknown) {
  const rows = Array.isArray(value) ? (value as ParameterRow[]) : [];
  if (!rows.length) return "无";

  const lines = [
    "| 参数名 | 类型 | 必填 | 默认值 | 描述 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.type,
        row.required ? "是" : "否",
        row.defaultValue || "-",
        row.description,
      ]
        .map(escapeTableCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  return lines.join("\n");
}

function escapeTableCell(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br />");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textFieldById(template: KnowledgeTemplate, fieldId?: string) {
  if (!fieldId) return undefined;
  return template.fields.find(
    (field) => field.id === fieldId && field.type === "text",
  );
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
