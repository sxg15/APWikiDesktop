import type { LanguageCode } from "./i18n";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "tags"
  | "parameterTable"
  | "image"
  | "frameSequence"
  | "markdown";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: FieldOption[];
}

export interface KnowledgeTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  iconImage?: string;
  titleFieldId?: string;
  iconFieldId?: string;
  descriptionFieldId?: string;
  color: string;
  fields: FieldDefinition[];
  markdownTemplate: string;
  translations?: Partial<Record<LanguageCode, KnowledgeTemplateTranslation>>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeTemplateTranslation {
  name?: string;
  description?: string;
  fields?: FieldDefinition[];
  markdownTemplate?: string;
}

export interface ParameterRow {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string;
  description: string;
}

export interface KnowledgeEntry {
  id: string;
  templateId: string;
  title: string;
  values: Record<string, unknown>;
  translations?: Partial<Record<LanguageCode, KnowledgeEntryTranslation>>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntryTranslation {
  title?: string;
  values?: Record<string, unknown>;
}

export interface LibraryState {
  templates: KnowledgeTemplate[];
  entries: KnowledgeEntry[];
  initialized?: boolean;
}

export interface AppSettings {
  libraryDir?: string;
  displayLanguage?: LanguageCode;
  fallbackLanguage?: LanguageCode;
}
