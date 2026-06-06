import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  Edit3,
  FilePlus2,
  FolderOpen,
  Layers,
  LayoutTemplate,
  Menu,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  chooseLibraryDirectory,
  deleteEntry,
  deleteTemplate,
  exportEntryMarkdown,
  getSettings,
  loadLibrary,
  saveEntry,
  saveSettings,
  saveTemplate,
} from "./api";
import { defaultTemplates } from "./defaultTemplates";
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
type SettingsTab = "library" | "layout" | "about";
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
  markdown: "Markdown 文本",
};

const fieldTypes = Object.keys(fieldTypeLabels) as FieldType[];

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

export default function App() {
  const [libraryDir, setLibraryDir] = useState("");
  const [templates, setTemplates] = useState<KnowledgeTemplate[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [mode, setMode] = useState<PanelMode>("entry");
  const [query, setQuery] = useState("");
  const [draftTemplate, setDraftTemplate] = useState<KnowledgeTemplate>();
  const [status, setStatus] = useState<Status>();
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("library");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await getSettings();
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

  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ??
      templates[0],
    [selectedTemplateId, templates],
  );

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId),
    [entries, selectedEntryId],
  );

  const templateEntries = useMemo(
    () =>
      selectedTemplate
        ? entries.filter((entry) => entry.templateId === selectedTemplate.id)
        : [],
    [entries, selectedTemplate],
  );

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword || !selectedTemplate) return templateEntries;
    return templateEntries.filter((entry) => {
      const title = entryTitle(selectedTemplate, entry).toLowerCase();
      const values = JSON.stringify(entry.values).toLowerCase();
      return title.includes(keyword) || values.includes(keyword);
    });
  }, [query, selectedTemplate, templateEntries]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of templateEntries) {
      const value =
        entry.values.category ?? entry.values.group ?? entry.values.namespace;
      const group = typeof value === "string" && value.trim() ? value : "未分组";
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
  }, [selectedTemplate]);

  async function refreshLibrary(dir: string) {
    setLoading(true);
    const state = await loadLibrary(dir);
    let nextTemplates = state.templates;
    if (nextTemplates.length === 0) {
      const seeded = defaultTemplates.map((template) => ({
        ...cloneTemplate(template),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }));
      for (const template of seeded) {
        await saveTemplate(dir, template);
      }
      nextTemplates = seeded;
    }
    setTemplates(nextTemplates);
    setEntries(
      state.entries.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    );
    const firstTemplate = nextTemplates[0];
    setSelectedTemplateId((current) =>
      nextTemplates.some((template) => template.id === current)
        ? current
        : firstTemplate?.id ?? "",
    );
    setSelectedEntryId((current) =>
      state.entries.some((entry) => entry.id === current)
        ? current
        : state.entries.find((entry) => entry.templateId === firstTemplate?.id)
            ?.id ?? "",
    );
    setLoading(false);
  }

  function openSettings(tab: SettingsTab = "library") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  async function handleChooseLibrary() {
    const selected = await chooseLibraryDirectory();
    if (!selected) return;
    await saveSettings({ libraryDir: selected });
    setLibraryDir(selected);
    await refreshLibrary(selected);
    setStatus({ tone: "ok", text: "资料库目录已设置。" });
  }

  async function handleNewEntry() {
    if (!selectedTemplate || !libraryDir) return;
    const createdAt = nowIso();
    const entry: KnowledgeEntry = {
      id: makeId("entry"),
      templateId: selectedTemplate.id,
      title: "未命名知识",
      values: valuesFromTemplate(selectedTemplate),
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
    if (!libraryDir || !selectedTemplate || !selectedEntry) return;
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
      ...selectedEntry,
      title: entryTitle(selectedTemplate, selectedEntry),
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
      selectedEntry.id,
      fileName,
      previewMarkdown,
    );
    setStatus({ tone: "ok", text: `已导出：${exportedPath}` });
  }

  function updateEntryValue(fieldId: string, value: unknown) {
    if (!selectedEntry) return;
    setEntries((current) =>
      current.map((entry) =>
        entry.id === selectedEntry.id
          ? { ...entry, values: { ...entry.values, [fieldId]: value } }
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
    if (!selectedTemplate || !libraryDir) return;
    const copied = {
      ...cloneTemplate(selectedTemplate),
      id: makeId("template"),
      name: `${selectedTemplate.name} 副本`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await saveTemplate(libraryDir, copied);
    setTemplates((current) => [...current, copied]);
    setSelectedTemplateId(copied.id);
    setMode("template");
    setStatus({ tone: "ok", text: "模板已复制。" });
  }

  async function handleSaveTemplate() {
    if (!draftTemplate || !libraryDir) return;
    const fieldIds = draftTemplate.fields.map((field) => field.id.trim());
    const duplicate = fieldIds.find(
      (id, index) => fieldIds.indexOf(id) !== index,
    );
    if (!draftTemplate.name.trim()) {
      setStatus({ tone: "warn", text: "模板名称不能为空。" });
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
    const next = { ...draftTemplate, updatedAt: nowIso() };
    await saveTemplate(libraryDir, next);
    setTemplates((current) => {
      const exists = current.some((template) => template.id === next.id);
      return exists
        ? current.map((template) => (template.id === next.id ? next : template))
        : [...current, next];
    });
    setSelectedTemplateId(next.id);
    setStatus({ tone: "ok", text: "模板已保存。" });
  }

  async function handleDeleteTemplate() {
    if (!libraryDir || !selectedTemplate) return;
    if (entries.some((entry) => entry.templateId === selectedTemplate.id)) {
      setStatus({ tone: "warn", text: "这个模板已有知识内容，不能删除。" });
      return;
    }
    if (!window.confirm("删除当前模板？")) return;
    await deleteTemplate(libraryDir, selectedTemplate.id);
    const nextTemplates = templates.filter(
      (template) => template.id !== selectedTemplate.id,
    );
    setTemplates(nextTemplates);
    setSelectedTemplateId(nextTemplates[0]?.id ?? "");
    setStatus({ tone: "ok", text: "模板已删除。" });
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

        <div className="topbar-actions">
          <button onClick={handleNewEntry} disabled={!hasLibrary}>
            <FilePlus2 size={18} />
            新建
          </button>
          <button onClick={handleSaveEntry} disabled={!selectedEntry}>
            <Save size={18} />
            保存
          </button>
          <button onClick={handleExportEntry} disabled={!selectedEntry}>
            <Download size={18} />
            导出 MD
          </button>
          <button onClick={() => setMode("template")}>
            <LayoutTemplate size={18} />
            模板
          </button>
        </div>

        <button className="topbar-library" onClick={() => openSettings("library")}>
          <FolderOpen size={18} />
          设置资料库目录
        </button>
      </header>

      <div className={`app-body ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <section className="sidebar-section">
          <div className="section-title">知识类型</div>
          {templates.map((template) => (
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
              {template.id === "visual-method" ? <Code2 /> : <Layers />}
              <span>{template.name}</span>
              <em>{entries.filter((entry) => entry.templateId === template.id).length}</em>
            </button>
          ))}
        </section>

        <section className="sidebar-section groups">
          <div className="section-title">
            <span>分组</span>
            <button title="新建模板" onClick={createTemplateDraft}>
              <Plus size={16} />
            </button>
          </div>
          {groups.length ? (
            groups.map(([group, count]) => (
              <div className="group-row" key={group}>
                <span>{group}</span>
                <em>{count}</em>
              </div>
            ))
          ) : (
            <p className="muted">还没有分组。</p>
          )}
        </section>

        <div className="library-card">
          <div>
            <span>资料库</span>
            <strong>{libraryDir || "未选择"}</strong>
          </div>
          <button onClick={() => openSettings("library")} title="设置资料库目录">
            <Settings size={18} />
          </button>
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
          <span>共 {filteredEntries.length} 个条目</span>
          <span>最近编辑</span>
        </div>

        <div className="entry-list">
          {!hasLibrary && (
            <button className="empty-action" onClick={() => openSettings("library")}>
              <FolderOpen size={22} />
              选择资料库目录后开始使用
            </button>
          )}
          {hasLibrary && filteredEntries.length === 0 && (
            <button className="empty-action" onClick={handleNewEntry}>
              <Plus size={22} />
              新建第一条知识
            </button>
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
                {selectedTemplate?.id === "visual-method" ? <Code2 /> : <BookOpen />}
              </div>
              <div>
                <strong>
                  {selectedTemplate ? entryTitle(selectedTemplate, entry) : entry.title}
                </strong>
                <span>
                  {String(entry.values.namespace ?? entry.values.group ?? "未分组")}
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
            模板设计器
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
            onAddField={addDraftField}
            onCopyTemplate={handleCopyTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onMoveField={moveDraftField}
            onRemoveField={removeDraftField}
            onSaveTemplate={handleSaveTemplate}
            onUpdateDraft={updateDraft}
            onUpdateField={updateDraftField}
          />
        ) : (
          <EntryEditor
            entry={selectedEntry}
            markdown={previewMarkdown}
            onDelete={handleDeleteEntry}
            onUpdateValue={updateEntryValue}
            template={selectedTemplate}
          />
        )}
      </section>
      </div>
      <SettingsDialog
        activeTab={settingsTab}
        libraryDir={libraryDir}
        open={settingsOpen}
        sidebarCollapsed={sidebarCollapsed}
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
  libraryDir,
  onChooseLibrary,
  onClose,
  onSelectTab,
  onToggleSidebar,
  open,
  sidebarCollapsed,
}: {
  activeTab: SettingsTab;
  libraryDir: string;
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
                  模板、知识内容和导出的 Markdown 会保存在这个目录。
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
                <span>本地知识库原型，当前版本用于手动维护模板和知识条目。</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function EntryEditor({
  entry,
  markdown,
  onDelete,
  onUpdateValue,
  template,
}: {
  entry?: KnowledgeEntry;
  markdown: string;
  onDelete: () => void;
  onUpdateValue: (fieldId: string, value: unknown) => void;
  template?: KnowledgeTemplate;
}) {
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
          <button className="danger-ghost" onClick={onDelete}>
            <Trash2 size={16} />
            删除
          </button>
        </div>
        <div className="field-stack">
          {template.fields.map((field) => (
            <FieldInput
              field={field}
              key={field.id}
              value={entry.values[field.id]}
              onChange={(value) => onUpdateValue(field.id, value)}
            />
          ))}
        </div>
      </div>

      <div className="preview-panel">
        <div className="panel-heading">
          <div>
            <span>Markdown 预览</span>
            <strong>{entryTitle(template, entry)}</strong>
          </div>
        </div>
        <article className="markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  onChange,
  value,
}: {
  field: FieldDefinition;
  onChange: (value: unknown) => void;
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
  onAddField,
  onCopyTemplate,
  onDeleteTemplate,
  onMoveField,
  onRemoveField,
  onSaveTemplate,
  onUpdateDraft,
  onUpdateField,
}: {
  draftTemplate?: KnowledgeTemplate;
  onAddField: () => void;
  onCopyTemplate: () => void;
  onDeleteTemplate: () => void;
  onMoveField: (index: number, direction: -1 | 1) => void;
  onRemoveField: (index: number) => void;
  onSaveTemplate: () => void;
  onUpdateDraft: (patch: Partial<KnowledgeTemplate>) => void;
  onUpdateField: (index: number, patch: Partial<FieldDefinition>) => void;
}) {
  if (!draftTemplate) {
    return (
      <div className="workspace-empty">
        <LayoutTemplate size={34} />
        <h2>选择模板后开始设计</h2>
      </div>
    );
  }

  return (
    <div className="template-designer">
      <div className="designer-panel">
        <div className="panel-heading">
          <div>
            <span>模板</span>
            <strong>{draftTemplate.name}</strong>
          </div>
          <div className="button-row">
            <button onClick={onCopyTemplate}>
              <Copy size={16} />
              复制
            </button>
            <button onClick={onSaveTemplate}>
              <Save size={16} />
              保存模板
            </button>
            <button className="danger-ghost" onClick={onDeleteTemplate}>
              <Trash2 size={16} />
              删除
            </button>
          </div>
        </div>

        <div className="template-meta-grid">
          <label>
            模板名称
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
            颜色
            <input
              type="color"
              value={draftTemplate.color}
              onChange={(event) => onUpdateDraft({ color: event.target.value })}
            />
          </label>
          <label className="wide">
            描述
            <input
              value={draftTemplate.description}
              onChange={(event) =>
                onUpdateDraft({ description: event.target.value })
              }
            />
          </label>
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
                  onChange={(event) =>
                    onUpdateField(index, {
                      type: event.target.value as FieldType,
                      defaultValue: defaultValueForField({
                        ...field,
                        type: event.target.value as FieldType,
                      }),
                    })
                  }
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
                    disabled={
                      field.type === "parameterTable" ||
                      field.type === "multiselect" ||
                      field.type === "tags"
                    }
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
                      placeholder="用逗号分隔，例如 战斗，移动，数值"
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
            <span>Markdown 查看模板</span>
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
