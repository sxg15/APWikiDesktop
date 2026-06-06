import type {
  FieldDefinition,
  KnowledgeEntry,
  KnowledgeTemplate,
  ParameterRow,
  RichImageValue,
} from "./types";
import {
  defaultRichImageValue,
  normalizeRichImageValue,
  richImageFramePaths,
} from "./richImage";

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

  return template.markdownTemplate.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const normalized = String(key).trim();
    if (normalized === "title") return entryTitle(template, entry);
    if (normalized === "templateName") return template.name;
    if (normalized === "createdAt") return formatDate(entry.createdAt);
    if (normalized === "updatedAt") return formatDate(entry.updatedAt);

    const field = byId.get(normalized) ?? byLabel.get(normalized);
    if (!field) return "";
    return formatValue(field, entry.values[field.id], entry);
  });
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
  const frames =
    fieldType === "richImage"
      ? normalizeRichImageValue(value).frames
      : fieldType === "frameSequence"
        ? richImageFramePaths(Array.isArray(value) ? value : [])
        : richImageFramePaths(typeof value === "string" ? value : "");
  if (!frames.length) return "";
  return frames
    .map(
      (frame, index) =>
        `![${escapeImageAlt(`${label} ${index + 1}`)}](${markdownAssetPath(
          frame,
          entry,
        )})`,
    )
    .join("\n\n");
}

function markdownAssetPath(value: string, entry: KnowledgeEntry) {
  if (/^(data:|blob:|https?:)/.test(value)) return value;
  const normalized = value.replace(/\\/g, "/");
  const entryPrefix = `entries/${entry.templateId}/${entry.id}/`;
  if (normalized.startsWith(entryPrefix)) {
    return normalized.slice(entryPrefix.length);
  }
  return normalized.startsWith("assets/") ? `../../../${normalized}` : normalized;
}

function escapeImageAlt(value: string) {
  return value.replace(/\]/g, "\\]");
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

function textFieldById(template: KnowledgeTemplate, fieldId?: string) {
  if (!fieldId) return undefined;
  return template.fields.find(
    (field) => field.id === fieldId && field.type === "text",
  );
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
