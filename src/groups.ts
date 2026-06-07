import { defaultLanguage, type LanguageCode } from "./i18n";
import type {
  FieldDefinition,
  FieldOption,
  KnowledgeEntry,
  KnowledgeTemplate,
  TemplateGroupOption,
} from "./types";

export const ungroupedGroupId = "__ungrouped__";

export function isGroupField(field: FieldDefinition) {
  return field.id === "group" || field.id === "category";
}

export function normalizeTemplateGroups(
  groupOptions?: TemplateGroupOption[],
  legacyLabels: string[] = [],
) {
  const groups: TemplateGroupOption[] = [];
  const usedIds = new Set<string>();

  for (const [index, group] of (groupOptions ?? []).entries()) {
    const normalized = normalizeGroupOption(group, index);
    const id = uniqueGroupId(normalized.id, usedIds);
    usedIds.add(id);
    groups.push({ ...normalized, id });
  }

  for (const label of legacyLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    if (groups.some((group) => groupLabelMatches(group, trimmed))) continue;
    const id = uniqueGroupId(safeGroupId(trimmed, "group"), usedIds);
    usedIds.add(id);
    groups.push({
      id,
      label: trimmed,
      translations: { [defaultLanguage]: trimmed },
    });
  }

  return groups;
}

export function normalizeGroupOption(
  group: TemplateGroupOption,
  index = 0,
): TemplateGroupOption {
  const label = String(group.label || group.id || `分组 ${index + 1}`);
  return {
    id: safeGroupId(group.id || label, `group-${index + 1}`),
    label,
    translations: normalizeTranslations(group.translations),
  };
}

export function groupOptionLabel(
  group: TemplateGroupOption,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
) {
  return (
    group.translations?.[language] ||
    group.translations?.[fallbackLanguage] ||
    group.translations?.[defaultLanguage] ||
    group.label ||
    group.id
  );
}

export function groupOptionsAsFieldOptions(
  template: Pick<KnowledgeTemplate, "groupOptions">,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
): FieldOption[] {
  return (template.groupOptions ?? []).map((group) => ({
    label: groupOptionLabel(group, language, fallbackLanguage),
    value: group.id,
  }));
}

export function normalizeEntryGroupIds(
  entry: Pick<KnowledgeEntry, "groupIds" | "values" | "translations">,
  template?: Pick<KnowledgeTemplate, "groupOptions">,
) {
  const knownGroups = template?.groupOptions ?? [];
  const knownIds = new Set(knownGroups.map((group) => group.id));
  const ids = new Set<string>();

  for (const value of entry.groupIds ?? []) {
    if (knownIds.has(value)) ids.add(value);
  }

  for (const label of legacyGroupLabels(entry)) {
    const match = knownGroups.find((group) => groupLabelMatches(group, label));
    if (match) ids.add(match.id);
  }

  return [...ids];
}

export function legacyGroupLabels(
  entry: Pick<KnowledgeEntry, "values" | "translations">,
) {
  const labels = new Set<string>();
  addGroupLabels(labels, entry.values?.group);
  addGroupLabels(labels, entry.values?.category);
  for (const translation of Object.values(entry.translations ?? {})) {
    addGroupLabels(labels, translation?.values?.group);
    addGroupLabels(labels, translation?.values?.category);
  }
  return [...labels];
}

export function entryGroupLabels(
  template: Pick<KnowledgeTemplate, "groupOptions">,
  entry: Pick<KnowledgeEntry, "groupIds">,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
) {
  const groups = template.groupOptions ?? [];
  return (entry.groupIds ?? [])
    .map((id) => groups.find((group) => group.id === id))
    .filter((group): group is TemplateGroupOption => Boolean(group))
    .map((group) => groupOptionLabel(group, language, fallbackLanguage));
}

function groupLabelMatches(group: TemplateGroupOption, label: string) {
  const normalized = normalizeLabel(label);
  return [
    group.id,
    group.label,
    ...Object.values(group.translations ?? {}),
  ].some((value) => normalizeLabel(value) === normalized);
}

function addGroupLabels(target: Set<string>, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) addGroupLabels(target, item);
    return;
  }
  if (typeof value !== "string") return;
  for (const item of value.split(/[，,]/)) {
    const trimmed = item.trim();
    if (trimmed) target.add(trimmed);
  }
}

function uniqueGroupId(value: string, usedIds: Set<string>) {
  let candidate = safeGroupId(value, "group");
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${safeGroupId(value, "group")}-${index}`;
    index += 1;
  }
  return candidate;
}

function safeGroupId(value: string, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function normalizeTranslations(
  translations?: Partial<Record<LanguageCode, string>>,
) {
  if (!translations) return undefined;
  const entries = Object.entries(translations)
    .map(([language, value]) => [language, String(value ?? "")] as const)
    .filter(([, value]) => value.trim() !== "");
  return entries.length
    ? (Object.fromEntries(entries) as Partial<Record<LanguageCode, string>>)
    : undefined;
}

function normalizeLabel(value: string) {
  return String(value ?? "").trim().toLocaleLowerCase();
}
