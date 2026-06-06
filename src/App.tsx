import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Box,
  BookOpen,
  Boxes,
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
  entryTitle,
  formatDate,
  renderMarkdownTemplate,
  valuesFromTemplate,
} from "./markdown";
import type {
  FieldDefinition,
  FieldOption,
  FieldType,
  KnowledgeEntry,
  KnowledgeTemplate,
  ParameterRow,
} from "./types";

type PanelMode = "entry" | "template";
type SettingsTab = "library" | "language" | "layout" | "about";
type Status = { tone: "ok" | "warn"; text: string } | undefined;

const fieldTypeLabels: Record<FieldType, string> = {
  text: "单行文本",
  textarea: "多行文本",
  number: "数字",
  boolean: "开关",
  select: "单选",
  multiselect: "多选",
  tags: "标签",
  parameterTable: "参数表",
  image: "单帧图片",
  frameSequence: "序列帧",
  markdown: "Markdown 文本",
};

const fieldTypes = Object.keys(fieldTypeLabels) as FieldType[];
const fieldsWithoutTextDefault = new Set<FieldType>([
  "parameterTable",
  "multiselect",
  "tags",
  "image",
  "frameSequence",
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
  const normalized = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function safeFileName(value: string) {
  return `${value.trim() || "未命名知识"}.md`.replace(/[\\/:*?"<>|]/g, "_");
}

function optionsToText(options?: FieldOption[]) {
  return (options ?? []).map((option) => option.label).join("，");
}

function textToOptions(value: string): FieldOption[] {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ label: item, value: item }));
}

function requiredMissing(field: FieldDefinition, value: unknown) {
  if (!field.required) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return false;
  return value === undefined || value === null || String(value).trim() === "";
}

function entryGroup(entry: KnowledgeEntry) {
  const value =
    entry.values.group ?? entry.values.category ?? entry.values.namespace;
  return typeof value === "string" && value.trim() ? value.trim() : "未分组";
}

function normalizeTemplate(template: KnowledgeTemplate): KnowledgeTemplate {
  const translations = template.translations
    ? Object.fromEntries(
        Object.entries(template.translations).map(([language, translation]) => [
          language,
          translation
            ? {
                ...translation,
                fields: translation.fields?.map(normalizeField),
                markdownTemplate:
                  translation.markdownTemplate === undefined
                    ? undefined
                    : normalizeMarkdownTemplate(translation.markdownTemplate),
              }
            : translation,
        ]),
      )
    : undefined;
  return {
    ...template,
    color: template.color || "#0f7c80",
    description: template.description ?? "",
    icon: templateIconName(template),
    fields: template.fields.map(normalizeField),
    translations: translations as KnowledgeTemplate["translations"],
    markdownTemplate: normalizeMarkdownTemplate(template.markdownTemplate),
  };
}

function normalizeField(field: FieldDefinition): FieldDefinition {
  return field.id === "category"
    ? {
        ...field,
        id: "group",
        label: "分组",
        type: "text",
        required: false,
        options: undefined,
        placeholder: field.placeholder || "输入分组",
      }
    : field;
}

function normalizeMarkdownTemplate(markdownTemplate: string) {
  return markdownTemplate
      .replace(/分类：\{\{\s*category\s*\}\}/g, "分组：{{group}}")
      .replace(/\{\{\s*category\s*\}\}/g, "{{group}}");
}

function normalizeEntry(entry: KnowledgeEntry): KnowledgeEntry {
  const values = normalizeEntryValues(entry.values);
  const translations = entry.translations
    ? Object.fromEntries(
        Object.entries(entry.translations).map(([language, translation]) => [
          language,
          translation
            ? {
                ...translation,
                values: translation.values
                  ? normalizeEntryValues(translation.values)
                  : translation.values,
              }
            : translation,
        ]),
      )
    : undefined;
  return {
    ...entry,
    values,
    translations: translations as KnowledgeEntry["translations"],
  };
}

function normalizeEntryValues(values: Record<string, unknown>) {
  if (values.group !== undefined || values.category === undefined) {
    return values;
  }
  return { ...values, group: values.category };
}

export default function App() {
  const [libraryDir, setLibraryDir] = useState("");
  const [templates, setTemplates] = useState<KnowledgeTemplate[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [mode, setMode] = useState<PanelMode>("entry");
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [draftTemplate, setDraftTemplate] = useState<KnowledgeTemplate>();
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
    () =>
      entries.map((entry) =>
        localizeEntry(entry, currentLanguage, fallbackLanguage),
      ),
    [currentLanguage, entries, fallbackLanguage],
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
      ? templateEntries.filter((entry) => entryGroup(entry) === selectedGroup)
      : templateEntries;
    if (!keyword) return grouped;
    return grouped.filter((entry) => {
      const title = entryTitle(selectedTemplate, entry).toLowerCase();
      const values = JSON.stringify(entry.values).toLowerCase();
      return title.includes(keyword) || values.includes(keyword);
    });
  }, [query, selectedGroup, selectedTemplate, templateEntries]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of templateEntries) {
      const group = entryGroup(entry);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [templateEntries]);

  const previewMarkdown = useMemo(() => {
    if (!selectedTemplate || !selectedEntry) return "";
    return renderMarkdownTemplate(selectedTemplate, selectedEntry);
  }, [selectedEntry, selectedTemplate]);

  useEffect(() => {
    if (selectedTemplate) setDraftTemplate(cloneTemplate(selectedTemplate));
    setSelectedGroup("");
  }, [selectedTemplate]);

  useEffect(() => {
    if (selectedGroup && !groups.some(([group]) => group === selectedGroup)) {
      setSelectedGroup("");
    }
  }, [groups, selectedGroup]);

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
    let nextTemplates: KnowledgeTemplate[] =
      state.templates.map(normalizeTemplate);
    if (!state.initialized && nextTemplates.length === 0) {
      const seeded = defaultTemplates.map((template) => ({
        ...cloneTemplate(template),
        icon: templateIconName(template),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })).map(normalizeTemplate);
      for (const template of seeded) {
        await saveTemplate(dir, template);
      }
      nextTemplates = seeded;
    }
    const nextEntries = state.entries
      .map(normalizeEntry)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    setTemplates(nextTemplates);
    setEntries(nextEntries);
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

  async function handleChangeLanguage(language: LanguageCode) {
    setCurrentLanguage(language);
    await persistSettings({ displayLanguage: language });
  }

  async function handleChangeFallbackLanguage(language: LanguageCode) {
    setFallbackLanguage(language);
    await persistSettings({ fallbackLanguage: language });
  }

  function iconSrcForTemplate(template?: KnowledgeTemplate) {
    if (!template?.iconImage) return "";
    if (/^(data:|blob:|https?:)/.test(template.iconImage)) {
      return template.iconImage;
    }
    return iconSources[template.id] ?? "";
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
    if (
      selectedGroup &&
      selectedTemplate.fields.some((field) => field.id === "group")
    ) {
      values.group = selectedGroup;
    }
    const entry: KnowledgeEntry = {
      id: makeId("entry"),
      templateId: selectedTemplate.id,
      title: "未命名知识",
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
    setSelectedEntryId(entry.id);
    setMode("entry");
    setStatus({ tone: "ok", text: "已创建新知识。" });
  }

  async function handleSaveEntry() {
    if (!libraryDir || !selectedTemplate || !selectedEntry || !selectedBaseEntry) return;
    const missing = selectedTemplate.fields.filter((field) =>
      requiredMissing(field, selectedEntry.values[field.id]),
    );
    if (missing.length) {
      setStatus({
        tone: "warn",
        text: `请先填写必填字段：${missing.map((field) => field.label).join("、")}`,
      });
      return;
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
    setStatus({ tone: "ok", text: "知识已保存。" });
  }

  async function handleDeleteEntry() {
    if (!libraryDir || !selectedEntry) return;
    if (!window.confirm("删除这条知识？")) return;
    await deleteEntry(libraryDir, selectedEntry.templateId, selectedEntry.id);
    setEntries((current) =>
      current.filter((entry) => entry.id !== selectedEntry.id),
    );
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
      markdownTemplate: "# {{name}}\n\n{{description}}",
      createdAt,
      updatedAt: createdAt,
    };
    setDraftTemplate(template);
    setMode("template");
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
    await saveTemplate(libraryDir, copied);
    setTemplates((current) => [...current, copied]);
    setSelectedTemplateId(copied.id);
    setMode("template");
    setStatus({ tone: "ok", text: "知识类型已复制。" });
  }

  async function handleSaveTemplate() {
    if (!draftTemplate || !libraryDir) return;
    const fieldIds = draftTemplate.fields.map((field) => field.id.trim());
    const duplicate = fieldIds.find(
      (id, index) => fieldIds.indexOf(id) !== index,
    );
    if (!draftTemplate.name.trim()) {
      setStatus({ tone: "warn", text: "类型名称不能为空。" });
      return;
    }
    if (fieldIds.some((id) => !id)) {
      setStatus({ tone: "warn", text: "字段 ID 不能为空。" });
      return;
    }
    if (duplicate) {
      setStatus({ tone: "warn", text: `字段 ID 重复：${duplicate}` });
      return;
    }
    const baseTemplate =
      templates.find((template) => template.id === draftTemplate.id) ??
      draftTemplate;
    const next = mergeTemplateLanguage(baseTemplate, {
      ...draftTemplate,
      icon: templateIconName(draftTemplate),
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
    setStatus({ tone: "ok", text: "知识类型已保存。" });
  }

  async function handleUploadTemplateIcon() {
    if (!draftTemplate || !libraryDir) return;
    const iconImage = await importTemplateIcon(libraryDir, draftTemplate.id);
    if (!iconImage) return;
    setDraftTemplate((current) =>
      current ? { ...current, iconImage, updatedAt: nowIso() } : current,
    );
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
    setIconSources((current) => ({ ...current, [draftTemplate.id]: "" }));
  }

  async function handleDeleteTemplate() {
    if (!libraryDir || !draftTemplate) return;
    const existing = templates.find((template) => template.id === draftTemplate.id);
    if (!existing) {
      setDraftTemplate(selectedTemplate ? cloneTemplate(selectedTemplate) : undefined);
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
    setStatus({ tone: "ok", text: "知识类型已删除。" });
  }

  function updateDraft(patch: Partial<KnowledgeTemplate>) {
    setDraftTemplate((current) => (current ? { ...current, ...patch } : current));
  }

  function updateDraftField(index: number, patch: Partial<FieldDefinition>) {
    setDraftTemplate((current) => {
      if (!current) return current;
      const fields = current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      );
      return { ...current, fields };
    });
  }

  function addDraftField() {
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

  function moveDraftField(index: number, direction: -1 | 1) {
    setDraftTemplate((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.fields.length) return current;
      const fields = [...current.fields];
      const [field] = fields.splice(index, 1);
      fields.splice(target, 0, field);
      return { ...current, fields };
    });
  }

  function removeDraftField(index: number) {
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
          <LanguageSelect
            value={currentLanguage}
            onChange={(language) => void handleChangeLanguage(language)}
          />
          <button className="topbar-settings" onClick={() => openSettings("library")} title="设置">
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
              onClick={createTemplateDraft}
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
              <button
                className={`type-button ${
                  selectedTemplate?.id === template.id ? "active" : ""
                }`}
                key={template.id}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setSelectedEntryId(
                    entries.find((entry) => entry.templateId === template.id)
                      ?.id ?? "",
                  );
                  setMode("entry");
                }}
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
            );
          })}
        </section>

        <section className="sidebar-section groups">
          <div className="section-title">
            <span>分组</span>
          </div>
          {groups.length ? (
            <>
            <button
              className={`group-row ${selectedGroup === "" ? "active" : ""}`}
              onClick={() => setSelectedGroup("")}
            >
              <span>全部</span>
              <em>{templateEntries.length}</em>
            </button>
            {groups.map(([group, count]) => (
              <button
                className={`group-row ${
                  selectedGroup === group ? "active" : ""
                }`}
                key={group}
                onClick={() => setSelectedGroup(group)}
              >
                <span>{group}</span>
                <em>{count}</em>
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
            {selectedGroup && <small>当前分组：{selectedGroup}</small>}
          </div>
          <button
            className="list-new-button"
            disabled={!hasLibrary || !selectedTemplate}
            onClick={handleNewEntry}
          >
            <Plus size={16} />
            新建知识
          </button>
        </div>

        <div className="entry-list">
          {!hasLibrary && (
            <button className="empty-action" onClick={() => openSettings("library")}>
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
              onClick={() => {
                setSelectedEntryId(entry.id);
                setMode("entry");
              }}
            >
              <div
                className="entry-icon"
                style={{ background: selectedTemplate?.color }}
              >
                <TemplateIcon
                  src={iconSrcForTemplate(selectedTemplate)}
                  template={selectedTemplate}
                />
              </div>
              <div>
                <strong>
                  {selectedTemplate ? entryTitle(selectedTemplate, entry) : entry.title}
                </strong>
                <span>
                  {entryGroup(entry)}
                </span>
                <small>更新于 {formatDate(entry.updatedAt)}</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="workspace-tabs">
          <button
            className={mode === "entry" ? "active" : ""}
            onClick={() => setMode("entry")}
          >
            编辑器
          </button>
          <button
            className={mode === "template" ? "active" : ""}
            onClick={() => setMode("template")}
          >
            类型设置
          </button>
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

        {mode === "template" ? (
          <TemplateDesigner
            draftTemplate={draftTemplate}
            iconSrc={iconSrcForTemplate(draftTemplate)}
            onAddField={addDraftField}
            onClearIcon={handleClearTemplateIcon}
            onCopyTemplate={handleCopyTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onMoveField={moveDraftField}
            onRemoveField={removeDraftField}
            onSaveTemplate={handleSaveTemplate}
            onUploadIcon={handleUploadTemplateIcon}
            onUpdateDraft={updateDraft}
            onUpdateField={updateDraftField}
          />
        ) : (
          <EntryEditor
            entry={selectedEntry}
            libraryDir={libraryDir}
            markdown={previewMarkdown}
            onDelete={handleDeleteEntry}
            onExport={handleExportEntry}
            onSave={handleSaveEntry}
            onStatus={setStatus}
            onUpdateValue={updateEntryValue}
            template={selectedTemplate}
          />
        )}
      </section>
      </div>
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
    </main>
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
  onChange,
  value,
}: {
  onChange: (language: LanguageCode) => void;
  value: LanguageCode;
}) {
  const selectedLanguage =
    supportedLanguages.find((language) => language.code === value) ??
    supportedLanguages[0];

  return (
    <label className="language-picker">
      <span
        aria-hidden="true"
        className={`language-flag flag-${selectedLanguage.code}`}
      />
      <select
        aria-label="当前语言"
        value={value}
        onChange={(event) =>
          onChange(normalizeLanguage(event.target.value))
        }
      >
        {supportedLanguages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EntryEditor({
  entry,
  libraryDir,
  markdown,
  onDelete,
  onExport,
  onSave,
  onStatus,
  onUpdateValue,
  template,
}: {
  entry?: KnowledgeEntry;
  libraryDir: string;
  markdown: string;
  onDelete: () => void;
  onExport: () => void;
  onSave: () => void;
  onStatus: (status: Status) => void;
  onUpdateValue: (fieldId: string, value: unknown) => void;
  template?: KnowledgeTemplate;
}) {
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  if (!template || !entry) {
    return (
      <div className="workspace-empty">
        <BookOpen size={34} />
        <h2>选择或新建一条知识</h2>
        <p>左侧选择知识类型，中间选择条目，右侧会显示结构化编辑和预览。</p>
      </div>
    );
  }

  return (
    <div className="editor-grid">
      <div className="form-panel">
        <div className="panel-heading">
          <div>
            <span>结构化内容</span>
            <strong>{template.name}</strong>
          </div>
          <div className="button-row">
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
          {template.fields.map((field) => (
            <FieldInput
              entryId={entry.id}
              field={field}
              key={field.id}
              libraryDir={libraryDir}
              templateId={entry.templateId}
              value={entry.values[field.id]}
              onStatus={onStatus}
              onChange={(value) => onUpdateValue(field.id, value)}
            />
          ))}
        </div>
      </div>

      <div className={`preview-panel ${previewFullscreen ? "fullscreen-preview" : ""}`}>
        <div className="panel-heading">
          <div>
            <span>Markdown 预览</span>
            <strong>{entryTitle(template, entry)}</strong>
          </div>
          <div className="button-row">
            <button onClick={onExport}>
              <Download size={16} />
              导出 MD
            </button>
            <button onClick={() => setPreviewFullscreen((current) => !current)}>
              {previewFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {previewFullscreen ? "退出全屏" : "全屏显示"}
            </button>
          </div>
        </div>
        <article className="markdown-preview">
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
            remarkPlugins={[remarkGfm]}
          >
            {markdown}
          </ReactMarkdown>
        </article>
      </div>
    </div>
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
  const [imageSrc, setImageSrc] = useState(src ?? "");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!src) {
        setImageSrc("");
        return;
      }
      if (/^(data:|blob:|https?:)/.test(src)) {
        setImageSrc(src);
        return;
      }
      const normalized = src.replace(/\\/g, "/");
      const assetPath = normalized.startsWith("assets/")
        ? `entries/${entry.templateId}/${entry.id}/${normalized}`
        : normalized.replace(/^(\.\.\/)+/, "");
      try {
        const loaded = await loadLibraryAsset(libraryDir, assetPath);
        if (!cancelled) setImageSrc(loaded);
      } catch {
        if (!cancelled) setImageSrc(src);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.templateId, libraryDir, src]);

  return imageSrc ? <img alt={alt} src={imageSrc} /> : null;
}

function FieldInput({
  entryId,
  field,
  libraryDir,
  onChange,
  onStatus,
  templateId,
  value,
}: {
  entryId: string;
  field: FieldDefinition;
  libraryDir: string;
  onChange: (value: unknown) => void;
  onStatus: (status: Status) => void;
  templateId: string;
  value: unknown;
}) {
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
          {(field.options ?? []).map((option) => (
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
        <select
          multiple
          value={selected}
          onChange={(event) =>
            onChange(
              Array.from(event.target.selectedOptions).map(
                (option) => option.value,
              ),
            )
          }
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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

  if (field.type === "image") {
    return (
      <ImageFieldInput
        entryId={entryId}
        field={field}
        label={label}
        libraryDir={libraryDir}
        onChange={onChange}
        onStatus={onStatus}
        templateId={templateId}
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  if (field.type === "frameSequence") {
    return (
      <FrameSequenceInput
        entryId={entryId}
        field={field}
        label={label}
        libraryDir={libraryDir}
        onChange={onChange}
        onStatus={onStatus}
        templateId={templateId}
        value={
          Array.isArray(value)
            ? value.filter((item): item is string => typeof item === "string")
            : []
        }
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

function ImageFieldInput({
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
  onChange: (value: string) => void;
  onStatus: (status: Status) => void;
  templateId: string;
  value: string;
}) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!value) {
        setSource("");
        return;
      }
      try {
        const loaded = await loadLibraryAsset(libraryDir, value);
        if (!cancelled) setSource(loaded);
      } catch {
        if (!cancelled) setSource("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryDir, value]);

  async function handleUpload() {
    try {
      const imported = await importEntryImages(
        libraryDir,
        templateId,
        entryId,
        field.id,
        false,
      );
      if (!imported[0]) return;
      onChange(imported[0]);
      onStatus({ tone: "ok", text: "图片已导入。" });
    } catch (error) {
      onStatus({ tone: "warn", text: `图片导入失败：${String(error)}` });
    }
  }

  return (
    <div className="form-field">
      {label}
      <div className="media-field">
        <div className="media-preview image-preview">
          {source ? (
            <img alt={field.label} src={source} />
          ) : (
            <div className="media-empty">
              <ImageIcon size={28} />
              <span>未上传图片</span>
            </div>
          )}
        </div>
        <div className="media-actions">
          <button disabled={!libraryDir} onClick={() => void handleUpload()}>
            <Upload size={16} />
            上传图片
          </button>
          <button disabled={!value} onClick={() => onChange("")}>
            <X size={16} />
            移除图片
          </button>
        </div>
      </div>
    </div>
  );
}

function FrameSequenceInput({
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
  onChange: (value: string[]) => void;
  onStatus: (status: Status) => void;
  templateId: string;
  value: string[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sources, setSources] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        value.map(async (assetPath) => {
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
  }, [libraryDir, value]);

  useEffect(() => {
    if (currentIndex >= value.length) {
      setCurrentIndex(Math.max(0, value.length - 1));
    }
    if (value.length < 2) setPlaying(false);
  }, [currentIndex, value.length]);

  useEffect(() => {
    if (!playing || value.length < 2) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((index) => (index + 1) % value.length);
    }, 120);
    return () => window.clearInterval(timer);
  }, [playing, value.length]);

  async function handleUpload() {
    try {
      const imported = await importEntryImages(
        libraryDir,
        templateId,
        entryId,
        field.id,
        true,
      );
      if (!imported.length) return;
      onChange([...value, ...imported]);
      setCurrentIndex(value.length);
      onStatus({ tone: "ok", text: `已导入 ${imported.length} 张序列帧。` });
    } catch (error) {
      onStatus({ tone: "warn", text: `序列帧导入失败：${String(error)}` });
    }
  }

  function removeFrame(index: number) {
    const next = value.filter((_, frameIndex) => frameIndex !== index);
    onChange(next);
    setCurrentIndex(Math.min(index, Math.max(0, next.length - 1)));
  }

  const currentSource = sources[currentIndex] ?? "";

  return (
    <div className="form-field">
      {label}
      <div className="media-field">
        <div className="media-preview sequence-preview">
          {currentSource ? (
            <img alt={`${field.label} ${currentIndex + 1}`} src={currentSource} />
          ) : (
            <div className="media-empty">
              <Images size={28} />
              <span>未上传序列帧</span>
            </div>
          )}
        </div>
        <div className="sequence-controls">
          <button
            className="sequence-step"
            disabled={value.length < 2}
            onClick={() =>
              setCurrentIndex((index) =>
                index === 0 ? value.length - 1 : index - 1,
              )
            }
            title="上一帧"
          >
            <StepBack size={16} />
          </button>
          <button
            className="sequence-step"
            disabled={value.length < 2}
            onClick={() => setPlaying((current) => !current)}
            title={playing ? "暂停" : "播放"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="sequence-step"
            disabled={value.length < 2}
            onClick={() =>
              setCurrentIndex((index) => (index + 1) % value.length)
            }
            title="下一帧"
          >
            <StepForward size={16} />
          </button>
          <span>
            {value.length ? currentIndex + 1 : 0} / {value.length}
          </span>
          <button disabled={!libraryDir} onClick={() => void handleUpload()}>
            <Upload size={16} />
            上传序列帧
          </button>
          <button disabled={!value.length} onClick={() => onChange([])}>
            <X size={16} />
            清空
          </button>
        </div>
        {value.length > 0 && (
          <div className="sequence-strip">
            {value.map((assetPath, index) => (
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
  onMoveField,
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
  onMoveField: (index: number, direction: -1 | 1) => void;
  onRemoveField: (index: number) => void;
  onSaveTemplate: () => void;
  onUploadIcon: () => void;
  onUpdateDraft: (patch: Partial<KnowledgeTemplate>) => void;
  onUpdateField: (index: number, patch: Partial<FieldDefinition>) => void;
}) {
  if (!draftTemplate) {
    return (
      <div className="workspace-empty">
        <LayoutTemplate size={34} />
        <h2>选择知识类型后开始设置</h2>
      </div>
    );
  }

  return (
    <div className="template-designer">
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
        <div className="field-designer-list">
          {draftTemplate.fields.map((field, index) => (
            <div className="field-designer-card" key={`${field.id}-${index}`}>
              <div className="field-card-top">
                <span>{index + 1}</span>
                <input
                  value={field.label}
                  onChange={(event) =>
                    onUpdateField(index, {
                      label: event.target.value,
                      id:
                        field.id.startsWith("field") || !field.id
                          ? slugify(event.target.value, field.id)
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
                <button onClick={() => onMoveField(index, -1)} title="上移">
                  <ArrowUp size={15} />
                </button>
                <button onClick={() => onMoveField(index, 1)} title="下移">
                  <ArrowDown size={15} />
                </button>
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
                        id: slugify(event.target.value, field.id),
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
                    value={String(field.defaultValue ?? "")}
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
                {(field.type === "select" || field.type === "multiselect") && (
                  <label className="wide">
                    选项
                    <input
                      placeholder="用逗号分隔多个选项"
                      value={optionsToText(field.options)}
                      onChange={(event) =>
                        onUpdateField(index, {
                          options: textToOptions(event.target.value),
                        })
                      }
                    />
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
            <strong>占位符会被知识内容替换</strong>
          </div>
        </div>
        <textarea
          value={draftTemplate.markdownTemplate}
          onChange={(event) =>
            onUpdateDraft({ markdownTemplate: event.target.value })
          }
        />
      </div>
    </div>
  );
}
