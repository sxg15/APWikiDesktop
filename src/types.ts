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
  color: string;
  fields: FieldDefinition[];
  markdownTemplate: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface LibraryState {
  templates: KnowledgeTemplate[];
  entries: KnowledgeEntry[];
  initialized?: boolean;
}

export interface AppSettings {
  libraryDir?: string;
}
