import { defaultLanguage, type LanguageCode } from "./i18n";
import type {
  FieldDefinition,
  KnowledgeEntry,
  KnowledgeEntryTranslation,
  KnowledgeTemplate,
  KnowledgeTemplateTranslation,
} from "./types";

export function localizeTemplate(
  template: KnowledgeTemplate,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
): KnowledgeTemplate {
  const fallback = templateTranslation(template, fallbackLanguage);
  const selected =
    language === fallbackLanguage
      ? fallback
      : templateTranslation(template, language) ?? fallback;
  return {
    ...template,
    name: selected?.name ?? fallback?.name ?? template.name,
    description:
      selected?.description ?? fallback?.description ?? template.description,
    fields: cloneFields(selected?.fields ?? fallback?.fields ?? template.fields),
    markdownTemplate:
      selected?.markdownTemplate ??
      fallback?.markdownTemplate ??
      template.markdownTemplate,
  };
}

export function localizeEntry(
  entry: KnowledgeEntry,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
): KnowledgeEntry {
  const fallback = entryTranslation(entry, fallbackLanguage);
  const selected =
    language === fallbackLanguage
      ? fallback
      : entryTranslation(entry, language) ?? fallback;
  return {
    ...entry,
    title: selected?.title ?? fallback?.title ?? entry.title,
    values: cloneValues(selected?.values ?? fallback?.values ?? entry.values),
  };
}

export function mergeTemplateLanguage(
  base: KnowledgeTemplate,
  draft: KnowledgeTemplate,
  language: LanguageCode,
): KnowledgeTemplate {
  const translation = templateLanguagePayload(draft);
  const translations = { ...(base.translations ?? {}), [language]: translation };
  if (language === defaultLanguage) {
    return {
      ...base,
      ...translation,
      color: draft.color,
      icon: draft.icon,
      iconImage: draft.iconImage,
      translations,
      updatedAt: draft.updatedAt,
    };
  }

  return {
    ...base,
    color: draft.color,
    icon: draft.icon,
    iconImage: draft.iconImage,
    fields: mergeSharedFields(base.fields, draft.fields),
    translations,
    updatedAt: draft.updatedAt,
  };
}

export function ensureEntryLanguage(
  entry: KnowledgeEntry,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
): KnowledgeEntryTranslation {
  const current = entryTranslation(entry, language);
  if (current?.values) return { ...current, values: cloneValues(current.values) };
  const fallback = entryTranslation(entry, fallbackLanguage);
  return {
    title: current?.title ?? fallback?.title ?? entry.title,
    values: cloneValues(fallback?.values ?? entry.values),
  };
}

export function updateEntryLanguageValue(
  entry: KnowledgeEntry,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
  fieldId: string,
  value: unknown,
): KnowledgeEntry {
  const translation = ensureEntryLanguage(entry, language, fallbackLanguage);
  const nextTranslation = {
    ...translation,
    values: { ...(translation.values ?? {}), [fieldId]: value },
  };
  const translations = {
    ...(entry.translations ?? {}),
    [language]: nextTranslation,
  };
  const next = { ...entry, translations };
  if (language === defaultLanguage) {
    next.values = nextTranslation.values;
    next.title = nextTranslation.title ?? entry.title;
  }
  return next;
}

export function updateEntryLanguageTitle(
  entry: KnowledgeEntry,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
  title: string,
): KnowledgeEntry {
  const translation = ensureEntryLanguage(entry, language, fallbackLanguage);
  const nextTranslation = { ...translation, title };
  const translations = {
    ...(entry.translations ?? {}),
    [language]: nextTranslation,
  };
  const next = { ...entry, title, translations };
  if (language !== defaultLanguage) {
    next.title = entry.title;
  }
  return next;
}

function templateTranslation(
  template: KnowledgeTemplate,
  language: LanguageCode,
) {
  return template.translations?.[language];
}

function entryTranslation(entry: KnowledgeEntry, language: LanguageCode) {
  return entry.translations?.[language];
}

function templateLanguagePayload(
  template: KnowledgeTemplate,
): KnowledgeTemplateTranslation {
  return {
    name: template.name,
    description: template.description,
    fields: cloneFields(template.fields),
    markdownTemplate: template.markdownTemplate,
  };
}

function mergeSharedFields(
  baseFields: FieldDefinition[],
  draftFields: FieldDefinition[],
) {
  return draftFields.map((field) => {
    const existing = baseFields.find((item) => item.id === field.id);
    if (!existing) return { ...field };
    return {
      ...existing,
      type: field.type,
      required: field.required,
      defaultValue: field.defaultValue,
    };
  });
}

function cloneFields(fields: FieldDefinition[]) {
  return JSON.parse(JSON.stringify(fields)) as FieldDefinition[];
}

function cloneValues(values: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(values)) as Record<string, unknown>;
}
