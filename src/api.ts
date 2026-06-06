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

  return readBrowserImage();
}

export async function loadTemplateIcon(libraryDir: string, iconImage?: string) {
  if (!iconImage) return "";
  if (/^(data:|blob:|https?:)/.test(iconImage)) return iconImage;
  if (isTauri()) {
    return invoke<string>("read_library_asset", {
      assetPath: iconImage,
      libraryDir,
    });
  }
  return iconImage;
}

export async function getSettings(): Promise<AppSettings> {
  if (isTauri()) {
    return invoke<AppSettings>("get_settings");
  }
  const raw = localStorage.getItem(settingsKey);
  return raw ? JSON.parse(raw) : {};
}

function readBrowserImage() {
  return new Promise<string | undefined>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(undefined);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    };
    input.click();
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
  const next = [
    ...state.templates.filter((item) => item.id !== template.id),
    template,
  ];
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
  entryId: string,
  fileName: string,
  markdown: string,
) {
  if (isTauri()) {
    return invoke<string>("export_entry_markdown", {
      libraryDir,
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
