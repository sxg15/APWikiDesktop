import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishDir = join(root, "Publish");
const tempTargetDir = join(publishDir, ".tauri-target");
const outputExe = join(publishDir, "APWikiDesktop.exe");
const readmePath = join(publishDir, "README.txt");
const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const binaryCandidates =
  process.platform === "win32"
    ? ["APWikiDesktop.exe", "ap-wiki-desktop.exe"]
    : ["APWikiDesktop", "ap-wiki-desktop"];

function assertInsideRoot(pathToCheck) {
  const normalized = resolve(pathToCheck);
  if (!normalized.startsWith(root)) {
    throw new Error(`Refusing to operate outside project root: ${normalized}`);
  }
}

assertInsideRoot(publishDir);
assertInsideRoot(tempTargetDir);
assertInsideRoot(outputExe);

mkdirSync(publishDir, { recursive: true });
rmSync(tempTargetDir, { recursive: true, force: true });
rmSync(outputExe, { force: true });

const result = spawnSync(process.execPath, [tauriCli, "build", "--no-bundle"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    CARGO_TARGET_DIR: tempTargetDir,
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const releaseBinary = binaryCandidates
  .map((fileName) => join(tempTargetDir, "release", fileName))
  .find((filePath) => existsSync(filePath) && statSync(filePath).isFile());

if (!releaseBinary) {
  throw new Error(`Built app was not found under: ${join(tempTargetDir, "release")}`);
}

copyFileSync(releaseBinary, outputExe);
rmSync(tempTargetDir, { recursive: true, force: true });

writeFileSync(
  readmePath,
  [
    "AP Wiki green build",
    "",
    "Run APWikiDesktop.exe directly.",
    "No installer is generated.",
    "Knowledge library data is saved in the directory selected inside the app.",
  ].join("\n"),
);

console.log(`Green build is ready: ${publishDir}`);
