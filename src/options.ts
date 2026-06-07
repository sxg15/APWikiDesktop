import { defaultLanguage, type LanguageCode } from "./i18n";
import type {
  FieldDefinition,
  FieldOption,
  KnowledgeTemplate,
  TemplateOptionItem,
  TemplateOptionSet,
} from "./types";

export function isChoiceField(field: FieldDefinition) {
  return field.type === "select" || field.type === "multiselect";
}

export function normalizeChoiceConfig(
  fields: FieldDefinition[],
  optionSets?: TemplateOptionSet[],
) {
  const nextOptionSets: TemplateOptionSet[] = [];
  const optionSetIds = new Set<string>();

  for (const [index, optionSet] of (optionSets ?? []).entries()) {
    const normalized = normalizeOptionSet(optionSet, index);
    const uniqueId = uniqueOptionSetId(normalized.id, optionSetIds);
    optionSetIds.add(uniqueId);
    nextOptionSets.push({ ...normalized, id: uniqueId });
  }

  const nextFields = fields.map((field, index) => {
    if (!isChoiceField(field)) return field;
    if (field.optionSetId) return field;
    if (!field.options?.length) return field;

    const optionSetId = uniqueOptionSetId(
      optionSetIdFromField(field, index),
      optionSetIds,
    );
    optionSetIds.add(optionSetId);
    nextOptionSets.push({
      id: optionSetId,
      name: field.label || field.id || `选项 ${index + 1}`,
      items: field.options.map((option, optionIndex) =>
        optionItemFromFieldOption(option, optionIndex),
      ),
    });
    return { ...field, optionSetId, options: undefined };
  });

  return { fields: nextFields, optionSets: nextOptionSets };
}

export function normalizeOptionSet(
  optionSet: TemplateOptionSet,
  index = 0,
): TemplateOptionSet {
  const id = safeOptionId(optionSet.id, `option-set-${index + 1}`);
  return {
    id,
    name: String(optionSet.name || `选项 ${index + 1}`),
    items: (optionSet.items ?? []).map(normalizeOptionItem),
  };
}

export function normalizeOptionItem(
  item: TemplateOptionItem,
  index = 0,
): TemplateOptionItem {
  const value = String(item.value || item.id || item.label || `option${index + 1}`);
  const label = String(item.label || item.value || item.id || `选项 ${index + 1}`);
  return {
    id: safeOptionId(item.id || value, `option-item-${index + 1}`),
    value,
    label,
    translations: normalizeTranslations(item.translations),
  };
}

export function optionItemLabel(
  item: TemplateOptionItem,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
) {
  return (
    item.translations?.[language] ||
    item.translations?.[fallbackLanguage] ||
    item.translations?.[defaultLanguage] ||
    item.label ||
    item.value
  );
}

export function fieldOptionsForTemplate(
  field: FieldDefinition,
  template: KnowledgeTemplate,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
): FieldOption[] {
  const optionSet = (template.optionSets ?? []).find(
    (item) => item.id === field.optionSetId,
  );
  if (optionSet) {
    return optionSet.items.map((item) => ({
      label: optionItemLabel(item, language, fallbackLanguage),
      value: item.value,
    }));
  }
  return field.options ?? [];
}

function optionItemFromFieldOption(
  option: FieldOption,
  index: number,
): TemplateOptionItem {
  const value = String(option.value || option.label || `option${index + 1}`);
  const label = String(option.label || option.value || `选项 ${index + 1}`);
  return {
    id: safeOptionId(value, `option-item-${index + 1}`),
    value,
    label,
    translations: { [defaultLanguage]: label },
  };
}

function optionSetIdFromField(field: FieldDefinition, index: number) {
  return safeOptionId(
    `${field.id || field.label || `field-${index + 1}`}-options`,
    `field-${index + 1}-options`,
  );
}

function uniqueOptionSetId(value: string, usedIds: Set<string>) {
  let candidate = safeOptionId(value, "option-set");
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${safeOptionId(value, "option-set")}-${index}`;
    index += 1;
  }
  return candidate;
}

function safeOptionId(value: string, fallback: string) {
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
