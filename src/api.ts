import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  KnowledgeEntry,
  KnowledgeTemplate,
  LibraryState,
} from "./types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const isTauri = () => Boolean(window.__TAURI_INTERNALS__);
const settingsKey = "ap-wiki.settings";

function browserLibraryKey(libraryDir: string) {
  return `ap-wiki.library.${libraryDir || "preview"}`;
}

export async function chooseLibraryDirectory() {
  if (isTauri()) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 AP Wiki 资料库目录",
    });
    return typeof selected === "string" ? selected : undefined;
  }
  return window.prompt("浏览器预览模式：输入资料库目录名称", "BrowserPreview") ?? undefined;
}

export async function importTemplateIcon(
  libraryDir: string,
  templateId: string,
) {
  if (isTauri()) {
    const selected = await open({
      directory: false,
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
        },
      ],
      multiple: false,
      title: "选择知识类型图标",
    });
    if (typeof selected !== "string") return undefined;
    return invoke<string>("import_template_icon", {
      libraryDir,
      sourcePath: selected,
      templateId,
    });
  }

  const images = await readBrowserImages(false);
  return images[0];
}

export async function importEntryImages(
  libraryDir: string,
  templateId: string,
  entryId: string,
  fieldId: string,
  multiple: boolean,
) {
  if (isTauri()) {
    const selected = await open({
      directory: false,
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
        },
      ],
      multiple,
      title: multiple ? "选择富图片序列帧" : "选择富图片单帧",
    });
    const sourcePaths = Array.isArray(selected)
      ? selected
      : typeof selected === "string"
        ? [selected]
        : [];
    if (!sourcePaths.length) return [];
    return invoke<string[]>("import_entry_images", {
      entryId,
      fieldId,
      libraryDir,
      sourcePaths,
      templateId,
    });
  }

  return readBrowserImages(multiple);
}

export async function loadLibraryAsset(libraryDir: string, assetPath?: string) {
  if (!assetPath) return "";
  if (/^(data:|blob:|https?:)/.test(assetPath)) return assetPath;
  if (isTauri()) {
    return invoke<string>("read_library_asset", {
      assetPath,
      libraryDir,
    });
  }
  return assetPath;
}

export async function loadTemplateIcon(libraryDir: string, iconImage?: string) {
  return loadLibraryAsset(libraryDir, iconImage);
}

export async function getSettings(): Promise<AppSettings> {
  if (isTauri()) {
    return invoke<AppSettings>("get_settings");
  }
  const raw = localStorage.getItem(settingsKey);
  return raw ? JSON.parse(raw) : {};
}

function readBrowserImages(multiple: boolean) {
  return new Promise<string[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    input.multiple = multiple;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) {
        resolve([]);
        return;
      }
      void Promise.all(files.map(readFileAsDataUrl)).then(resolve, () =>
        resolve([]),
      );
    };
    input.click();
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("图片读取失败"));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export async function saveSettings(settings: AppSettings) {
  if (isTauri()) {
    await invoke("save_settings", { settings });
    return;
  }
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

export async function loadLibrary(libraryDir: string): Promise<LibraryState> {
  if (isTauri()) {
    return invoke<LibraryState>("load_library", { libraryDir });
  }
  const raw = localStorage.getItem(browserLibraryKey(libraryDir));
  return raw ? JSON.parse(raw) : { templates: [], entries: [], initialized: false };
}

export async function saveTemplate(libraryDir: string, template: KnowledgeTemplate) {
  if (isTauri()) {
    await invoke("save_template", { libraryDir, template });
    return;
  }
  const state = await loadLibrary(libraryDir);
  const exists = state.templates.some((item) => item.id === template.id);
  const next = exists
    ? state.templates.map((item) => (item.id === template.id ? template : item))
    : [...state.templates, template];
  localStorage.setItem(
    browserLibraryKey(libraryDir),
    JSON.stringify({ ...state, templates: next, initialized: true }),
  );
}

export async function deleteTemplate(libraryDir: string, templateId: string) {
  if (isTauri()) {
    await invoke("delete_template", { libraryDir, templateId });
    return;
  }
  const state = await loadLibrary(libraryDir);
  localStorage.setItem(
    browserLibraryKey(libraryDir),
    JSON.stringify({
      ...state,
      templates: state.templates.filter((item) => item.id !== templateId),
      entries: state.entries.filter((item) => item.templateId !== templateId),
      initialized: true,
    }),
  );
}

export async function saveEntry(libraryDir: string, entry: KnowledgeEntry) {
  if (isTauri()) {
    await invoke("save_entry", { libraryDir, entry });
    return;
  }
  const state = await loadLibrary(libraryDir);
  const next = [...state.entries.filter((item) => item.id !== entry.id), entry];
  localStorage.setItem(
    browserLibraryKey(libraryDir),
    JSON.stringify({ ...state, entries: next, initialized: true }),
  );
}

export async function deleteEntry(
  libraryDir: string,
  templateId: string,
  entryId: string,
) {
  if (isTauri()) {
    await invoke("delete_entry", { libraryDir, templateId, entryId });
    return;
  }
  const state = await loadLibrary(libraryDir);
  localStorage.setItem(
    browserLibraryKey(libraryDir),
    JSON.stringify({
      ...state,
      entries: state.entries.filter((item) => item.id !== entryId),
    }),
  );
}

export async function exportEntryMarkdown(
  libraryDir: string,
  templateId: string,
  entryId: string,
  fileName: string,
  markdown: string,
) {
  if (isTauri()) {
    return invoke<string>("export_entry_markdown", {
      libraryDir,
      templateId,
      entryId,
      fileName,
      markdown,
    });
  }
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}
