import type {
  FieldDefinition,
  KnowledgeEntry,
  KnowledgeTemplate,
  ParameterRow,
} from "./types";

export function defaultValueForField(field: FieldDefinition): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "boolean") return false;
  if (field.type === "number") return 0;
  if (
    field.type === "multiselect" ||
    field.type === "tags" ||
    field.type === "frameSequence"
  ) {
    return [];
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
  const preferred =
    template.fields.find((field) =>
      ["name", "displayName", "title", "methodName"].includes(field.id),
    ) ?? template.fields.find((field) => field.type === "text");
  const raw = preferred ? entry.values[preferred.id] : entry.title;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "未命名知识";
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
  if (field.type === "image") return formatImage(field.label, value, entry);
  if (field.type === "frameSequence") {
    return formatFrameSequence(field.label, value, entry);
  }
  if (field.type === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatImage(label: string, value: unknown, entry: KnowledgeEntry) {
  if (typeof value !== "string" || !value) return "";
  return `![${escapeImageAlt(label)}](${markdownAssetPath(value, entry)})`;
}

function formatFrameSequence(
  label: string,
  value: unknown,
  entry: KnowledgeEntry,
) {
  const frames = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
    : [];
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
