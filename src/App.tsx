import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  Box,
  BookOpen,
  Boxes,
  ChevronDown,
  CheckCircle2,
  CircleDot,
  Code2,
  Copy,
  Database,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Gamepad2,
  Grid3x3,
  GripVertical,
  Image as ImageIcon,
  Images,
  Layers,
  LayoutTemplate,
  ListTree,
  Maximize2,
  Menu,
  Minimize2,
  Pause,
  Plus,
  Play,
  Puzzle,
  Save,
  Search,
  Settings,
  Sparkles,
  StepBack,
  StepForward,
  ScrollText,
  Trash2,
  Upload,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import {
  chooseLibraryDirectory,
  deleteEntry,
  deleteTemplate,
  exportEntryMarkdown,
  getSettings,
  importEntryImages,
  importTemplateIcon,
  loadLibraryAsset,
  loadTemplateIcon,
  loadLibrary,
  saveEntry,
  saveSettings,
  saveTemplate,
} from "./api";
import { defaultTemplates } from "./defaultTemplates";
import {
  defaultLanguage,
  languageName,
  normalizeLanguage,
  supportedLanguages,
  type LanguageCode,
} from "./i18n";
import {
  localizeEntry,
  localizeTemplate,
  mergeTemplateLanguage,
  updateEntryLanguageTitle,
  updateEntryLanguageValue,
} from "./localization";
import {
  defaultValueForField,
  entryIconRichImage,
  entryListDescription,
  entryTitle,
  formatDate,
  generatedMarkdownTemplate,
  renderMarkdownTemplate,
  valuesFromTemplate,
} from "./markdown";
import {
  fieldOptionsForTemplate,
  isChoiceField,
  normalizeChoiceConfig,
  normalizeOptionItem,
  normalizeOptionSet,
  optionItemLabel,
} from "./options";
import {
  defaultRichImageValue,
  normalizeRichImageValue,
  richImageFrameDelay,
  richImageHasFrames,
} from "./richImage";
import { parseRichImageMarkdown } from "./richImageMarkdown";
import {
  entryGroupLabels,
  groupOptionLabel,
  groupOptionsAsFieldOptions,
  isGroupField,
  legacyGroupLabels,
  normalizeEntryGroupIds,
  normalizeGroupOption,
  normalizeTemplateGroups,
  ungroupedGroupId,
} from "./groups";
import {
  normalizeTileSizeValue,
  tileSizeHasCells,
} from "./tileSize";
import type {
  FieldDefinition,
  FieldOption,
  FieldType,
  KnowledgeEntry,
  KnowledgeTemplate,
  KnowledgeTemplateTranslation,
  ParameterRow,
  RichImageValue,
  TemplateGroupOption,
  TemplateOptionItem,
  TemplateOptionSet,
  TileSizeValue,
} from "./types";

type EntryView = "edit" | "preview";
type SettingsTab = "library" | "language" | "layout" | "about";
type TemplateDesignerTab = "fields" | "options" | "groups";
type Status = { tone: "ok" | "warn"; text: string } | undefined;
type UnsavedChoice = "cancel" | "save" | "discard";
type UnsavedScope = "entry" | "template";
type LanguageEmptyMap = Partial<Record<LanguageCode, boolean>>;

const fieldTypeLabels: Record<FieldType, string> = {
  text: "单行文本",
  textarea: "多行文本",
  number: "数字",
  boolean: "开关",
  select: "单选",
  multiselect: "多选",
  tags: "标签",
  parameterTable: "参数表",
  richImage: "富图片",
  image: "富图片",
  frameSequence: "富图片",
  tileSize: "瓦片尺寸",
  markdown: "Markdown 文本",
};

const fieldTypes: FieldType[] = [
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "multiselect",
  "tags",
  "parameterTable",
  "richImage",
  "tileSize",
  "markdown",
];
const fieldsWithoutTextDefault = new Set<FieldType>([
  "parameterTable",
  "multiselect",
  "tags",
  "richImage",
  "image",
  "frameSequence",
  "tileSize",
]);

const templateIcons: Record<string, LucideIcon> = {
  BookOpen,
  Box,
  Boxes,
  CircleDot,
  Code2,
  Database,
  FileText,
  Gamepad2,
  Grid3x3,
  ImageIcon,
  Layers,
  ListTree,
  Puzzle,
  ScrollText,
  Sparkles,
  Wrench,
};

const templateIconOptions = [
  { name: "BookOpen", label: "书本" },
  { name: "Grid3x3", label: "网格" },
  { name: "Code2", label: "代码" },
  { name: "Database", label: "数据" },
  { name: "FileText", label: "文档" },
  { name: "Gamepad2", label: "游戏" },
  { name: "Layers", label: "层级" },
  { name: "ListTree", label: "列表" },
  { name: "Puzzle", label: "拼图" },
  { name: "ScrollText", label: "卷轴" },
  { name: "Sparkles", label: "星光" },
  { name: "Wrench", label: "工具" },
  { name: "Box", label: "方块" },
  { name: "Boxes", label: "方块组" },
  { name: "CircleDot", label: "圆点" },
  { name: "ImageIcon", label: "图片" },
];

function templateIconName(template?: Pick<KnowledgeTemplate, "icon" | "id">) {
  if (template?.icon && templateIcons[template.icon]) return template.icon;
  if (template?.id === "visual-method") return "Code2";
  if (template?.id === "tile") return "Grid3x3";
  return "BookOpen";
}

function TemplateIcon({
  size = 18,
  src,
  template,
}: {
  size?: number;
  src?: string;
  template?: Pick<KnowledgeTemplate, "icon" | "id">;
}) {
  if (src) {
    return <img alt="" className="template-icon-image" src={src} />;
  }
  const Icon = templateIcons[templateIconName(template)] ?? BookOpen;
  return <Icon size={size} />;
}

function EntryListIcon({
  entry,
  libraryDir,
  template,
  templateIconSrc,
}: {
  entry: KnowledgeEntry;
  libraryDir: string;
  template?: KnowledgeTemplate;
  templateIconSrc: string;
}) {
  const [entryIconFrames, setEntryIconFrames] = useState<string[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const richImage = useMemo(
    () =>
      template
        ? entryIconRichImage(template, entry)
        : defaultRichImageValue("single"),
    [entry, template],
  );
  const iconAssetPaths = richImage.frames;
  const iconAssetPathKey = iconAssetPaths.join("|");

  useEffect(() => {
    let cancelled = false;
    setFrameIndex(0);
    if (!iconAssetPaths.length) {
      setEntryIconFrames([]);
      return;
    }
    void Promise.all(
      iconAssetPaths.map((assetPath) =>
        /^(data:|blob:|https?:)/.test(assetPath)
          ? Promise.resolve(assetPath)
          : loadLibraryAsset(libraryDir, assetPath),
      ),
    )
      .then((frames) => {
        if (!cancelled) setEntryIconFrames(frames.filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setEntryIconFrames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [iconAssetPathKey, iconAssetPaths, libraryDir]);

  useEffect(() => {
    if (entryIconFrames.length <= 1) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= entryIconFrames.length - 1) {
          return richImage.loop ? 0 : current;
        }
        return current + 1;
      });
    }, richImageFrameDelay(richImage));
    return () => window.clearInterval(timer);
  }, [entryIconFrames.length, richImage]);

  const entryIconSrc =
    entryIconFrames.length > 0
      ? entryIconFrames[frameIndex % entryIconFrames.length]
      : "";

  return (
    <TemplateIcon
      src={entryIconSrc || templateIconSrc}
      template={template}
    />
  );
}

