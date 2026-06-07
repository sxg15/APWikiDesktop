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
  | "richImage"
  | "image"
  | "frameSequence"
  | "tileSize"
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
  optionSetId?: string;
}

export interface TemplateOptionItem {
  id: string;
  value: string;
  label: string;
  translations?: Partial<Record<LanguageCode, string>>;
}

export interface TemplateOptionSet {
  id: string;
  name: string;
  items: TemplateOptionItem[];
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
  optionSets?: TemplateOptionSet[];
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

export interface RichImageValue {
  mode: "single" | "sequence";
  frames: string[];
  fps: number;
  loop: boolean;
  sampling: "point";
  compression: "none";
}

export interface TileSizeValue {
  up: number;
  right: number;
  down: number;
  left: number;
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