function cloneTemplate(template: KnowledgeTemplate) {
  return JSON.parse(JSON.stringify(template)) as KnowledgeTemplate;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function slugify(value: string, fallback: string) {
  const normalized = normalizeSlugInput(value);
  return normalized || fallback;
}

function normalizeSlugInput(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
}

function safeFileName(value: string) {
  return `${value.trim() || "未命名知识"}.md`.replace(/[\\/:*?"<>|]/g, "_");
}

function requiredMissing(field: FieldDefinition, value: unknown) {
  if (!field.required) return false;
  if (
    field.type === "richImage" ||
    field.type === "image" ||
    field.type === "frameSequence"
  ) {
    return !richImageHasFrames(value);
  }
  if (field.type === "tileSize") {
    return !tileSizeHasCells(value);
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return false;
  return value === undefined || value === null || String(value).trim() === "";
}

function entryGroupIds(entry: KnowledgeEntry) {
  return Array.isArray(entry.groupIds) ? entry.groupIds.filter(Boolean) : [];
}

function entryMatchesGroup(entry: KnowledgeEntry, groupId: string) {
  const groupIds = entryGroupIds(entry);
  if (groupId === ungroupedGroupId) return groupIds.length === 0;
  return groupIds.includes(groupId);
}

function entryGroupsText(
  template: KnowledgeTemplate,
  entry: KnowledgeEntry,
  language: LanguageCode,
  fallbackLanguage: LanguageCode,
) {
  const labels = entryGroupLabels(template, entry, language, fallbackLanguage);
  return labels.length ? labels.join("，") : "未分组";
}

function hasMeaningfulValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulValue(item));
  }
  if (value && typeof value === "object") {
    if ("frames" in value && "sampling" in value && "compression" in value) {
      return richImageHasFrames(value);
    }
    if (
      "up" in value &&
      "right" in value &&
      "down" in value &&
      "left" in value
    ) {
      return tileSizeHasCells(value);
    }
    return Object.values(value).some((item) => hasMeaningfulValue(item));
  }
  if (typeof value === "boolean") return value;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function previewMayBeEmpty(template: KnowledgeTemplate, entry: KnowledgeEntry) {
  return !template.fields.some((field) =>
    hasMeaningfulValue(entry.values[field.id]),
  );
}

function cloneEntry(entry: KnowledgeEntry) {
  return JSON.parse(JSON.stringify(entry)) as KnowledgeEntry;
}

function cloneEntries(entries: KnowledgeEntry[]) {
  return entries.map(cloneEntry);
}

function entriesById(entries: KnowledgeEntry[]) {
  return Object.fromEntries(entries.map((entry) => [entry.id, cloneEntry(entry)]));
}

function legacyGroupLabelsByTemplate(entries: KnowledgeEntry[]) {
  const byTemplate = new Map<string, Set<string>>();
  for (const entry of entries) {
    const labels = legacyGroupLabels(entry);
    if (!labels.length) continue;
    const current = byTemplate.get(entry.templateId) ?? new Set<string>();
    labels.forEach((label) => current.add(label));
    byTemplate.set(entry.templateId, current);
  }
  return new Map(
    [...byTemplate.entries()].map(([templateId, labels]) => [
      templateId,
      [...labels],
    ]),
  );
}

function entryValuesForLanguage(entry: KnowledgeEntry, language: LanguageCode) {
  if (language === defaultLanguage) return entry.values;
  return entry.translations?.[language]?.values;
}

function entryLanguageMayBeEmpty(
  entry: KnowledgeEntry | undefined,
  language: LanguageCode,
) {
  if (!entry) return true;
  const values = entryValuesForLanguage(entry, language);
  return !hasMeaningfulValue(values ?? {});
}

function entryLanguageEmptyMap(entry?: KnowledgeEntry): LanguageEmptyMap {
  return Object.fromEntries(
    supportedLanguages.map((language) => [
      language.code,
      entryLanguageMayBeEmpty(entry, language.code),
    ]),
  ) as LanguageEmptyMap;
}

function templateTranslationHasContent(
  template: KnowledgeTemplate | KnowledgeTemplateTranslation | undefined,
) {
  if (!template) return false;
  const groupOptions =
    "groupOptions" in template ? template.groupOptions : undefined;
  return hasMeaningfulValue({
    name: template.name,
    description: template.description,
    fields: template.fields?.map((field: FieldDefinition) => ({
      label: field.label,
      placeholder: field.placeholder,
      options: field.options,
    })),
    groupOptions: groupOptions?.map((group: TemplateGroupOption) => ({
      label: group.label,
      translations: group.translations,
    })),
  });
}

function templateLanguageMayBeEmpty(
  template: KnowledgeTemplate | undefined,
  language: LanguageCode,
) {
  if (!template) return true;
  if (language === defaultLanguage) return !templateTranslationHasContent(template);
  return !templateTranslationHasContent(template.translations?.[language]);
}

function templateLanguageEmptyMap(
  template?: KnowledgeTemplate,
  draftTemplate?: KnowledgeTemplate,
  currentLanguage?: LanguageCode,
): LanguageEmptyMap {
  return Object.fromEntries(
    supportedLanguages.map((language) => [
      language.code,
      draftTemplate && currentLanguage === language.code
        ? !templateTranslationHasContent(draftTemplate)
        : templateLanguageMayBeEmpty(template, language.code),
    ]),
  ) as LanguageEmptyMap;
}

function normalizeTemplate(
  template: KnowledgeTemplate,
  legacyGroupOptionLabels: string[] = [],
): KnowledgeTemplate {
  const normalizedFields = normalizeTemplateFields(template.fields);
  const choiceConfig = normalizeChoiceConfig(
    normalizedFields,
    template.optionSets,
  );
  const titleFieldId = choiceConfig.fields.some(
    (field) => field.id === normalizeFieldId(template.titleFieldId),
  )
    ? normalizeFieldId(template.titleFieldId)
    : undefined;
  const normalizedTemplate = {
    ...template,
    titleFieldId,
    fields: choiceConfig.fields,
  };
  const translations = template.translations
    ? Object.fromEntries(
        Object.entries(template.translations).map(([language, translation]) => [
          language,
          normalizeTemplateTranslation(normalizedTemplate, translation),
        ]),
      )
    : undefined;
  return {
    ...template,
    color: template.color || "#0f7c80",
    description: template.description ?? "",
    titleFieldId,
    iconFieldId: normalizeFieldId(template.iconFieldId),
    descriptionFieldId: normalizeFieldId(template.descriptionFieldId),
    icon: templateIconName(template),
    fields: choiceConfig.fields,
    optionSets: choiceConfig.optionSets,
    groupOptions: normalizeTemplateGroups(
      template.groupOptions,
      legacyGroupOptionLabels,
    ),
    translations: translations as KnowledgeTemplate["translations"],
    markdownTemplate: generatedMarkdownTemplate(normalizedTemplate),
  };
}

function normalizeTemplateTranslation(
  baseTemplate: Pick<KnowledgeTemplate, "fields" | "titleFieldId">,
  translation: KnowledgeTemplateTranslation | undefined,
) {
  if (!translation) return translation;
  const fields = translation.fields
    ? normalizeTemplateFields(translation.fields)
    : undefined;
  return {
    ...translation,
    fields,
    markdownTemplate: generatedMarkdownTemplate({
      ...baseTemplate,
      fields: fields ?? baseTemplate.fields,
    }),
  };
}

function normalizeTemplateFields(fields: FieldDefinition[]) {
  return fields.map(normalizeField).filter((field) => !isGroupField(field));
}

function normalizeFieldId(fieldId?: string) {
  return fieldId === "category" ? "group" : fieldId;
}

function normalizeField(field: FieldDefinition): FieldDefinition {
  if (field.id === "category") {
    return {
      ...field,
      id: "group",
      label: "分组",
      type: "text",
      required: false,
      options: undefined,
      placeholder: field.placeholder || "输入分组",
    };
  }
  if (field.type === "image" || field.type === "frameSequence") {
    return {
      ...field,
      type: "richImage",
      defaultValue:
        field.defaultValue === undefined
          ? undefined
          : normalizeRichImageValue(
              field.defaultValue,
              field.type === "frameSequence" ? "sequence" : "single",
        ),
    };
  }
  if (field.type === "tileSize") {
    return {
      ...field,
      defaultValue:
        field.defaultValue === undefined
          ? undefined
          : normalizeTileSizeValue(field.defaultValue),
    };
  }
  return field;
}

function normalizeEntry(entry: KnowledgeEntry, template?: KnowledgeTemplate): KnowledgeEntry {
  const groupIds = normalizeEntryGroupIds(entry, template);
  const values = normalizeEntryValues(entry.values, template);
  const translations = entry.translations
    ? Object.fromEntries(
        Object.entries(entry.translations).map(([language, translation]) => [
          language,
          translation
            ? {
                ...translation,
                values: translation.values
                  ? normalizeEntryValues(translation.values, template, false)
                  : translation.values,
              }
            : translation,
        ]),
      )
    : undefined;
  return {
    ...entry,
    groupIds,
    values: normalizeEntryValues(values, template),
    translations: translations as KnowledgeEntry["translations"],
  };
}

function normalizeEntryValues(
  values: Record<string, unknown>,
  template?: KnowledgeTemplate,
  fillMissingStructuredValues = true,
) {
  const next: Record<string, unknown> = { ...values };
  delete next.group;
  delete next.category;
  for (const field of template?.fields ?? []) {
    if (
      field.type === "richImage" ||
      field.type === "image" ||
      field.type === "frameSequence"
    ) {
      if (!fillMissingStructuredValues && next[field.id] === undefined) continue;
      next[field.id] = normalizeRichImageValue(
        next[field.id],
        field.type === "frameSequence" ? "sequence" : "single",
      );
    }
    if (field.type === "tileSize") {
      if (!fillMissingStructuredValues && next[field.id] === undefined) continue;
      next[field.id] = normalizeTileSizeValue(next[field.id]);
    }
  }
  return next;
}

export default function App() {
  const [libraryDir, setLibraryDir] = useState("");
  const [templates, setTemplates] = useState<KnowledgeTemplate[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [entryView, setEntryView] = useState<EntryView>("preview");
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [draftTemplate, setDraftTemplate] = useState<KnowledgeTemplate>();
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [savedEntries, setSavedEntries] = useState<Record<string, KnowledgeEntry>>({});
  const [dirtyEntryIds, setDirtyEntryIds] = useState<Set<string>>(() => new Set());
  const [unsavedPrompt, setUnsavedPrompt] =
    useState<{ scope: UnsavedScope } | undefined>(undefined);
  const unsavedPromptResolver = useRef<
    ((choice: UnsavedChoice) => void) | undefined
  >(undefined);
  const [status, setStatus] = useState<Status>();
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("library");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [iconSources, setIconSources] = useState<Record<string, string>>({});
  const [currentLanguage, setCurrentLanguage] =
    useState<LanguageCode>(defaultLanguage);
  const [fallbackLanguage, setFallbackLanguage] =
    useState<LanguageCode>(defaultLanguage);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await getSettings();
        setCurrentLanguage(normalizeLanguage(settings.displayLanguage));
        setFallbackLanguage(normalizeLanguage(settings.fallbackLanguage));
        if (settings.libraryDir) {
          setLibraryDir(settings.libraryDir);
          await refreshLibrary(settings.libraryDir);
        }
      } catch (error) {
        setStatus({ tone: "warn", text: String(error) });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", preventContextMenu);
    return () => document.removeEventListener("contextmenu", preventContextMenu);
  }, []);

  const selectedBaseTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ??
      templates[0],
    [selectedTemplateId, templates],
  );

  const selectedTemplate = useMemo(
    () =>
      selectedBaseTemplate
        ? localizeTemplate(selectedBaseTemplate, currentLanguage, fallbackLanguage)
        : undefined,
    [currentLanguage, fallbackLanguage, selectedBaseTemplate],
  );

  const localizedEntries = useMemo(
    () => {
      const templateById = new Map(
        templates.map((template) => [template.id, template]),
      );
      return entries.map((entry) =>
        localizeEntry(
          entry,
          currentLanguage,
          fallbackLanguage,
          templateById.get(entry.templateId),
        ),
      );
    },
    [currentLanguage, entries, fallbackLanguage, templates],
  );

  const selectedBaseEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId),
    [entries, selectedEntryId],
  );

  const selectedEntry = useMemo(
    () => localizedEntries.find((entry) => entry.id === selectedEntryId),
    [localizedEntries, selectedEntryId],
  );

  const templateEntries = useMemo(
    () =>
      selectedTemplate
        ? localizedEntries.filter((entry) => entry.templateId === selectedTemplate.id)
        : [],
    [localizedEntries, selectedTemplate],
  );

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!selectedTemplate) return [];
    const grouped = selectedGroup
      ? templateEntries.filter((entry) => entryMatchesGroup(entry, selectedGroup))
      : templateEntries;
    if (!keyword) return grouped;
    return grouped.filter((entry) => {
      const title = entryTitle(selectedTemplate, entry).toLowerCase();
      const values = JSON.stringify(entry.values).toLowerCase();
      const groupsText = entryGroupsText(
        selectedTemplate,
        entry,
        currentLanguage,
        fallbackLanguage,
      ).toLowerCase();
      return title.includes(keyword) || values.includes(keyword) || groupsText.includes(keyword);
    });
  }, [currentLanguage, fallbackLanguage, query, selectedGroup, selectedTemplate, templateEntries]);

  const groupRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of selectedTemplate?.groupOptions ?? []) {
      counts.set(group.id, 0);
    }
    let ungroupedCount = 0;
    for (const entry of templateEntries) {
      const groupIds = entryGroupIds(entry);
      if (!groupIds.length) {
        ungroupedCount += 1;
        continue;
      }
      for (const groupId of groupIds) {
        if (counts.has(groupId)) {
          counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
        }
      }
    }
    const rows = (selectedTemplate?.groupOptions ?? []).map((group) => ({
      id: group.id,
      label: groupOptionLabel(group, currentLanguage, fallbackLanguage),
      count: counts.get(group.id) ?? 0,
    }));
    if (ungroupedCount > 0) {
      rows.push({ id: ungroupedGroupId, label: "未分组", count: ungroupedCount });
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }, [currentLanguage, fallbackLanguage, selectedTemplate, templateEntries]);

  const selectedGroupLabel = useMemo(
    () => groupRows.find((group) => group.id === selectedGroup)?.label ?? "",
    [groupRows, selectedGroup],
  );

  const previewMarkdown = useMemo(() => {
    if (!selectedTemplate || !selectedEntry) return "";
    return renderMarkdownTemplate(
      selectedTemplate,
      selectedEntry,
      currentLanguage,
      fallbackLanguage,
    );
  }, [currentLanguage, fallbackLanguage, selectedEntry, selectedTemplate]);

  const selectedEntryDirty = Boolean(
    selectedBaseEntry && dirtyEntryIds.has(selectedBaseEntry.id),
  );
  const hasUnsavedChanges = templateDirty || dirtyEntryIds.size > 0;

  const selectedEntryLanguageEmpty = useMemo(
    () => entryLanguageEmptyMap(selectedBaseEntry),
    [selectedBaseEntry],
  );

  const selectedTemplateLanguageEmpty = useMemo(
    () =>
      templateLanguageEmptyMap(
        selectedBaseTemplate,
        templateEditorOpen ? draftTemplate : undefined,
        currentLanguage,
      ),
    [currentLanguage, draftTemplate, selectedBaseTemplate, templateEditorOpen],
  );

  useEffect(() => {
    if (selectedTemplate) setDraftTemplate(cloneTemplate(selectedTemplate));
    setSelectedGroup("");
  }, [selectedTemplate]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (selectedGroup && !groupRows.some((group) => group.id === selectedGroup)) {
      setSelectedGroup("");
    }
  }, [groupRows, selectedGroup]);

  useEffect(() => {
    if (!libraryDir || templates.length === 0) {
      setIconSources({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        templates.map(async (template) => {
          if (!template.iconImage) return [template.id, ""] as const;
          try {
            return [
              template.id,
              await loadTemplateIcon(libraryDir, template.iconImage),
            ] as const;
          } catch {
            return [template.id, ""] as const;
          }
        }),
      );
      if (!cancelled) setIconSources(Object.fromEntries(loaded));
    })();

    return () => {
      cancelled = true;
    };
  }, [libraryDir, templates]);

  async function refreshLibrary(dir: string) {
    setLoading(true);
    const state = await loadLibrary(dir);
    const legacyGroups = legacyGroupLabelsByTemplate(state.entries);
    let nextTemplates: KnowledgeTemplate[] =
      state.templates.map((template) =>
        normalizeTemplate(template, legacyGroups.get(template.id) ?? []),
      );
    if (!state.initialized && nextTemplates.length === 0) {
      const seeded = defaultTemplates.map((template) => ({
        ...cloneTemplate(template),
        icon: templateIconName(template),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })).map((template) => normalizeTemplate(template));
      for (const template of seeded) {
        await saveTemplate(dir, template);
      }
      nextTemplates = seeded;
    }
    const templateById = new Map(
      nextTemplates.map((template) => [template.id, template]),
    );
    const nextEntries = state.entries
      .map((entry) => normalizeEntry(entry, templateById.get(entry.templateId)))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    setTemplates(nextTemplates);
    setEntries(nextEntries);
    setSavedEntries(entriesById(nextEntries));
    setDirtyEntryIds(new Set());
    setTemplateDirty(false);
    const firstTemplate = nextTemplates[0];
    setSelectedTemplateId((current) =>
      nextTemplates.some((template) => template.id === current)
        ? current
        : firstTemplate?.id ?? "",
    );
    setSelectedEntryId((current) =>
      nextEntries.some((entry) => entry.id === current)
        ? current
        : nextEntries.find((entry) => entry.templateId === firstTemplate?.id)
            ?.id ?? "",
    );
    setEntryView("preview");
    setLoading(false);
  }

  function openSettings(tab: SettingsTab = "library") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  async function persistSettings(patch: Partial<{
    libraryDir: string;
    displayLanguage: LanguageCode;
    fallbackLanguage: LanguageCode;
  }>) {
    await saveSettings({
      libraryDir,
      displayLanguage: currentLanguage,
      fallbackLanguage,
      ...patch,
    });
  }

  function askUnsavedChoice(scope: UnsavedScope) {
    setUnsavedPrompt({ scope });
    return new Promise<UnsavedChoice>((resolve) => {
      unsavedPromptResolver.current = resolve;
    });
  }

  function resolveUnsavedPrompt(choice: UnsavedChoice) {
    unsavedPromptResolver.current?.(choice);
    unsavedPromptResolver.current = undefined;
    setUnsavedPrompt(undefined);
  }

  function markEntryDirty(entryId: string) {
    setDirtyEntryIds((current) => new Set(current).add(entryId));
  }

  function clearEntryDirty(entryId: string) {
    setDirtyEntryIds((current) => {
      const next = new Set(current);
      next.delete(entryId);
      return next;
    });
  }

  function discardEntryChanges(entryId: string) {
    const saved = savedEntries[entryId];
    if (!saved) return;
    setEntries((current) =>
      current
        .map((entry) => (entry.id === entryId ? cloneEntry(saved) : entry))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    );
    clearEntryDirty(entryId);
  }

  function discardTemplateChanges() {
    const existing = draftTemplate
      ? templates.find((template) => template.id === draftTemplate.id)
      : undefined;
    setDraftTemplate(
      existing
        ? cloneTemplate(localizeTemplate(existing, currentLanguage, fallbackLanguage))
        : undefined,
    );
    setTemplateDirty(false);
  }

  async function guardUnsaved(scope: UnsavedScope, action: () => void | Promise<void>) {
    const dirty =
      scope === "template" ? templateDirty : Boolean(selectedBaseEntry && selectedEntryDirty);
    if (!dirty) {
      await action();
      return;
    }

    const choice = await askUnsavedChoice(scope);
    if (choice === "cancel") return;

    if (choice === "save") {
      const saved =
        scope === "template"
          ? await saveCurrentTemplate()
          : await saveCurrentEntry();
      if (!saved) return;
    } else if (scope === "template") {
      discardTemplateChanges();
    } else if (selectedBaseEntry) {
      discardEntryChanges(selectedBaseEntry.id);
    }

    await action();
  }

  async function guardActiveUnsaved(action: () => void | Promise<void>) {
    if (templateEditorOpen && templateDirty) {
      await guardUnsaved("template", action);
      return;
    }
    if (selectedEntryDirty) {
      await guardUnsaved("entry", action);
      return;
    }
    await action();
  }

  async function changeLanguage(language: LanguageCode) {
    if (language === currentLanguage) return;
    setCurrentLanguage(language);
    await persistSettings({ displayLanguage: language });
  }

  async function handleChangeLanguage(language: LanguageCode) {
    if (language === currentLanguage) return;
    await guardActiveUnsaved(() => changeLanguage(language));
  }

  async function handleChangeFallbackLanguage(language: LanguageCode) {
    if (language === fallbackLanguage) return;
    await guardActiveUnsaved(async () => {
      setFallbackLanguage(language);
      await persistSettings({ fallbackLanguage: language });
    });
  }

  function iconSrcForTemplate(template?: KnowledgeTemplate) {
    if (!template?.iconImage) return "";
    if (/^(data:|blob:|https?:)/.test(template.iconImage)) {
      return template.iconImage;
    }
    return iconSources[template.id] ?? "";
  }

  function selectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    setSelectedEntryId(
      entries.find((entry) => entry.templateId === templateId)?.id ?? "",
    );
    setEntryView("preview");
  }

  function openTemplateEditor(template: KnowledgeTemplate) {
    setSelectedTemplateId(template.id);
    setDraftTemplate(
      cloneTemplate(localizeTemplate(template, currentLanguage, fallbackLanguage)),
    );
    setTemplateDirty(false);
    setTemplateEditorOpen(true);
  }

  async function handleChooseLibrary() {
    const selected = await chooseLibraryDirectory();
    if (!selected) return;
    await persistSettings({ libraryDir: selected });
    setLibraryDir(selected);
    await refreshLibrary(selected);
    setStatus({ tone: "ok", text: "资料库目录已设置。" });
  }

  async function handleNewEntry() {
    if (!selectedTemplate || !libraryDir) return;
    const createdAt = nowIso();
    const values = valuesFromTemplate(selectedTemplate);
    const entry: KnowledgeEntry = {
      id: makeId("entry"),
      templateId: selectedTemplate.id,
      title: "未命名知识",
      groupIds:
        selectedGroup && selectedGroup !== ungroupedGroupId
          ? [selectedGroup]
          : [],
      values,
      translations: {
        [currentLanguage]: {
          title: "未命名知识",
          values,
        },
      },
      createdAt,
      updatedAt: createdAt,
    };
    await saveEntry(libraryDir, entry);
    setEntries((current) => [entry, ...current]);
    setSavedEntries((current) => ({ ...current, [entry.id]: cloneEntry(entry) }));
    clearEntryDirty(entry.id);
    setSelectedEntryId(entry.id);
    setEntryView("edit");
    setStatus({ tone: "ok", text: "已创建新知识。" });
  }

  async function saveCurrentEntry() {
    if (!libraryDir || !selectedTemplate || !selectedEntry || !selectedBaseEntry) {
      return false;
    }
    const missing = selectedTemplate.fields.filter((field) =>
      requiredMissing(field, selectedEntry.values[field.id]),
    );
    if (missing.length) {
      setStatus({
        tone: "warn",
        text: `请先填写必填字段：${missing.map((field) => field.label).join("、")}`,
      });
      return false;
    }
    const next = {
      ...updateEntryLanguageTitle(
        selectedBaseEntry,
        currentLanguage,
        fallbackLanguage,
        entryTitle(selectedTemplate, selectedEntry),
      ),
      updatedAt: nowIso(),
    };
    await saveEntry(libraryDir, next);
    setEntries((current) =>
      current
        .map((entry) => (entry.id === next.id ? next : entry))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    );
    setSavedEntries((current) => ({ ...current, [next.id]: cloneEntry(next) }));
    clearEntryDirty(next.id);
    setStatus({ tone: "ok", text: "知识已保存。" });
    return true;
  }

  async function handleSaveEntry() {
    await saveCurrentEntry();
  }

  async function handleDeleteEntry() {
    if (!libraryDir || !selectedEntry) return;
    if (!window.confirm("删除这条知识？")) return;
    await deleteEntry(libraryDir, selectedEntry.templateId, selectedEntry.id);
    setEntries((current) =>
      current.filter((entry) => entry.id !== selectedEntry.id),
    );
    setSavedEntries((current) => {
      const next = { ...current };
      delete next[selectedEntry.id];
      return next;
    });
    clearEntryDirty(selectedEntry.id);
    setSelectedEntryId("");
    setStatus({ tone: "ok", text: "知识已删除。" });
  }

  async function handleExportEntry() {
    if (!libraryDir || !selectedTemplate || !selectedEntry) return;
    const fileName = safeFileName(entryTitle(selectedTemplate, selectedEntry));
    const exportedPath = await exportEntryMarkdown(
      libraryDir,
      selectedEntry.templateId,
      selectedEntry.id,
      fileName,
      previewMarkdown,
    );
    setStatus({ tone: "ok", text: `已导出：${exportedPath}` });
  }

  function updateEntryValue(fieldId: string, value: unknown) {
    if (!selectedBaseEntry) return;
    markEntryDirty(selectedBaseEntry.id);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === selectedBaseEntry.id
          ? updateEntryLanguageValue(
              entry,
              currentLanguage,
              fallbackLanguage,
              fieldId,
              value,
            )
          : entry,
      ),
    );
  }

  function updateEntryGroups(groupIds: string[]) {
    if (!selectedBaseEntry || !selectedTemplate) return;
    const knownGroupIds = new Set(
      (selectedTemplate.groupOptions ?? []).map((group) => group.id),
    );
    const nextGroupIds = [...new Set(groupIds)].filter((groupId) =>
      knownGroupIds.has(groupId),
    );
    markEntryDirty(selectedBaseEntry.id);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === selectedBaseEntry.id
          ? { ...entry, groupIds: nextGroupIds }
          : entry,
      ),
    );
  }

  function createTemplateDraft() {
    const createdAt = nowIso();
    const template: KnowledgeTemplate = {
      id: makeId("template"),
      name: "新知识类型",
      description: "描述这种知识的用途。",
      icon: "BookOpen",
      color: "#4f6f52",
      fields: [
        {
          id: "name",
          label: "名称",
          type: "text",
          required: true,
          placeholder: "输入名称",
        },
      ],
      markdownTemplate: "",
      createdAt,
      updatedAt: createdAt,
    };
    setDraftTemplate({
      ...template,
      markdownTemplate: generatedMarkdownTemplate(template),
    });
    setTemplateDirty(true);
    setTemplateEditorOpen(true);
  }

  async function handleCopyTemplate() {
    const source = draftTemplate ?? selectedTemplate;
    if (!source || !libraryDir) return;
    const copied = {
      ...cloneTemplate(source),
      id: makeId("template"),
      name: `${source.name} 副本`,
      icon: templateIconName(source),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    copied.markdownTemplate = generatedMarkdownTemplate(copied);
    await saveTemplate(libraryDir, copied);
    setTemplates((current) => [...current, copied]);
    setSelectedTemplateId(copied.id);
    setDraftTemplate(
      cloneTemplate(localizeTemplate(copied, currentLanguage, fallbackLanguage)),
    );
    setTemplateDirty(false);
    setTemplateEditorOpen(true);
    setStatus({ tone: "ok", text: "知识类型已复制。" });
  }

  async function saveCurrentTemplate() {
    if (!draftTemplate || !libraryDir) return false;
    const fieldIds = draftTemplate.fields.map((field) => field.id.trim());
    const duplicate = fieldIds.find(
      (id, index) => fieldIds.indexOf(id) !== index,
    );
    if (!draftTemplate.name.trim()) {
      setStatus({ tone: "warn", text: "类型名称不能为空。" });
      return false;
    }
    if (fieldIds.some((id) => !id)) {
      setStatus({ tone: "warn", text: "字段 ID 不能为空。" });
      return false;
    }
    if (duplicate) {
      setStatus({ tone: "warn", text: `字段 ID 重复：${duplicate}` });
      return false;
    }
    const baseTemplate =
      templates.find((template) => template.id === draftTemplate.id) ??
      draftTemplate;
    const next = mergeTemplateLanguage(baseTemplate, {
      ...draftTemplate,
      icon: templateIconName(draftTemplate),
      markdownTemplate: generatedMarkdownTemplate(draftTemplate),
      updatedAt: nowIso(),
    }, currentLanguage);
    await saveTemplate(libraryDir, next);
    setTemplates((current) => {
      const exists = current.some((template) => template.id === next.id);
      return exists
        ? current.map((template) => (template.id === next.id ? next : template))
        : [...current, next];
    });
    setSelectedTemplateId(next.id);
    setDraftTemplate(
      cloneTemplate(localizeTemplate(next, currentLanguage, fallbackLanguage)),
    );
    setTemplateDirty(false);
    setStatus({ tone: "ok", text: "知识类型已保存。" });
    return true;
  }

  async function handleSaveTemplate() {
    await saveCurrentTemplate();
  }

  async function handleUploadTemplateIcon() {
    if (!draftTemplate || !libraryDir) return;
    const iconImage = await importTemplateIcon(libraryDir, draftTemplate.id);
    if (!iconImage) return;
    setDraftTemplate((current) =>
      current ? { ...current, iconImage, updatedAt: nowIso() } : current,
    );
    setTemplateDirty(true);
    try {
      const src = await loadTemplateIcon(libraryDir, iconImage);
      setIconSources((current) => ({ ...current, [draftTemplate.id]: src }));
    } catch {
      setIconSources((current) => ({ ...current, [draftTemplate.id]: "" }));
    }
    setStatus({ tone: "ok", text: "图标图片已导入。" });
  }

  function handleClearTemplateIcon() {
    if (!draftTemplate) return;
    setDraftTemplate((current) =>
      current ? { ...current, iconImage: "", updatedAt: nowIso() } : current,
    );
    setTemplateDirty(true);
    setIconSources((current) => ({ ...current, [draftTemplate.id]: "" }));
  }

  async function handleDeleteTemplate() {
    if (!libraryDir || !draftTemplate) return;
    const existing = templates.find((template) => template.id === draftTemplate.id);
    if (!existing) {
      setDraftTemplate(selectedTemplate ? cloneTemplate(selectedTemplate) : undefined);
      setTemplateEditorOpen(false);
      setTemplateDirty(false);
      setStatus({ tone: "ok", text: "未保存的知识类型已取消。" });
      return;
    }
    const relatedCount = entries.filter(
      (entry) => entry.templateId === existing.id,
    ).length;
    const message = relatedCount
      ? `删除这个知识类型？同时会删除 ${relatedCount} 条知识内容。`
      : "删除这个知识类型？";
    if (!window.confirm(message)) return;
    await deleteTemplate(libraryDir, existing.id);
    const nextTemplates = templates.filter(
      (template) => template.id !== existing.id,
    );
    const nextEntries = entries.filter(
      (entry) => entry.templateId !== existing.id,
    );
    setTemplates(nextTemplates);
    setEntries(nextEntries);
    setSavedEntries(entriesById(nextEntries));
    setDirtyEntryIds(new Set());
    const nextSelectedTemplateId = nextTemplates[0]?.id ?? "";
    setSelectedTemplateId(nextSelectedTemplateId);
    setSelectedEntryId(
      nextEntries.find((entry) => entry.templateId === nextSelectedTemplateId)
        ?.id ?? "",
    );
    setDraftTemplate(nextTemplates[0] ? cloneTemplate(nextTemplates[0]) : undefined);
    setIconSources((current) => {
      const next = { ...current };
      delete next[existing.id];
      return next;
    });
    setTemplateEditorOpen(false);
    setTemplateDirty(false);
    setStatus({ tone: "ok", text: "知识类型已删除。" });
  }

  function updateDraft(patch: Partial<KnowledgeTemplate>) {
    setTemplateDirty(true);
    setDraftTemplate((current) => (current ? { ...current, ...patch } : current));
  }

  function updateDraftField(index: number, patch: Partial<FieldDefinition>) {
    setTemplateDirty(true);
    setDraftTemplate((current) => {
      if (!current) return current;
      const fields = current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      );
      return { ...current, fields };
    });
  }

  function addDraftField() {
    setTemplateDirty(true);
    setDraftTemplate((current) => {
      if (!current) return current;
      const index = current.fields.length + 1;
      return {
        ...current,
        fields: [
          ...current.fields,
          {
            id: `field${index}`,
            label: `字段 ${index}`,
            type: "text",
            required: false,
            placeholder: "",
          },
        ],
      };
    });
  }

  function reorderDraftField(fromIndex: number, toIndex: number) {
    setTemplateDirty(true);
    setDraftTemplate((current) => {
      if (!current) return current;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.fields.length ||
        toIndex >= current.fields.length
      ) {
        return current;
      }
      const fields = [...current.fields];
      const [field] = fields.splice(fromIndex, 1);
      fields.splice(toIndex, 0, field);
      return { ...current, fields };
    });
  }

  function removeDraftField(index: number) {
    setTemplateDirty(true);
    setDraftTemplate((current) => {
      if (!current) return current;
      return {
        ...current,
        fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
      };
    });
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <Database size={30} />
        <span>正在加载 AP Wiki...</span>
      </main>
    );
  }

  const hasLibrary = Boolean(libraryDir);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <button
            className="chrome-button"
            title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            <Menu size={18} />
          </button>
        </div>

        <div />

        <div className="topbar-right">
          <button
            className="topbar-settings"
            onClick={() => void guardActiveUnsaved(() => openSettings("library"))}
            title="设置"
          >
            <Settings size={18} />
            设置
          </button>
        </div>
      </header>

      <div className={`app-body ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-main">
        <section className="sidebar-section type-section">
          <div className="section-title">
            <span>知识类型</span>
            <button
              className="text-action"
              disabled={!hasLibrary}
              title="新增知识类型"
              onClick={() => void guardActiveUnsaved(createTemplateDraft)}
            >
              <Plus size={16} />
              新增类型
            </button>
          </div>
          {templates.map((template) => {
            const visibleTemplate = localizeTemplate(
              template,
              currentLanguage,
              fallbackLanguage,
            );
            return (
              <div className="type-row" key={template.id}>
                <button
                  className={`type-button ${
                    selectedTemplate?.id === template.id ? "active" : ""
                  }`}
                  onClick={() => void guardActiveUnsaved(() => selectTemplate(template.id))}
                >
                  <span className="type-icon" style={{ color: template.color }}>
                    <TemplateIcon src={iconSrcForTemplate(template)} template={template} />
                  </span>
                  <span className="type-text">
                    <span className="type-name">{visibleTemplate.name}</span>
                    {visibleTemplate.description && (
                      <small>{visibleTemplate.description}</small>
                    )}
                  </span>
                  <em>{entries.filter((entry) => entry.templateId === template.id).length}</em>
                </button>
                <button
                  className="type-edit-button"
                  disabled={!hasLibrary}
                  onClick={() =>
                    void guardActiveUnsaved(() => openTemplateEditor(template))
                  }
                  title="编辑知识类型"
                >
                  <Wrench size={15} />
                </button>
              </div>
            );
          })}
        </section>

        <section className="sidebar-section groups">
          <div className="section-title">
            <span>分组</span>
          </div>
          {groupRows.length ? (
            <>
            <button
              className={`group-row ${selectedGroup === "" ? "active" : ""}`}
              onClick={() => void guardActiveUnsaved(() => setSelectedGroup(""))}
            >
              <span>全部</span>
              <em>{templateEntries.length}</em>
            </button>
            {groupRows.map((group) => (
              <button
                className={`group-row ${
                  selectedGroup === group.id ? "active" : ""
                }`}
                key={group.id}
                onClick={() => void guardActiveUnsaved(() => setSelectedGroup(group.id))}
              >
                <span>{group.label}</span>
                <em>{group.count}</em>
              </button>
            ))}
            </>
          ) : (
            <p className="muted">还没有分组。</p>
          )}
        </section>
        </div>

      </aside>

      <section className="list-pane">
        <div className="library-path">
          <FolderOpen size={16} />
          <span>{libraryDir || "尚未选择资料库目录"}</span>
        </div>

        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、字段、标签..."
          />
        </label>

        <div className="list-meta">
          <div>
            <span>共 {filteredEntries.length} 个条目</span>
            {selectedGroupLabel && <small>当前分组：{selectedGroupLabel}</small>}
          </div>
          <button
            className="list-new-button"
            disabled={!hasLibrary || !selectedTemplate}
            onClick={() => void guardActiveUnsaved(handleNewEntry)}
          >
            <Plus size={16} />
            新建知识
          </button>
        </div>

        <div className="entry-list">
          {!hasLibrary && (
            <button
              className="empty-action"
              onClick={() => void guardActiveUnsaved(() => openSettings("library"))}
            >
              <FolderOpen size={22} />
              选择资料库目录后开始使用
            </button>
          )}
          {hasLibrary && filteredEntries.length === 0 && (
            <div className="empty-note">当前没有知识。</div>
          )}
          {filteredEntries.map((entry) => (
            <button
              className={`entry-card ${
                selectedEntry?.id === entry.id ? "active" : ""
              }`}
              key={entry.id}
              onClick={() => void guardActiveUnsaved(() => {
                setSelectedEntryId(entry.id);
                setEntryView("preview");
              })}
            >
              <div
                className="entry-icon"
                style={{ background: selectedTemplate?.color }}
              >
                {selectedTemplate ? (
                <EntryListIcon
                  entry={entry}
                  libraryDir={libraryDir}
                  template={selectedTemplate}
                  templateIconSrc={iconSrcForTemplate(selectedTemplate)}
                />
                ) : (
                <TemplateIcon
                  src=""
                  template={selectedTemplate}
                />
                )}
              </div>
              <div>
                <strong>
                  {selectedTemplate ? entryTitle(selectedTemplate, entry) : entry.title}
                </strong>
                <span>
                  {selectedTemplate
                    ? entryListDescription(selectedTemplate, entry) ||
                      entryGroupsText(
                        selectedTemplate,
                        entry,
                        currentLanguage,
                        fallbackLanguage,
                      )
                    : "未分组"}
                </span>
                <small>更新于 {formatDate(entry.updatedAt)}</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="workspace-tabs">
          {selectedTemplate && selectedEntry && (
            <>
              <button
                className={entryView === "edit" ? "active" : ""}
                onClick={() => void guardActiveUnsaved(() => setEntryView("edit"))}
              >
                编辑
              </button>
              <button
                className={entryView === "preview" ? "active" : ""}
                onClick={() => void guardActiveUnsaved(() => setEntryView("preview"))}
              >
                预览
              </button>
            </>
          )}
          {status && (
            <div className={`status ${status.tone}`}>
              {status.tone === "ok" ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>{status.text}</span>
              <button onClick={() => setStatus(undefined)}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        <EntryEditor
          emptyLanguages={selectedEntryLanguageEmpty}
          entry={selectedEntry}
          fallbackLanguage={fallbackLanguage}
          language={currentLanguage}
          libraryDir={libraryDir}
          markdown={previewMarkdown}
          onDelete={handleDeleteEntry}
          onEdit={() => setEntryView("edit")}
          onExport={handleExportEntry}
          onSave={handleSaveEntry}
          onSelectLanguage={(language) => void handleChangeLanguage(language)}
          onStatus={setStatus}
          onUpdateGroups={updateEntryGroups}
          onUpdateValue={updateEntryValue}
          template={selectedTemplate}
          view={entryView}
        />
      </section>
      </div>
      <TemplateEditorDialog
        draftTemplate={draftTemplate}
        emptyLanguages={selectedTemplateLanguageEmpty}
        iconSrc={iconSrcForTemplate(draftTemplate)}
        language={currentLanguage}
        open={templateEditorOpen}
        onAddField={addDraftField}
        onClearIcon={handleClearTemplateIcon}
        onClose={() =>
          void guardUnsaved("template", () => setTemplateEditorOpen(false))
        }
        onCopyTemplate={handleCopyTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onReorderField={reorderDraftField}
        onRemoveField={removeDraftField}
        onSaveTemplate={handleSaveTemplate}
        onSelectLanguage={(language) => void handleChangeLanguage(language)}
        onUploadIcon={handleUploadTemplateIcon}
        onUpdateDraft={updateDraft}
        onUpdateField={updateDraftField}
      />
      <SettingsDialog
        activeTab={settingsTab}
        fallbackLanguage={fallbackLanguage}
        libraryDir={libraryDir}
        open={settingsOpen}
        sidebarCollapsed={sidebarCollapsed}
        onChangeFallbackLanguage={(language) =>
          void handleChangeFallbackLanguage(language)
        }
        onChooseLibrary={handleChooseLibrary}
        onClose={() => setSettingsOpen(false)}
        onSelectTab={setSettingsTab}
        onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
      />
      <UnsavedChangesDialog
        open={Boolean(unsavedPrompt)}
        scope={unsavedPrompt?.scope}
        onChoose={resolveUnsavedPrompt}
      />
    </main>
  );
}

function UnsavedChangesDialog({
  onChoose,
  open,
  scope,
}: {
  onChoose: (choice: UnsavedChoice) => void;
  open: boolean;
  scope?: UnsavedScope;
}) {
  if (!open) return null;
  return (
    <div className="unsaved-overlay">
      <section aria-label="没有保存" className="unsaved-dialog" role="dialog">
        <div>
          <span>{scope === "template" ? "知识类型" : "知识"}</span>
          <strong>没有保存</strong>
          <p>当前修改还没有保存。请选择下一步操作。</p>
        </div>
        <div className="unsaved-actions">
          <button onClick={() => onChoose("cancel")}>取消</button>
          <button className="setting-primary" onClick={() => onChoose("save")}>
            保存继续
          </button>
          <button className="danger-ghost" onClick={() => onChoose("discard")}>
            不保存继续
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplateEditorDialog({
  draftTemplate,
  emptyLanguages,
  iconSrc,
  language,
  onAddField,
  onClearIcon,
  onClose,
  onCopyTemplate,
  onDeleteTemplate,
  onReorderField,
  onRemoveField,
  onSaveTemplate,
  onSelectLanguage,
  onUploadIcon,
  onUpdateDraft,
  onUpdateField,
  open,
}: {
  draftTemplate?: KnowledgeTemplate;
  emptyLanguages: LanguageEmptyMap;
  iconSrc: string;
  language: LanguageCode;
  onAddField: () => void;
  onClearIcon: () => void;
  onClose: () => void;
  onCopyTemplate: () => void;
  onDeleteTemplate: () => void;
  onReorderField: (fromIndex: number, toIndex: number) => void;
  onRemoveField: (index: number) => void;
  onSaveTemplate: () => void;
  onSelectLanguage: (language: LanguageCode) => void;
  onUploadIcon: () => void;
  onUpdateDraft: (patch: Partial<KnowledgeTemplate>) => void;
  onUpdateField: (index: number, patch: Partial<FieldDefinition>) => void;
  open: boolean;
}) {
  if (!open) return null;

  return (
    <div className="template-dialog-overlay">
      <section
        aria-label="编辑知识类型"
        className="template-dialog"
        role="dialog"
      >
        <div className="template-dialog-header">
          <div>
            <span>知识类型</span>
            <strong>{draftTemplate?.name ?? "编辑知识类型"}</strong>
          </div>
          <div className="dialog-heading-actions">
            <LanguageSelect
              emptyLanguages={emptyLanguages}
              value={language}
              onChange={onSelectLanguage}
            />
            <button className="icon-button neutral" onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>
        </div>
        <TemplateDesigner
          draftTemplate={draftTemplate}
          iconSrc={iconSrc}
          onAddField={onAddField}
          onClearIcon={onClearIcon}
          onCopyTemplate={onCopyTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onReorderField={onReorderField}
          onRemoveField={onRemoveField}
          onSaveTemplate={onSaveTemplate}
          onUploadIcon={onUploadIcon}
          onUpdateDraft={onUpdateDraft}
          onUpdateField={onUpdateField}
        />
      </section>
    </div>
  );
}

function SettingsDialog({
  activeTab,
  fallbackLanguage,
  libraryDir,
  onChangeFallbackLanguage,
  onChooseLibrary,
  onClose,
  onSelectTab,
  onToggleSidebar,
  open,
  sidebarCollapsed,
}: {
  activeTab: SettingsTab;
  fallbackLanguage: LanguageCode;
  libraryDir: string;
  onChangeFallbackLanguage: (language: LanguageCode) => void;
  onChooseLibrary: () => Promise<void>;
  onClose: () => void;
  onSelectTab: (tab: SettingsTab) => void;
  onToggleSidebar: () => void;
  open: boolean;
  sidebarCollapsed: boolean;
}) {
  if (!open) return null;

  return (
    <div className="settings-overlay" role="presentation">
      <section
        aria-label="设置"
        aria-modal="true"
        className="settings-dialog"
        role="dialog"
      >
        <div className="settings-header">
          <div>
            <span>设置</span>
            <strong>工作区选项</strong>
          </div>
          <button className="icon-button neutral" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="settings-content">
          <nav className="settings-tabs" aria-label="设置标签页">
            <button
              className={activeTab === "library" ? "active" : ""}
              onClick={() => onSelectTab("library")}
            >
              <FolderOpen size={17} />
              资料库
            </button>
            <button
              className={activeTab === "language" ? "active" : ""}
              onClick={() => onSelectTab("language")}
            >
              <BookOpen size={17} />
              语言
            </button>
            <button
              className={activeTab === "layout" ? "active" : ""}
              onClick={() => onSelectTab("layout")}
            >
              <Layers size={17} />
              界面
            </button>
            <button
              className={activeTab === "about" ? "active" : ""}
              onClick={() => onSelectTab("about")}
            >
              <BookOpen size={17} />
              关于
            </button>
          </nav>

          <div className="settings-panel">
            {activeTab === "library" && (
              <div className="settings-page">
                <div className="setting-row">
                  <div>
                    <span>资料库目录</span>
                    <strong>{libraryDir || "尚未选择"}</strong>
                  </div>
                  <button
                    className="setting-primary"
                    onClick={() => void onChooseLibrary()}
                  >
                    <FolderOpen size={17} />
                    选择目录
                  </button>
                </div>
                <div className="setting-note">
                  知识类型、知识内容、图标图片和导出的 Markdown 会保存在这个目录。
                </div>
              </div>
            )}

            {activeTab === "language" && (
              <div className="settings-page">
                <div className="setting-row">
                  <div>
                    <span>默认回退语言</span>
                    <strong>{languageName(fallbackLanguage)}</strong>
                  </div>
                  <LanguageSelect
                    value={fallbackLanguage}
                    onChange={onChangeFallbackLanguage}
                  />
                </div>
                <div className="setting-note">
                  当前语言没有对应内容时，会自动显示这个语言的数据。
                </div>
              </div>
            )}

            {activeTab === "layout" && (
              <div className="settings-page">
                <div className="setting-row">
                  <div>
                    <span>左侧栏</span>
                    <strong>{sidebarCollapsed ? "已收起" : "已展开"}</strong>
                  </div>
                  <button onClick={onToggleSidebar}>
                    <Menu size={17} />
                    {sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "about" && (
              <div className="settings-page about-page">
                <strong>AP Wiki</strong>
                <span>本地知识库原型，当前版本用于手动维护知识类型和知识条目。</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function LanguageSelect({
  emptyLanguages,
  onChange,
  value,
}: {
  emptyLanguages?: LanguageEmptyMap;
  onChange: (language: LanguageCode) => void | Promise<void>;
  value: LanguageCode;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedLanguage =
    supportedLanguages.find((language) => language.code === value) ??
    supportedLanguages[0];

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="language-picker" ref={pickerRef}>
      <button
        aria-label="当前语言"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="language-select-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={`language-flag flag-${selectedLanguage.code}`}
        />
        <span className="language-current">{selectedLanguage.label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="language-menu" role="listbox">
          {supportedLanguages.map((language) => {
            const maybeEmpty = Boolean(emptyLanguages?.[language.code]);
            return (
              <button
                aria-selected={language.code === value}
                className={`language-option ${
                  language.code === value ? "active" : ""
                }`}
                key={language.code}
                onClick={() => {
                  void onChange(normalizeLanguage(language.code));
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`language-flag flag-${language.code}`}
                />
                <span>{language.label}</span>
                {maybeEmpty && <em>可能为空</em>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EntryEditor({
  emptyLanguages,
  entry,
  fallbackLanguage,
  language,
  libraryDir,
  markdown,
  onDelete,
  onEdit,
  onExport,
  onSave,
  onSelectLanguage,
  onStatus,
  onUpdateGroups,
  onUpdateValue,
  template,
  view,
}: {
  emptyLanguages: LanguageEmptyMap;
  entry?: KnowledgeEntry;
  fallbackLanguage: LanguageCode;
  language: LanguageCode;
  libraryDir: string;
  markdown: string;
  onDelete: () => void;
  onEdit: () => void;
  onExport: () => void;
  onSave: () => void;
  onSelectLanguage: (language: LanguageCode) => void;
  onStatus: (status: Status) => void;
  onUpdateGroups: (groupIds: string[]) => void;
  onUpdateValue: (fieldId: string, value: unknown) => void;
  template?: KnowledgeTemplate;
  view: EntryView;
}) {
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const markdownSegments = useMemo(
    () => parseRichImageMarkdown(markdown),
    [markdown],
  );

  useEffect(() => {
    if (!previewFullscreen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewFullscreen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewFullscreen]);

  if (!template || !entry) {
    return (
      <div className="workspace-empty">
        <BookOpen size={34} />
        <h2>选择或新建一条知识</h2>
        <p>左侧选择知识类型，中间选择条目，右侧会显示结构化编辑和预览。</p>
      </div>
    );
  }

  const editableFields = template.fields.filter((field) => !isGroupField(field));
  const maybeEmpty = previewMayBeEmpty(template, entry);

  return (
    <div className="entry-view">
      {view === "edit" ? (
      <div className="form-panel entry-panel">
        <div className="panel-heading">
          <div>
            <span>结构化内容</span>
            <strong>{template.name}</strong>
          </div>
          <div className="button-row">
            <LanguageSelect
              emptyLanguages={emptyLanguages}
              value={language}
              onChange={onSelectLanguage}
            />
            <button onClick={onSave}>
              <Save size={16} />
              保存
            </button>
            <button className="danger-ghost" onClick={onDelete}>
              <Trash2 size={16} />
              删除
            </button>
          </div>
        </div>
        <div className="field-stack">
          <EntryGroupsInput
            entry={entry}
            fallbackLanguage={fallbackLanguage}
            language={language}
            onChange={onUpdateGroups}
            template={template}
          />
          {editableFields.map((field) => (
            <FieldInput
              entryId={entry.id}
              fallbackLanguage={fallbackLanguage}
              field={field}
              key={field.id}
              language={language}
              libraryDir={libraryDir}
              optionSets={template.optionSets}
              templateId={entry.templateId}
              value={entry.values[field.id]}
              onStatus={onStatus}
              onChange={(value) => onUpdateValue(field.id, value)}
            />
          ))}
        </div>
      </div>
      ) : (
      <div className={`preview-panel entry-panel ${previewFullscreen ? "fullscreen-preview" : ""}`}>
        <div className="panel-heading">
          <div>
            <span>Markdown 预览</span>
            <strong>{entryTitle(template, entry)}</strong>
          </div>
          <div className="button-row">
            <LanguageSelect
              emptyLanguages={emptyLanguages}
              value={language}
              onChange={onSelectLanguage}
            />
            <button onClick={onExport}>
              <Download size={16} />
              导出 MD
            </button>
            <button
              className={previewFullscreen ? "fullscreen-exit-button" : undefined}
              onClick={() => setPreviewFullscreen((current) => !current)}
            >
              {previewFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {previewFullscreen ? "退出全屏" : "全屏显示"}
            </button>
          </div>
        </div>
        {maybeEmpty && (
          <button className="preview-empty-banner" onClick={onEdit}>
            预览可能为空，点击去编辑。
          </button>
        )}
        <article className="markdown-preview">
          {markdownSegments.map((segment, index) =>
            segment.type === "richImage" ? (
              <MarkdownRichImage
                alt={segment.alt}
                entry={entry}
                key={`rich-image-${index}`}
                libraryDir={libraryDir}
                value={segment.value}
              />
            ) : segment.type === "tileSize" ? (
              <MarkdownTileSize
                key={`tile-size-${index}`}
                value={segment.value}
              />
            ) : (
              <ReactMarkdown
                components={{
                  img: ({ alt, src }) => (
                    <MarkdownPreviewImage
                      alt={alt ?? ""}
                      entry={entry}
                      libraryDir={libraryDir}
                      src={src}
                    />
                  ),
                }}
                key={`markdown-${index}`}
                remarkPlugins={[remarkGfm]}
              >
                {segment.content}
              </ReactMarkdown>
            ),
          )}
        </article>
      </div>
      )}
    </div>
  );
}

function MarkdownTileSize({ value }: { value: TileSizeValue }) {
  const tileSize = normalizeTileSizeValue(value);
  return (
    <figure className="markdown-tile-size">
      <TileSizePreview value={tileSize} />
      <figcaption>
        上 {tileSize.up} / 右 {tileSize.right} / 下 {tileSize.down} / 左{" "}
        {tileSize.left}
      </figcaption>
    </figure>
  );
}

function MarkdownPreviewImage({
  alt,
  entry,
  libraryDir,
  src,
}: {
  alt: string;
  entry: KnowledgeEntry;
  libraryDir: string;
  src?: string;
}) {
  const value = useMemo(() => normalizeRichImageValue(src ?? ""), [src]);

  return (
    <MarkdownRichImage
      alt={alt}
      entry={entry}
      libraryDir={libraryDir}
      showCaption={false}
      value={value}
    />
  );
}

function MarkdownRichImage({
  alt,
  entry,
  libraryDir,
  showCaption = true,
  value,
}: {
  alt: string;
  entry: KnowledgeEntry;
  libraryDir: string;
  showCaption?: boolean;
  value: RichImageValue;
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const frames = value.frames;
  const framesKey = frames.join("|");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!frames.length) {
        setSources([]);
        return;
      }
      const loaded = await Promise.all(
        frames.map(async (frame) => {
          const assetPath = resolveMarkdownAssetPath(frame, entry);
          try {
            return await loadLibraryAsset(libraryDir, assetPath);
          } catch {
            return frame;
          }
        }),
      );
      if (!cancelled) setSources(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, frames, libraryDir]);

  useEffect(() => {
    setFrameIndex(0);
    setStopped(false);
  }, [framesKey, value.fps, value.loop, value.mode]);

  useEffect(() => {
    if (
      stopped ||
      value.mode !== "sequence" ||
      sources.length < 2
    ) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= sources.length - 1) {
          if (!value.loop) {
            setStopped(true);
            return current;
          }
          return 0;
        }
        return current + 1;
      });
    }, richImageFrameDelay(value));
    return () => window.clearInterval(timer);
  }, [sources.length, stopped, value]);

  const imageSrc = sources[frameIndex] ?? "";
  if (!imageSrc) return null;

  return (
    <figure className="markdown-rich-image">
      <div className="markdown-rich-image-stage">
        <img alt={alt} src={imageSrc} />
      </div>
      {showCaption && value.mode === "sequence" && sources.length > 1 && (
        <figcaption>
          {frameIndex + 1} / {sources.length} · {value.fps} FPS ·{" "}
          {value.loop ? "重播" : "不重播"}
        </figcaption>
      )}
    </figure>
  );
}

function resolveMarkdownAssetPath(src: string, entry: KnowledgeEntry) {
  if (/^(data:|blob:|https?:)/.test(src)) return src;
  const normalized = src.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  const withoutParentPrefix = normalized.replace(/^(\.\.\/)+/, "");
  if (withoutParentPrefix.startsWith("entries/")) return withoutParentPrefix;
  if (withoutParentPrefix.startsWith("assets/")) {
    return `entries/${entry.templateId}/${entry.id}/${withoutParentPrefix}`;
  }
  if (normalized.startsWith("assets/")) {
    return `entries/${entry.templateId}/${entry.id}/${normalized}`;
  }
  return withoutParentPrefix;
}

function EntryGroupsInput({
  entry,
  fallbackLanguage,
  language,
  onChange,
  template,
}: {
  entry: KnowledgeEntry;
  fallbackLanguage: LanguageCode;
  language: LanguageCode;
  onChange: (groupIds: string[]) => void;
  template: KnowledgeTemplate;
}) {
  return (
    <section className="entry-group-box">
      <div className="entry-group-heading">
        <strong>知识分组</strong>
        <span>从分组配置中选择，可多选。</span>
      </div>
      <MultiSelectInput
        emptyText="还没有分组，请先在类型的分组配置中添加。"
        onChange={onChange}
        options={groupOptionsAsFieldOptions(
          template,
          language,
          fallbackLanguage,
        )}
        value={entryGroupIds(entry)}
      />
    </section>
  );
}

function FieldInput({
  entryId,
  fallbackLanguage,
  field,
  language,
  libraryDir,
  onChange,
  onStatus,
  optionSets,
  templateId,
  value,
}: {
  entryId: string;
  fallbackLanguage: LanguageCode;
  field: FieldDefinition;
  language: LanguageCode;
  libraryDir: string;
  onChange: (value: unknown) => void;
  onStatus: (status: Status) => void;
  optionSets?: TemplateOptionSet[];
  templateId: string;
  value: unknown;
}) {
  const choiceOptions = fieldOptionsForTemplate(
    field,
    { id: templateId, optionSets } as KnowledgeTemplate,
    language,
    fallbackLanguage,
  );
  const missing = requiredMissing(field, value);
  const label = (
    <label className="input-label">
      {field.label}
      {field.required && <em>*</em>}
      {missing && <span>必填</span>}
    </label>
  );

  if (field.type === "textarea" || field.type === "markdown") {
    return (
      <div className="form-field">
        {label}
        <textarea
          className={field.type === "markdown" ? "large-textarea" : ""}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="form-field inline-field">
        {label}
        <label className="switch">
          <input
            checked={Boolean(value)}
            type="checkbox"
            onChange={(event) => onChange(event.target.checked)}
          />
          <span />
        </label>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="form-field">
        {label}
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">请选择</option>
          {choiceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="form-field">
        {label}
        <MultiSelectInput
          onChange={(nextValue) => onChange(nextValue)}
          options={choiceOptions}
          value={selected}
        />
      </div>
    );
  }

  if (field.type === "tags") {
    return (
      <div className="form-field">
        {label}
        <input
          placeholder={field.placeholder}
          value={Array.isArray(value) ? value.join("，") : ""}
          onChange={(event) =>
            onChange(
              event.target.value
                .split(/[，,]/)
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
        />
      </div>
    );
  }

  if (field.type === "parameterTable") {
    return (
      <ParameterTableInput
        label={label}
        onChange={onChange}
        value={Array.isArray(value) ? (value as ParameterRow[]) : []}
      />
    );
  }

  if (field.type === "tileSize") {
    return (
      <TileSizeInput
        label={label}
        onChange={onChange}
        value={normalizeTileSizeValue(value)}
      />
    );
  }

  if (
    field.type === "richImage" ||
    field.type === "image" ||
    field.type === "frameSequence"
  ) {
    return (
      <RichImageInput
        entryId={entryId}
        field={field}
        label={label}
        libraryDir={libraryDir}
        onChange={onChange}
        onStatus={onStatus}
        templateId={templateId}
        value={normalizeRichImageValue(
          value,
          field.type === "frameSequence" ? "sequence" : "single",
        )}
      />
    );
  }

  return (
    <div className="form-field">
      {label}
      <input
        placeholder={field.placeholder}
        type={field.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(event) =>
          onChange(
            field.type === "number" ? Number(event.target.value) : event.target.value,
          )
        }
      />
    </div>
  );
}

function MultiSelectInput({
  emptyText = "还没有可选内容。",
  onChange,
  options,
  value,
}: {
  emptyText?: string;
  onChange: (value: string[]) => void;
  options: FieldOption[];
  value: string[];
}) {
  const selected = new Set(value);

  function toggleOption(optionValue: string, checked: boolean) {
    const next = checked
      ? [...value.filter((item) => item !== optionValue), optionValue]
      : value.filter((item) => item !== optionValue);
    onChange(next);
  }

  if (!options.length) {
    return <div className="multi-select-empty">{emptyText}</div>;
  }

  return (
    <div className="multi-select-options">
      {options.map((option) => (
        <label
          className={`multi-select-option ${
            selected.has(option.value) ? "checked" : ""
          }`}
          key={option.value}
        >
          <input
            checked={selected.has(option.value)}
            type="checkbox"
            onChange={(event) =>
              toggleOption(option.value, event.target.checked)
            }
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

const tileSizeParts = [
  ["up", "上"],
  ["right", "右"],
  ["down", "下"],
  ["left", "左"],
] as const;

function TileSizeInput({
  label,
  onChange,
  value,
}: {
  label: ReactNode;
  onChange: (value: TileSizeValue) => void;
  value: TileSizeValue;
}) {
  const tileSize = normalizeTileSizeValue(value);

  function updatePart(part: keyof TileSizeValue, rawValue: string) {
    const parsed = Number(rawValue);
    onChange(
      normalizeTileSizeValue({
        ...tileSize,
        [part]: Number.isFinite(parsed) ? parsed : 0,
      }),
    );
  }

  return (
    <div className="form-field">
      {label}
      <div className="tile-size-field">
        <div className="tile-size-controls">
          {tileSizeParts.map(([part, partLabel]) => (
            <label key={part}>
              {partLabel}
              <input
                min={0}
                step={1}
                type="number"
                value={tileSize[part]}
                onChange={(event) => updatePart(part, event.target.value)}
              />
            </label>
          ))}
        </div>
        <TileSizePreview value={tileSize} />
      </div>
    </div>
  );
}

function TileSizePreview({ value }: { value: TileSizeValue }) {
  const tileSize = normalizeTileSizeValue(value);
  const columns = tileSize.left + tileSize.right + 1;
  const rows = tileSize.up + tileSize.down + 1;
  const cellSize = Math.max(18, Math.min(36, Math.floor(220 / Math.max(columns, rows))));
  const style = {
    gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
  } as CSSProperties;
  const originStyle = {
    left: 8 + tileSize.left * cellSize + cellSize / 2,
    top: 8 + tileSize.up * cellSize + cellSize / 2,
  } as CSSProperties;

  return (
    <div className="tile-size-preview" style={style}>
      {Array.from({ length: rows * columns }).map((_, index) => (
        <span aria-hidden="true" className="tile-size-cell" key={index} />
      ))}
      <span
        aria-label="基准点"
        className="tile-size-origin-dot"
        style={originStyle}
      />
    </div>
  );
}

function RichImageInput({
  entryId,
  field,
  label,
  libraryDir,
  onChange,
  onStatus,
  templateId,
  value,
}: {
  entryId: string;
  field: FieldDefinition;
  label: ReactNode;
  libraryDir: string;
  onChange: (value: RichImageValue) => void;
  onStatus: (status: Status) => void;
  templateId: string;
  value: RichImageValue;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fitPreview, setFitPreview] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [sources, setSources] = useState<string[]>([]);
  const frames = value.frames;
  const isSequence = value.mode === "sequence";
  const previewScalePercent = Math.round(previewScale * 100);
  const previewStyle = {
    "--rich-image-scale": String(previewScale),
  } as CSSProperties;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        frames.map(async (assetPath) => {
          try {
            return await loadLibraryAsset(libraryDir, assetPath);
          } catch {
            return "";
          }
        }),
      );
      if (!cancelled) setSources(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [frames, libraryDir]);

  useEffect(() => {
    if (currentIndex >= frames.length) {
      setCurrentIndex(Math.max(0, frames.length - 1));
    }
    if (frames.length < 2 || !isSequence) setPlaying(false);
  }, [currentIndex, frames.length, isSequence]);

  useEffect(() => {
    if (!playing || frames.length < 2 || !isSequence) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((index) => {
        if (index >= frames.length - 1) {
          if (!value.loop) {
            setPlaying(false);
            return index;
          }
          return 0;
        }
        return index + 1;
      });
    }, richImageFrameDelay(value));
    return () => window.clearInterval(timer);
  }, [frames.length, isSequence, playing, value]);

  function updateValue(patch: Partial<RichImageValue>) {
    onChange({
      ...value,
      ...patch,
      sampling: "point",
      compression: "none",
    });
  }

  function handleModeChange(mode: RichImageValue["mode"]) {
    setPlaying(false);
    setCurrentIndex(0);
    updateValue({
      mode,
      frames: mode === "single" ? frames.slice(0, 1) : frames,
    });
  }

  async function handleUpload(multiple: boolean) {
    try {
      const imported = await importEntryImages(
        libraryDir,
        templateId,
        entryId,
        field.id,
        multiple,
      );
      if (!imported.length) return;
      const nextFrames = multiple ? [...frames, ...imported] : [imported[0]];
      updateValue({
        mode: multiple ? "sequence" : "single",
        frames: nextFrames,
      });
      setCurrentIndex(multiple ? frames.length : 0);
      onStatus({
        tone: "ok",
        text: multiple
          ? `已导入 ${imported.length} 张序列帧。`
          : "图片已导入。",
      });
    } catch (error) {
      onStatus({ tone: "warn", text: `富图片导入失败：${String(error)}` });
    }
  }

  function removeFrame(index: number) {
    const next = frames.filter((_, frameIndex) => frameIndex !== index);
    updateValue({ frames: next });
    setCurrentIndex(Math.min(index, Math.max(0, next.length - 1)));
  }

  function zoomPreview(delta: number) {
    setFitPreview(false);
    setPreviewScale((current) =>
      Math.min(4, Math.max(0.25, Number((current + delta).toFixed(2)))),
    );
  }

  const currentSource = sources[currentIndex] ?? "";

  return (
    <div className="form-field">
      {label}
      <div className="media-field">
        <div className="rich-image-settings">
          <label>
            类型
            <select
              value={value.mode}
              onChange={(event) =>
                handleModeChange(event.target.value as RichImageValue["mode"])
              }
            >
              <option value="single">单帧图片</option>
              <option value="sequence">序列帧</option>
            </select>
          </label>
          <label>
            播放速度
            <input
              disabled={!isSequence}
              max={60}
              min={1}
              type="number"
              value={value.fps}
              onChange={(event) =>
                updateValue({ fps: Number(event.target.value) })
              }
            />
          </label>
          <label className="check-row rich-image-loop">
            <input
              checked={value.loop}
              disabled={!isSequence}
              type="checkbox"
              onChange={(event) => updateValue({ loop: event.target.checked })}
            />
            重播
          </label>
          <span>点采样 / 不压缩</span>
        </div>
        <div className="rich-image-toolbar">
          <button onClick={() => zoomPreview(-0.25)} title="缩小">
            <ZoomOut size={16} />
            缩小
          </button>
          <span>{fitPreview ? "适应窗口" : `${previewScalePercent}%`}</span>
          <button onClick={() => zoomPreview(0.25)} title="放大">
            <ZoomIn size={16} />
            放大
          </button>
          <button
            className={fitPreview ? "active" : ""}
            onClick={() => {
              setFitPreview(true);
              setPreviewScale(1);
            }}
            title="适应窗口"
          >
            <Maximize2 size={16} />
            适应窗口
          </button>
        </div>
        <div
          className={`media-preview rich-image-preview ${
            fitPreview ? "fit-preview" : "scaled-preview"
          }`}
          style={previewStyle}
        >
          {currentSource ? (
            <img alt={`${field.label} ${currentIndex + 1}`} src={currentSource} />
          ) : (
            <div className="media-empty">
              <Images size={28} />
              <span>未上传富图片</span>
            </div>
          )}
        </div>
        <div className="sequence-controls">
          <button
            className="sequence-step"
            disabled={!isSequence || frames.length < 2}
            onClick={() =>
              setCurrentIndex((index) =>
                index === 0 ? frames.length - 1 : index - 1,
              )
            }
            title="上一帧"
          >
            <StepBack size={16} />
          </button>
          <button
            className="sequence-step"
            disabled={!isSequence || frames.length < 2}
            onClick={() => setPlaying((current) => !current)}
            title={playing ? "暂停" : "播放"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="sequence-step"
            disabled={!isSequence || frames.length < 2}
            onClick={() => setCurrentIndex((index) => (index + 1) % frames.length)}
            title="下一帧"
          >
            <StepForward size={16} />
          </button>
          <span>
            {frames.length ? currentIndex + 1 : 0} / {frames.length}
          </span>
          <button disabled={!libraryDir} onClick={() => void handleUpload(false)}>
            <Upload size={16} />
            上传单帧
          </button>
          <button disabled={!libraryDir} onClick={() => void handleUpload(true)}>
            <Upload size={16} />
            上传序列帧
          </button>
          <button
            disabled={!frames.length}
            onClick={() => updateValue({ frames: [] })}
          >
            <X size={16} />
            清空
          </button>
        </div>
        {frames.length > 0 && (
          <div className="sequence-strip">
            {frames.map((assetPath, index) => (
              <div
                className={index === currentIndex ? "active" : ""}
                key={`${assetPath}-${index}`}
              >
                <button onClick={() => setCurrentIndex(index)} title={`第 ${index + 1} 帧`}>
                  {sources[index] ? (
                    <img alt="" src={sources[index]} />
                  ) : (
                    <Images size={15} />
                  )}
                  <span>{index + 1}</span>
                </button>
                <button
                  className="frame-remove"
                  onClick={() => removeFrame(index)}
                  title="删除这一帧"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ParameterTableInput({
  label,
  onChange,
  value,
}: {
  label: ReactNode;
  onChange: (value: ParameterRow[]) => void;
  value: ParameterRow[];
}) {
  function updateRow(index: number, patch: Partial<ParameterRow>) {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="form-field">
      {label}
      <div className="parameter-table">
        <div className="param-head">
          <span>参数名</span>
          <span>类型</span>
          <span>必填</span>
          <span>默认值</span>
          <span>描述</span>
          <span />
        </div>
        {value.map((row, index) => (
          <div className="param-row" key={`${row.name}-${index}`}>
            <input
              value={row.name}
              onChange={(event) => updateRow(index, { name: event.target.value })}
            />
            <input
              value={row.type}
              onChange={(event) => updateRow(index, { type: event.target.value })}
            />
            <input
              checked={row.required}
              type="checkbox"
              onChange={(event) =>
                updateRow(index, { required: event.target.checked })
              }
            />
            <input
              value={row.defaultValue}
              onChange={(event) =>
                updateRow(index, { defaultValue: event.target.value })
              }
            />
            <input
              value={row.description}
              onChange={(event) =>
                updateRow(index, { description: event.target.value })
              }
            />
            <button
              className="icon-button"
              onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}
              title="删除参数"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          className="add-row"
          onClick={() =>
            onChange([
              ...value,
              {
                name: "",
                type: "",
                required: false,
                defaultValue: "",
                description: "",
              },
            ])
          }
        >
          <Plus size={16} />
          添加参数
        </button>
      </div>
    </div>
  );
}

function TemplateDesigner({
  draftTemplate,
  iconSrc,
  onAddField,
  onClearIcon,
  onCopyTemplate,
  onDeleteTemplate,
  onReorderField,
  onRemoveField,
  onSaveTemplate,
  onUploadIcon,
  onUpdateDraft,
  onUpdateField,
}: {
  draftTemplate?: KnowledgeTemplate;
  iconSrc: string;
  onAddField: () => void;
  onClearIcon: () => void;
  onCopyTemplate: () => void;
  onDeleteTemplate: () => void;
  onReorderField: (fromIndex: number, toIndex: number) => void;
  onRemoveField: (index: number) => void;
  onSaveTemplate: () => void;
  onUploadIcon: () => void;
  onUpdateDraft: (patch: Partial<KnowledgeTemplate>) => void;
  onUpdateField: (index: number, patch: Partial<FieldDefinition>) => void;
}) {
  const [activeDesignerTab, setActiveDesignerTab] =
    useState<TemplateDesignerTab>("fields");
  const [draggingFieldIndex, setDraggingFieldIndex] = useState<number | null>(null);
  const [dragOverFieldIndex, setDragOverFieldIndex] = useState<number | null>(null);
  const fieldListRef = useRef<HTMLDivElement>(null);
  const draggingFieldIndexRef = useRef<number | null>(null);
  const dragOverFieldIndexRef = useRef<number | null>(null);

  function updateFieldDragOver(index: number | null) {
    dragOverFieldIndexRef.current = index;
    setDragOverFieldIndex(index);
  }

  function fieldIndexFromPoint(clientY: number) {
    const cards = Array.from(
      fieldListRef.current?.querySelectorAll<HTMLElement>(
        ".field-designer-card",
      ) ?? [],
    );
    if (!cards.length) return null;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const [index, card] of cards.entries()) {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(clientY - (rect.top + rect.height / 2));
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    return closestIndex;
  }

  function handleFieldPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    index: number,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingFieldIndexRef.current = index;
    setDraggingFieldIndex(index);
    updateFieldDragOver(index);
  }

  function handleFieldPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (draggingFieldIndexRef.current === null) return;
    event.preventDefault();
    updateFieldDragOver(fieldIndexFromPoint(event.clientY));
  }

  function handleFieldPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (draggingFieldIndexRef.current === null) return;
    event.preventDefault();
    const fromIndex = draggingFieldIndexRef.current;
    const toIndex =
      dragOverFieldIndexRef.current ?? fieldIndexFromPoint(event.clientY);
    if (toIndex !== null && fromIndex !== toIndex) {
      onReorderField(fromIndex, toIndex);
    }
    clearFieldDragState();
  }

  function clearFieldDragState() {
    draggingFieldIndexRef.current = null;
    dragOverFieldIndexRef.current = null;
    setDraggingFieldIndex(null);
    setDragOverFieldIndex(null);
  }

  if (!draftTemplate) {
    return (
      <div className="workspace-empty">
        <LayoutTemplate size={34} />
        <h2>选择知识类型后开始设置</h2>
      </div>
    );
  }
  const textFields = draftTemplate.fields.filter((field) => field.type === "text");
  const mediaFields = draftTemplate.fields.filter(
    (field) =>
      field.type === "richImage" ||
      field.type === "image" ||
      field.type === "frameSequence",
  );
  const titleFieldId = textFields.some(
    (field) => field.id === draftTemplate.titleFieldId,
  )
    ? draftTemplate.titleFieldId
    : "";
  const iconFieldId = mediaFields.some(
    (field) => field.id === draftTemplate.iconFieldId,
  )
    ? draftTemplate.iconFieldId
    : "";
  const descriptionFieldId = textFields.some(
    (field) => field.id === draftTemplate.descriptionFieldId,
  )
    ? draftTemplate.descriptionFieldId
    : "";

  return (
    <div className="template-designer">
      <div className="template-designer-tabs">
        <button
          className={activeDesignerTab === "fields" ? "active" : ""}
          onClick={() => setActiveDesignerTab("fields")}
        >
          字段配置
        </button>
        <button
          className={activeDesignerTab === "options" ? "active" : ""}
          onClick={() => setActiveDesignerTab("options")}
        >
          选项配置
        </button>
        <button
          className={activeDesignerTab === "groups" ? "active" : ""}
          onClick={() => setActiveDesignerTab("groups")}
        >
          分组配置
        </button>
      </div>
      {activeDesignerTab === "fields" ? (
      <>
      <div className="designer-panel">
        <div className="panel-heading">
          <div>
            <span>知识类型</span>
            <strong>{draftTemplate.name}</strong>
          </div>
          <div className="button-row">
            <button onClick={onCopyTemplate}>
              <Copy size={16} />
              复制
            </button>
            <button onClick={onSaveTemplate}>
              <Save size={16} />
              保存类型
            </button>
            <button className="danger-ghost" onClick={onDeleteTemplate}>
              <Trash2 size={16} />
              删除
            </button>
          </div>
        </div>

        <div className="template-meta-grid">
          <label>
            类型名称
            <input
              value={draftTemplate.name}
              onChange={(event) => onUpdateDraft({ name: event.target.value })}
            />
          </label>
          <label>
            标识
            <input disabled value={draftTemplate.id} />
          </label>
          <label>
            默认图标
            <select
              value={templateIconName(draftTemplate)}
              onChange={(event) => onUpdateDraft({ icon: event.target.value })}
            >
              {templateIconOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.label} / {option.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            颜色
            <input
              type="color"
              value={draftTemplate.color}
              onChange={(event) => onUpdateDraft({ color: event.target.value })}
            />
          </label>
          <label>
            知识标题字段
            <select
              value={titleFieldId}
              onChange={(event) =>
                onUpdateDraft({
                  titleFieldId: event.target.value || undefined,
                })
              }
            >
              <option value="">未设置</option>
              {textFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label} / {field.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            知识图标字段
            <select
              value={iconFieldId}
              onChange={(event) =>
                onUpdateDraft({
                  iconFieldId: event.target.value || undefined,
                })
              }
            >
              <option value="">未设置</option>
              {mediaFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label} / {fieldTypeLabels[field.type]} / {field.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            小字说明字段
            <select
              value={descriptionFieldId}
              onChange={(event) =>
                onUpdateDraft({
                  descriptionFieldId: event.target.value || undefined,
                })
              }
            >
              <option value="">未设置</option>
              {textFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label} / {field.id}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            简介
            <input
              value={draftTemplate.description}
              onChange={(event) =>
                onUpdateDraft({ description: event.target.value })
              }
            />
          </label>
          <div className="template-icon-editor wide">
            <div
              className="template-icon-preview"
              style={{ background: draftTemplate.color }}
            >
              <TemplateIcon
                size={24}
                src={iconSrc}
                template={draftTemplate}
              />
            </div>
            <div className="template-icon-controls">
              <strong>图标图片</strong>
              <div className="button-row">
                <button onClick={onUploadIcon}>
                  <Upload size={16} />
                  上传图片
                </button>
                <button
                  disabled={!draftTemplate.iconImage}
                  onClick={onClearIcon}
                >
                  <X size={16} />
                  移除图片
                </button>
              </div>
            </div>
            <span>{draftTemplate.iconImage ? "已上传图片" : "未上传图片"}</span>
          </div>
        </div>

        <div className="field-designer-header">
          <strong>字段</strong>
          <button onClick={onAddField}>
            <Plus size={16} />
            添加字段
          </button>
        </div>
        <div className="field-designer-list" ref={fieldListRef}>
          {draftTemplate.fields.map((field, index) => (
            <div
              className={`field-designer-card ${
                draggingFieldIndex === index ? "dragging" : ""
              } ${
                dragOverFieldIndex === index && draggingFieldIndex !== index
                  ? "drag-over"
                  : ""
              }`}
              data-field-id={field.id}
              data-field-index={index}
              key={index}
            >
              <div className="field-card-top">
                <span
                  className="field-drag-handle"
                  onPointerCancel={clearFieldDragState}
                  onPointerDown={(event) => handleFieldPointerDown(event, index)}
                  onPointerMove={handleFieldPointerMove}
                  onPointerUp={handleFieldPointerUp}
                  role="button"
                  tabIndex={0}
                  title="拖动调整位置"
                >
                  <GripVertical size={16} />
                </span>
                <span className="field-order">{index + 1}</span>
                <input
                  value={field.label}
                  onChange={(event) =>
                    onUpdateField(index, {
                      label: event.target.value,
                      id:
                        field.id.startsWith("field") || !field.id
                          ? slugify(event.target.value, field.id || `field${index + 1}`)
                          : field.id,
                    })
                  }
                />
                <select
                  value={field.type}
                  onChange={(event) => {
                    const type = event.target.value as FieldType;
                    onUpdateField(index, {
                      type,
                      defaultValue: defaultValueForField({
                        ...field,
                        defaultValue: undefined,
                        type,
                      }),
                    });
                  }}
                >
                  {fieldTypes.map((type) => (
                    <option key={type} value={type}>
                      {fieldTypeLabels[type]}
                    </option>
                  ))}
                </select>
                <button
                  className="danger-ghost"
                  onClick={() => onRemoveField(index)}
                  title="删除字段"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="field-card-grid">
                <label>
                  字段 ID
                  <input
                    value={field.id}
                    onChange={(event) =>
                      onUpdateField(index, {
                        id: normalizeSlugInput(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  占位提示
                  <input
                    value={field.placeholder ?? ""}
                    onChange={(event) =>
                      onUpdateField(index, { placeholder: event.target.value })
                    }
                  />
                </label>
                <label>
                  默认值
                  <input
                    disabled={fieldsWithoutTextDefault.has(field.type)}
                    value={
                      fieldsWithoutTextDefault.has(field.type)
                        ? ""
                        : String(field.defaultValue ?? "")
                    }
                    onChange={(event) =>
                      onUpdateField(index, { defaultValue: event.target.value })
                    }
                  />
                </label>
                <label className="check-row">
                  <input
                    checked={field.required}
                    type="checkbox"
                    onChange={(event) =>
                      onUpdateField(index, { required: event.target.checked })
                    }
                  />
                  必填
                </label>
                {isChoiceField(field) && (
                  <label className="wide">
                    选项来源
                    <select
                      value={field.optionSetId ?? ""}
                      onChange={(event) =>
                        onUpdateField(index, {
                          optionSetId: event.target.value || undefined,
                          options: undefined,
                        })
                      }
                    >
                      <option value="">未设置</option>
                      {(draftTemplate.optionSets ?? []).map((optionSet) => (
                        <option key={optionSet.id} value={optionSet.id}>
                          {optionSet.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="placeholder-help">
                  占位符：{"{{"}
                  {field.id}
                  {"}}"} 或 {"{{"}
                  {field.label}
                  {"}}"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="designer-panel markdown-template-panel">
        <div className="panel-heading">
          <div>
            <span>Markdown 查看样式</span>
            <strong>由字段自动生成</strong>
          </div>
        </div>
        <textarea
          aria-label="Markdown 查看样式"
          readOnly
          value={generatedMarkdownTemplate(draftTemplate)}
        />
      </div>
      </>
      ) : activeDesignerTab === "options" ? (
      <OptionSetsDesigner
        draftTemplate={draftTemplate}
        onCopyTemplate={onCopyTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onSaveTemplate={onSaveTemplate}
        onUpdateDraft={onUpdateDraft}
      />
      ) : (
      <GroupOptionsDesigner
        draftTemplate={draftTemplate}
        onCopyTemplate={onCopyTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onSaveTemplate={onSaveTemplate}
        onUpdateDraft={onUpdateDraft}
      />
      )}
    </div>
  );
}

function GroupOptionsDesigner({
  draftTemplate,
  onCopyTemplate,
  onDeleteTemplate,
  onSaveTemplate,
  onUpdateDraft,
}: {
  draftTemplate: KnowledgeTemplate;
  onCopyTemplate: () => void;
  onDeleteTemplate: () => void;
  onSaveTemplate: () => void;
  onUpdateDraft: (patch: Partial<KnowledgeTemplate>) => void;
}) {
  const groupOptions = draftTemplate.groupOptions ?? [];

  function updateGroupOptions(nextGroups: TemplateGroupOption[]) {
    onUpdateDraft({
      groupOptions: normalizeTemplateGroups(nextGroups),
    });
  }

  function addGroup() {
    const index = groupOptions.length + 1;
    updateGroupOptions([
      ...groupOptions,
      {
        id: makeId("group"),
        label: `分组 ${index}`,
        translations: { [defaultLanguage]: `分组 ${index}` },
      },
    ]);
  }

  function updateGroup(index: number, patch: Partial<TemplateGroupOption>) {
    updateGroupOptions(
      groupOptions.map((group, groupIndex) =>
        groupIndex === index ? normalizeGroupOption({ ...group, ...patch }) : group,
      ),
    );
  }

  function removeGroup(index: number) {
    updateGroupOptions(groupOptions.filter((_, groupIndex) => groupIndex !== index));
  }

  function updateGroupLanguage(
    index: number,
    language: LanguageCode,
    text: string,
  ) {
    const group = groupOptions[index];
    if (!group) return;
    const translations = { ...(group.translations ?? {}) };
    if (text.trim()) {
      translations[language] = text;
    } else {
      delete translations[language];
    }
    updateGroup(index, {
      label: language === defaultLanguage ? text : group.label,
      translations,
    });
  }

  return (
    <div className="designer-panel group-options-panel">
      <div className="panel-heading">
        <div>
          <span>分组配置</span>
          <strong>先创建分组，知识编辑时再选择</strong>
        </div>
        <div className="button-row">
          <button onClick={addGroup}>
            <Plus size={16} />
            添加分组
          </button>
          <button onClick={onCopyTemplate}>
            <Copy size={16} />
            复制
          </button>
          <button onClick={onSaveTemplate}>
            <Save size={16} />
            保存类型
          </button>
          <button className="danger-ghost" onClick={onDeleteTemplate}>
            <Trash2 size={16} />
            删除
          </button>
        </div>
      </div>

      {groupOptions.length === 0 ? (
        <div className="option-empty">
          <ListTree size={28} />
          <span>还没有分组。</span>
        </div>
      ) : (
        <div className="group-option-list">
          {groupOptions.map((group, groupIndex) => (
            <section className="group-option-card" key={group.id}>
              <div className="group-option-main">
                <label>
                  分组 ID
                  <input disabled value={group.id} />
                </label>
                <div>
                  <span>当前显示</span>
                  <strong>
                    {groupOptionLabel(group, defaultLanguage, defaultLanguage)}
                  </strong>
                </div>
                <button
                  className="danger-ghost"
                  onClick={() => removeGroup(groupIndex)}
                  title="删除分组"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="option-locales">
                {supportedLanguages.map((language) => (
                  <label key={language.code}>
                    <span className={`language-flag flag-${language.code}`} />
                    {language.label}
                    <input
                      value={
                        group.translations?.[language.code] ??
                        (language.code === defaultLanguage ? group.label : "")
                      }
                      onChange={(event) =>
                        updateGroupLanguage(
                          groupIndex,
                          language.code,
                          event.target.value,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionSetsDesigner({
  draftTemplate,
  onCopyTemplate,
  onDeleteTemplate,
  onSaveTemplate,
  onUpdateDraft,
}: {
  draftTemplate: KnowledgeTemplate;
  onCopyTemplate: () => void;
  onDeleteTemplate: () => void;
  onSaveTemplate: () => void;
  onUpdateDraft: (patch: Partial<KnowledgeTemplate>) => void;
}) {
  const optionSets = draftTemplate.optionSets ?? [];

  function updateOptionSets(nextOptionSets: TemplateOptionSet[]) {
    onUpdateDraft({ optionSets: nextOptionSets.map((item) => normalizeOptionSet(item)) });
  }

  function addOptionSet() {
    const index = optionSets.length + 1;
    updateOptionSets([
      ...optionSets,
      {
        id: makeId("option-set"),
        name: `选项 ${index}`,
        items: [],
      },
    ]);
  }

  function updateOptionSet(index: number, patch: Partial<TemplateOptionSet>) {
    updateOptionSets(
      optionSets.map((optionSet, optionSetIndex) =>
        optionSetIndex === index ? { ...optionSet, ...patch } : optionSet,
      ),
    );
  }

  function removeOptionSet(index: number) {
    const removed = optionSets[index];
    onUpdateDraft({
      optionSets: optionSets.filter((_, optionSetIndex) => optionSetIndex !== index),
      fields: draftTemplate.fields.map((field) =>
        field.optionSetId === removed?.id
          ? { ...field, optionSetId: undefined }
          : field,
      ),
    });
  }

  function addOptionItem(optionSetIndex: number) {
    const optionSet = optionSets[optionSetIndex];
    if (!optionSet) return;
    const itemIndex = optionSet.items.length + 1;
    updateOptionSet(optionSetIndex, {
      items: [
        ...optionSet.items,
        {
          id: makeId("option-item"),
          value: `option${itemIndex}`,
          label: `可选内容 ${itemIndex}`,
          translations: { [defaultLanguage]: `可选内容 ${itemIndex}` },
        },
      ],
    });
  }

  function updateOptionItem(
    optionSetIndex: number,
    itemIndex: number,
    patch: Partial<TemplateOptionItem>,
  ) {
    const optionSet = optionSets[optionSetIndex];
    if (!optionSet) return;
    updateOptionSet(optionSetIndex, {
      items: optionSet.items.map((item, currentIndex) =>
        currentIndex === itemIndex ? normalizeOptionItem({ ...item, ...patch }) : item,
      ),
    });
  }

  function removeOptionItem(optionSetIndex: number, itemIndex: number) {
    const optionSet = optionSets[optionSetIndex];
    if (!optionSet) return;
    updateOptionSet(optionSetIndex, {
      items: optionSet.items.filter((_, currentIndex) => currentIndex !== itemIndex),
    });
  }

  function updateOptionItemLanguage(
    optionSetIndex: number,
    itemIndex: number,
    language: LanguageCode,
    text: string,
  ) {
    const optionSet = optionSets[optionSetIndex];
    const item = optionSet?.items[itemIndex];
    if (!optionSet || !item) return;
    const translations = { ...(item.translations ?? {}) };
    if (text.trim()) {
      translations[language] = text;
    } else {
      delete translations[language];
    }
    updateOptionItem(optionSetIndex, itemIndex, {
      label: language === defaultLanguage ? text : item.label,
      translations,
    });
  }

  return (
    <div className="designer-panel option-sets-panel">
      <div className="panel-heading">
        <div>
          <span>选项配置</span>
          <strong>给单选和多选字段提供可选内容</strong>
        </div>
        <div className="button-row">
          <button onClick={addOptionSet}>
            <Plus size={16} />
            添加选项
          </button>
          <button onClick={onCopyTemplate}>
            <Copy size={16} />
            复制
          </button>
          <button onClick={onSaveTemplate}>
            <Save size={16} />
            保存类型
          </button>
          <button className="danger-ghost" onClick={onDeleteTemplate}>
            <Trash2 size={16} />
            删除
          </button>
        </div>
      </div>

      {optionSets.length === 0 ? (
        <div className="option-empty">
          <ListTree size={28} />
          <span>还没有选项。</span>
        </div>
      ) : (
        <div className="option-set-list">
          {optionSets.map((optionSet, optionSetIndex) => (
            <section className="option-set-card" key={optionSet.id}>
              <div className="option-set-header">
                <label>
                  选项名称
                  <input
                    value={optionSet.name}
                    onChange={(event) =>
                      updateOptionSet(optionSetIndex, {
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  选项 ID
                  <input disabled value={optionSet.id} />
                </label>
                <button onClick={() => addOptionItem(optionSetIndex)}>
                  <Plus size={16} />
                  添加可选内容
                </button>
                <button
                  className="danger-ghost"
                  onClick={() => removeOptionSet(optionSetIndex)}
                  title="删除选项"
                >
                  <Trash2 size={16} />
                  删除
                </button>
              </div>

              <div className="option-item-list">
                {optionSet.items.length === 0 ? (
                  <p className="option-item-empty">还没有可选内容。</p>
                ) : (
                  optionSet.items.map((item, itemIndex) => (
                    <div className="option-item-card" key={item.id}>
                      <div className="option-item-main">
                        <label>
                          内容值
                          <input
                            value={item.value}
                            onChange={(event) =>
                              updateOptionItem(optionSetIndex, itemIndex, {
                                value: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div>
                          <span>当前显示</span>
                          <strong>
                            {optionItemLabel(
                              item,
                              defaultLanguage,
                              defaultLanguage,
                            )}
                          </strong>
                        </div>
                        <button
                          className="danger-ghost"
                          onClick={() => removeOptionItem(optionSetIndex, itemIndex)}
                          title="删除可选内容"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="option-locales">
                        {supportedLanguages.map((language) => (
                          <label key={language.code}>
                            <span>
                              <i
                                aria-hidden="true"
                                className={`language-flag flag-${language.code}`}
                              />
                              {language.label}
                            </span>
                            <input
                              value={
                                language.code === defaultLanguage
                                  ? item.label
                                  : item.translations?.[language.code] ?? ""
                              }
                              onChange={(event) =>
                                updateOptionItemLanguage(
                                  optionSetIndex,
                                  itemIndex,
                                  language.code,
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
