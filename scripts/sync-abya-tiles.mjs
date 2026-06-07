import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unityExe =
  process.env.UNITY_EXE || "D:\\Unity Editor\\2022.3.62f2c1\\Editor\\Unity.exe";
const unityProject =
  process.env.ABYA_UNITY_PROJECT || "F:\\Unity\\Projects\\AbyaPB";
const libraryDir = process.env.APWIKI_LIBRARY_DIR || "D:\\ABYA Wiki";
const customTileRoot =
  process.env.ABYA_CUSTOM_TILE_ROOT || "Assets/SO/Tile/CustomTile";
const exportDir = join(tmpdir(), `apwiki-abya-tiles-${process.pid}`);
const unityLogPath = join(exportDir, "unity-export.log");
const executeMethod =
  "ABYA.Paintball.Editor.TileTextureExporter.TileTextureExportBatch.ExportCustomTileRoot";
const customTileScriptGuid = "76822501c06d6964c9295fab96c53d78";
let directExportWarnings = [];

const layers = [
  ["World", "世界层"],
  ["Function", "功能层"],
  ["TrackNode", "轨道节点层"],
  ["Background", "背景层"],
  ["FrontDecoration", "前装饰层"],
  ["RearDecoration", "后装饰层"],
  ["Track", "轨道层"],
  ["Entity", "实体层"],
];
const layerIds = new Set(layers.map(([id]) => id));

main();

function main() {
  assertFile(unityExe, "Unity executable");
  assertDirectory(unityProject, "Unity project");
  assertDirectory(libraryDir, "AP Wiki library");

  rmSync(exportDir, { recursive: true, force: true });
  mkdirSync(exportDir, { recursive: true });

  try {
    const { report, index } = exportTiles();
    const tiles = Array.isArray(index.tiles) ? index.tiles : [];
    if (!report.success) {
      throw new Error(`Unity tile export failed with ${report.criticalErrorCount ?? 0} errors.`);
    }
    if (tiles.length !== report.exportedTiles) {
      throw new Error(`Export count mismatch: index=${tiles.length}, report=${report.exportedTiles}.`);
    }

    writeExportArtifacts(report, index);
    const template = ensureTileTemplateGroups();
    const summary = rebuildTileEntries(template, tiles, report);
    console.log(`Synced ${summary.entries} tile entries to ${summary.entriesDir}`);
    console.log(`Unity CustomTile total: ${report.totalCustomTiles}; exported: ${report.exportedTiles}; warnings: ${report.warningCount ?? 0}`);
    if (report.warningCount) {
      console.log("Unity export warnings are recorded in export_report.json.");
    }
  } finally {
    if (process.env.APWIKI_KEEP_TILE_EXPORT !== "1") {
      safeRemoveDir(exportDir);
    } else {
      console.log(`Kept export directory: ${exportDir}`);
    }
  }
}

function writeExportArtifacts(report, index) {
  const targetDir = join(libraryDir, "exports", "abya-tile-sync");
  mkdirSync(targetDir, { recursive: true });
  writeJson(join(targetDir, "export_report.json"), report);
  writeJson(join(targetDir, "tile_index.json"), index);
}

function exportTiles() {
  if (process.env.APWIKI_DIRECT_TILE_EXPORT === "1") {
    return exportTilesFromYaml();
  }

  if (existsSync(join(unityProject, "Temp", "UnityLockfile"))) {
    return exportTilesWithShadowFallback("Unity project is already open; using a temporary shadow project.");
  }

  try {
    runUnityExport();
    return readExportResult();
  } catch (error) {
    console.warn(String(error?.message || error));
    console.warn("Falling back to direct asset parsing because Unity export is unavailable.");
    return exportTilesFromYaml();
  }
}

function exportTilesWithShadowFallback(reason) {
  console.warn(reason);
  try {
    runUnityExportWithShadowProject();
    return readExportResult();
  } catch (shadowError) {
    console.warn(String(shadowError?.message || shadowError));
    console.warn("Falling back to direct asset parsing because Unity shadow export is unavailable.");
    return exportTilesFromYaml();
  }
}

function readExportResult() {
  const report = readJson(join(exportDir, "export_report.json"));
  const index = readJson(join(exportDir, "tile_index.json"));
  assertNoPlaceholderIconSprites(Array.isArray(index.tiles) ? index.tiles : []);
  return { report, index };
}

function runUnityExport(projectPath = unityProject) {
  const args = [
    "-batchmode",
    "-nographics",
    "-quit",
    "-projectPath",
    projectPath,
    "-executeMethod",
    executeMethod,
    "-abyaTileExportTarget",
    exportDir,
    "-abyaCustomTileRoot",
    customTileRoot,
    "-logFile",
    unityLogPath,
  ];

  const result = spawnSync(unityExe, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status === 0) return;

  const logTail = existsSync(unityLogPath)
    ? readFileSync(unityLogPath, "utf8").split(/\r?\n/).slice(-80).join("\n")
    : "";
  throw new Error(
    `Unity export command failed with code ${result.status ?? "unknown"}.\n${logTail}`,
  );
}

function runUnityExportWithShadowProject() {
  const shadowProject = join(tmpdir(), `apwiki-abya-unity-shadow-${process.pid}`);
  safeRemoveDir(shadowProject);
  mkdirSync(shadowProject, { recursive: true });
  try {
    createJunction(join(unityProject, "Assets"), join(shadowProject, "Assets"));
    createJunction(join(unityProject, "Packages"), join(shadowProject, "Packages"));
    createJunction(join(unityProject, "ProjectSettings"), join(shadowProject, "ProjectSettings"));
    runUnityExport(shadowProject);
  } finally {
    safeRemoveDir(shadowProject);
  }
}

function createJunction(target, link) {
  assertDirectory(target, "junction target");
  symlinkSync(target, link, "junction");
}

function exportTilesFromYaml() {
  directExportWarnings = [];
  const assetsRoot = join(unityProject, "Assets");
  const customTileRootPath = join(unityProject, ...customTileRoot.split(/[\\/]+/));
  assertDirectory(customTileRootPath, "CustomTile root");

  const guidMap = buildGuidMap(assetsRoot);
  const customTilePaths = listFiles(customTileRootPath, ".asset").filter((assetPath) =>
    readFileSync(assetPath, "utf8").includes(customTileScriptGuid),
  );
  const cropTasks = [];
  const spritesRoot = join(exportDir, "sprites");
  mkdirSync(spritesRoot, { recursive: true });

  const tiles = customTilePaths
    .sort((a, b) => unityAssetPath(a).localeCompare(unityAssetPath(b)))
    .map((assetPath) => buildTileRecordFromYaml(assetPath, guidMap, spritesRoot, cropTasks));

  runCropTasks(cropTasks);

  const generatedAtUtc = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    success: true,
    generatedAtUtc,
    unityVersion: "direct-yaml",
    targetDirectory: exportDir,
    totalCustomTiles: customTilePaths.length,
    exportedTiles: tiles.length,
    criticalErrorCount: 0,
    warningCount: directExportWarnings.length,
    durationSeconds: 0,
    errors: [],
    warnings: directExportWarnings,
  };
  const index = {
    schemaVersion: 1,
    generatedAtUtc,
    unityVersion: "direct-yaml",
    projectName: "AbyaPB",
    exportFormat: "PNG+JSON",
    isComplete: true,
    blockingErrors: [],
    layerRenderOrder: [
      "Background",
      "RearDecoration",
      "World",
      "FrontDecoration",
      "Function",
      "TrackNode",
      "Track",
      "Entity",
    ],
    tiles,
  };

  assertNoPlaceholderIconSprites(tiles);
  writeJson(join(exportDir, "export_report.json"), report);
  writeJson(join(exportDir, "tile_index.json"), index);
  return { report, index };
}

function buildTileRecordFromYaml(assetPath, guidMap, spritesRoot, cropTasks) {
  const raw = readFileSync(assetPath, "utf8");
  const asset = unityAssetPath(assetPath);
  const tileName = readYamlValue(raw, "TileName") || readYamlValue(raw, "m_Name");
  const folderName = `${safeFileName(tileName)}_${hash(asset, 8)}`;
  const tileFolder = join(spritesRoot, folderName);
  mkdirSync(tileFolder, { recursive: true });

  const tileBaseRef = readUnityRef(raw, "TileBase");
  if (!tileBaseRef) {
    throw new Error(`CustomTile has no TileBase: ${asset}`);
  }

  const tileBasePath = guidMap.get(tileBaseRef.guid);
  if (!tileBasePath) {
    throw new Error(`TileBase guid not found for ${tileName}: ${tileBaseRef.guid}`);
  }

  const tileBase = parseTileBase(tileBasePath);
  const record = {
    tileName,
    namespace: readYamlValue(raw, "NameSpace") || "",
    assetPath: asset,
    tileBaseAssetPath: unityAssetPath(tileBasePath),
    tileBaseType: tileBase.type,
    tileBaseClass: tileBase.type,
    preferredLayer: layerName(readYamlInteger(raw, "PreferredTileLayer")),
    allowedLayers: readTileLayerList(raw),
    notAllowSpawnPrefabLayers: [],
    onlyPlot: readYamlBool(raw, "OnlyPlot"),
    isRuleTile: readYamlBool(raw, "IsRuleTile") || tileBase.type === "RuleTile",
    allowLinkTrackNode: readYamlBool(raw, "AllowLinkTrackNode"),
    size: { x: 0, y: 0 },
    pivot: readPivot(raw),
    defaultSprite: null,
    tile: null,
    animated: null,
    rule: null,
  };

  record.size = {
    x: record.pivot.left + record.pivot.right + 1,
    y: record.pivot.up + record.pivot.down + 1,
  };

  if (tileBase.type === "AnimatedTile") {
    const frames = tileBase.frames.map((spriteRef, index) =>
      exportSpriteFromRef(spriteRef, guidMap, tileFolder, `animated_${String(index).padStart(3, "0")}`, cropTasks),
    );
    record.animated = {
      minSpeed: tileBase.minSpeed,
      maxSpeed: tileBase.maxSpeed,
      animationStartTime: tileBase.animationStartTime,
      animationStartFrame: tileBase.animationStartFrame,
      colliderType: "",
      staticFrameIndex: 0,
      frames,
    };
    record.defaultSprite = frames[0] || null;
  } else if (tileBase.type === "RuleTile") {
    const defaultSprite = exportSpriteFromRef(tileBase.defaultSprite, guidMap, tileFolder, "rule_default", cropTasks);
    record.rule = {
      defaultSprite,
      defaultColliderType: "",
      neighborType: "",
      rotationAngle: 0,
      rotationCount: 0,
      rules: [],
    };
    record.defaultSprite = defaultSprite;
  } else {
    const sprite = exportSpriteFromRef(tileBase.sprite, guidMap, tileFolder, "tile", cropTasks);
    record.tile = {
      sprite,
      color: null,
      transform: null,
      colliderType: "",
      tileFlags: "",
    };
    record.defaultSprite = sprite;
  }

  return record;
}

function parseTileBase(tileBasePath) {
  const raw = readFileSync(tileBasePath, "utf8");
  if (raw.includes("m_AnimatedSprites:")) {
    const section = raw.match(/m_AnimatedSprites:\s*([\s\S]*?)(?:\n  m_MinSpeed:|\n  [A-Za-z_]+:|$)/)?.[1] || "";
    const frames = [...section.matchAll(/- \{fileID: ([^,]+), guid: ([0-9a-f]+), type: \d+\}/gi)].map((match) => ({
      fileID: match[1],
      guid: match[2],
    }));
    return {
      type: "AnimatedTile",
      frames,
      minSpeed: readYamlNumber(raw, "m_MinSpeed") || 8,
      maxSpeed: readYamlNumber(raw, "m_MaxSpeed") || 8,
      animationStartTime: readYamlNumber(raw, "m_AnimationStartTime") || 0,
      animationStartFrame: readYamlInteger(raw, "m_AnimationStartFrame"),
    };
  }

  const defaultSprite = readUnityRef(raw, "m_DefaultSprite");
  if (defaultSprite) {
    return {
      type: "RuleTile",
      defaultSprite,
    };
  }

  const sprite = readUnityRef(raw, "m_Sprite");
  if (!sprite) {
    throw new Error(`TileBase has no supported sprite field: ${unityAssetPath(tileBasePath)}`);
  }
  return {
    type: "Tile",
    sprite,
  };
}

function exportSpriteFromRef(spriteRef, guidMap, tileFolder, fileBaseName, cropTasks) {
  if (!spriteRef) {
    throw new Error(`Missing sprite reference for ${tileFolder}`);
  }
  let texturePath = guidMap.get(spriteRef.guid);
  let missingSource = false;
  if (!texturePath) {
    missingSource = true;
    texturePath = join(unityProject, "Assets", "Textures", "Tile", "UnknowTile.png");
    directExportWarnings.push(`Sprite texture guid not found, using UnknowTile: ${spriteRef.guid}`);
  }
  const metaPath = `${texturePath}.meta`;
  assertFile(metaPath, "texture meta");
  const meta = readFileSync(metaPath, "utf8");
  const rect = missingSource ? null : readSpriteRect(meta, spriteRef.fileID);
  const fileName = `${safeFileName(fileBaseName)}.png`;
  const dest = join(tileFolder, fileName);
  cropTasks.push({ source: texturePath, dest, rect });
  return {
    id: fileBaseName,
    path: `sprites/${basename(tileFolder)}/${fileName}`,
    width: rect?.width || 0,
    height: rect?.height || 0,
    pixelsPerUnit: readYamlNumber(meta, "spritePixelsToUnits") || 16,
    sourceAssetPath: unityAssetPath(texturePath),
    sourceTexturePath: unityAssetPath(texturePath),
    sourceSpriteName: missingSource ? "UnknowTile" : "",
  };
}

function readSpriteRect(meta, fileID) {
  const spriteBlocks = [
    ...meta.matchAll(/\n    - serializedVersion: 2([\s\S]*?)(?=\n    - serializedVersion: 2|\n    outline:|\n    physicsShape:|\n    bones:|\n    spriteID:|$)/g),
  ];
  for (const blockMatch of spriteBlocks) {
    const block = blockMatch[1];
    const internalID = block.match(/\n      internalID: (-?\d+)/)?.[1];
    if (internalID !== String(fileID)) continue;
    return {
      x: integer(block.match(/\n        x: (-?\d+(?:\.\d+)?)/)?.[1]),
      y: integer(block.match(/\n        y: (-?\d+(?:\.\d+)?)/)?.[1]),
      width: integer(block.match(/\n        width: (-?\d+(?:\.\d+)?)/)?.[1]),
      height: integer(block.match(/\n        height: (-?\d+(?:\.\d+)?)/)?.[1]),
    };
  }

  return null;
}

function runCropTasks(cropTasks) {
  if (cropTasks.length === 0) return;
  const tasksPath = join(exportDir, "crop-tasks.json");
  const psPath = join(exportDir, "crop-sprites.ps1");
  writeJson(tasksPath, cropTasks);
  writeFileSync(
    psPath,
    [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.Drawing",
      "$tasks = Get-Content -LiteralPath $args[0] -Raw -Encoding UTF8 | ConvertFrom-Json",
      "foreach ($task in $tasks) {",
      "  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $task.dest) | Out-Null",
      "  $image = [System.Drawing.Bitmap]::FromFile($task.source)",
      "  try {",
      "    if ($null -ne $task.rect -and $task.rect.width -gt 0 -and $task.rect.height -gt 0) {",
      "      $x = [int][Math]::Round([double]$task.rect.x)",
      "      $y = [int][Math]::Round([double]$task.rect.y)",
      "      $w = [int][Math]::Round([double]$task.rect.width)",
      "      $h = [int][Math]::Round([double]$task.rect.height)",
      "      $top = $image.Height - $y - $h",
      "      $rect = New-Object System.Drawing.Rectangle($x, $top, $w, $h)",
      "      $copy = $image.Clone($rect, $image.PixelFormat)",
      "    } else {",
      "      $copy = New-Object System.Drawing.Bitmap($image)",
      "    }",
      "    try { $copy.Save($task.dest, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $copy.Dispose() }",
      "  } finally { $image.Dispose() }",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath, tasksPath], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Sprite crop failed with code ${result.status ?? "unknown"}.`);
  }
}

function ensureTileTemplateGroups() {
  const templateDir = join(libraryDir, "templates", "tile");
  const templatePath = join(templateDir, "template.json");
  const zhPath = join(templateDir, "zh.json");
  assertFile(templatePath, "tile template.json");
  assertFile(zhPath, "tile zh.json");

  const template = readJson(templatePath);
  template.groupOptions = layers.map(([id, label]) => ({
    id,
    label,
    translations: { zh: label },
  }));
  template.updatedAt = new Date().toISOString();

  writeJson(templatePath, template);
  return template;
}

function rebuildTileEntries(template, tiles, report) {
  const entriesRoot = join(libraryDir, "entries");
  const entriesDir = join(entriesRoot, "tile");
  assertInside(entriesDir, libraryDir);
  rmSync(entriesDir, { recursive: true, force: true });
  mkdirSync(entriesDir, { recursive: true });

  const now = new Date().toISOString();
  const seenIds = new Set();
  for (const tile of tiles) {
    const entryId = uniqueEntryId(tile, seenIds);
    const entryDir = join(entriesDir, entryId);
    const iconDir = join(entryDir, "assets", "Icon");
    mkdirSync(iconDir, { recursive: true });

    const icon = copyIconFrames(tile, entryId, iconDir);
    const groupIds = validLayers(tile.allowedLayers);
    const entry = {
      id: entryId,
      templateId: template.id || "tile",
      groupIds,
      createdAt: now,
      updatedAt: now,
    };
    const zh = {
      title: tile.tileName || "",
      values: {
        Namespace: tile.namespace || "",
        name: tile.tileName || "",
        DisplayName: tile.tileName || "",
        TileDescription: "",
        Icon: icon,
        Size: normalizePivot(tile.pivot),
        IsRuleTile: Boolean(tile.isRuleTile || tile.tileBaseType === "RuleTile"),
        AllowLinkTrackNode: Boolean(tile.allowLinkTrackNode),
        PreferredTileLayer: layerIds.has(tile.preferredLayer) ? tile.preferredLayer : "",
        TileLayers: groupIds,
      },
    };

    writeJson(join(entryDir, "entry.json"), entry);
    writeJson(join(entryDir, "zh.json"), zh);
  }

  validateEntries(entriesDir, tiles, report);
  return { entries: tiles.length, entriesDir };
}

function copyIconFrames(tile, entryId, iconDir) {
  const selection = selectIconSprites(tile);
  const framePaths = selection.sprites.map((sprite, index) => {
    const source = resolveExportPath(sprite.path);
    assertFile(source, `sprite for ${tile.tileName}`);
    const sourceName = basename(sprite.path || `frame-${index}.png`);
    const destName = `${String(index).padStart(3, "0")}-${safeFileName(sourceName)}`;
    const dest = join(iconDir, destName);
    copyFileSync(source, dest);
    return `entries/tile/${entryId}/assets/Icon/${destName}`;
  });

  return {
    mode: selection.mode,
    frames: framePaths,
    fps: selection.fps,
    loop: true,
    sampling: "point",
    compression: "none",
  };
}

function selectIconSprites(tile) {
  if (tile.tileBaseType === "AnimatedTile" && tile.animated?.frames?.length) {
    return {
      mode: "sequence",
      sprites: tile.animated.frames,
      fps: averageFps(tile.animated.minSpeed, tile.animated.maxSpeed),
    };
  }

  const sprite =
    tile.tile?.sprite ||
    tile.rule?.defaultSprite ||
    tile.defaultSprite ||
    tile.animated?.frames?.[0];
  if (!sprite) {
    throw new Error(`Tile has no exportable icon sprite: ${tile.tileName}`);
  }

  return {
    mode: "single",
    sprites: [sprite],
    fps: 8,
  };
}

function assertNoPlaceholderIconSprites(tiles) {
  const placeholders = [];
  for (const tile of tiles) {
    const selection = selectIconSprites(tile);
    for (const sprite of selection.sprites) {
      const source = resolveExportPath(sprite.path);
      const stats = readPngStats(source);
      if (stats?.isUnityBatchPlaceholderGray) {
        placeholders.push(`${tile.tileName}: ${sprite.path}`);
        if (placeholders.length >= 12) break;
      }
    }
    if (placeholders.length >= 12) break;
  }

  if (placeholders.length > 0) {
    throw new Error(
      [
        "Unity exported placeholder-gray tile icons instead of real pixels.",
        ...placeholders.map((item) => `- ${item}`),
      ].join("\n"),
    );
  }
}

function readPngStats(path) {
  const bytes = readFileSync(path);
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || interlace !== 0 || width <= 0 || height <= 0 || idat.length === 0) {
    return null;
  }

  const channels = pngChannels(colorType);
  if (!channels) return null;

  const inflated = inflateSync(Buffer.concat(idat));
  const rowBytes = width * channels;
  const pixels = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  let targetOffset = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++];
    for (let x = 0; x < rowBytes; x++) {
      const raw = inflated[sourceOffset++];
      const left = x >= channels ? pixels[targetOffset + x - channels] : 0;
      const up = y > 0 ? pixels[targetOffset + x - rowBytes] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[targetOffset + x - rowBytes - channels] : 0;
      pixels[targetOffset + x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
    targetOffset += rowBytes;
  }

  const unique = new Set();
  for (let i = 0; i < width * height; i++) {
    const color = pngPixelRgba(pixels, i, colorType, palette, transparency);
    if (!color) return null;
    unique.add(color.join(","));
    if (unique.size > 1) break;
  }

  const onlyColor = unique.size === 1 ? [...unique][0].split(",").map(Number) : null;
  return {
    width,
    height,
    uniqueColors: unique.size,
    isUnityBatchPlaceholderGray:
      Boolean(onlyColor) &&
      onlyColor[0] === 205 &&
      onlyColor[1] === 205 &&
      onlyColor[2] === 205 &&
      onlyColor[3] === 205,
  };
}

function pngChannels(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 3) return 1;
  if (colorType === 6) return 4;
  return 0;
}

function pngPixelRgba(pixels, index, colorType, palette, transparency) {
  if (colorType === 6) {
    const offset = index * 4;
    return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
  }
  if (colorType === 2) {
    const offset = index * 3;
    return [pixels[offset], pixels[offset + 1], pixels[offset + 2], 255];
  }
  if (colorType === 0) {
    const value = pixels[index];
    return [value, value, value, 255];
  }
  if (colorType === 3 && palette) {
    const paletteIndex = pixels[index];
    const offset = paletteIndex * 3;
    if (offset + 2 >= palette.length) return null;
    return [
      palette[offset],
      palette[offset + 1],
      palette[offset + 2],
      transparency && paletteIndex < transparency.length ? transparency[paletteIndex] : 255,
    ];
  }
  return null;
}

function unfilterPngByte(filter, raw, left, up, upLeft) {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function validateEntries(entriesDir, tiles, report) {
  const folders = readdirSync(entriesDir, { withFileTypes: true }).filter((item) =>
    item.isDirectory(),
  );
  if (folders.length !== tiles.length) {
    throw new Error(`Entry count mismatch: folders=${folders.length}, tiles=${tiles.length}.`);
  }
  if (report.exportedTiles !== report.totalCustomTiles) {
    throw new Error(`Not every CustomTile was exported: ${report.exportedTiles}/${report.totalCustomTiles}.`);
  }

  for (const folder of folders) {
    const entryDir = join(entriesDir, folder.name);
    assertFile(join(entryDir, "entry.json"), "entry.json");
    const zhPath = join(entryDir, "zh.json");
    assertFile(zhPath, "zh.json");
    const zh = readJson(zhPath);
    const icon = zh.values?.Icon;
    if (!icon || !Array.isArray(icon.frames) || icon.frames.length === 0) {
      throw new Error(`Entry has no icon frames: ${folder.name}`);
    }
    if (icon.mode === "sequence" && icon.frames.length < 2) {
      throw new Error(`Sequence icon has fewer than two frames: ${folder.name}`);
    }
    for (const frame of icon.frames) {
      const framePath = join(libraryDir, frame);
      assertFile(framePath, `entry icon frame ${frame}`);
      const stats = readPngStats(framePath);
      if (stats?.isUnityBatchPlaceholderGray) {
        throw new Error(`Entry icon is placeholder gray instead of real pixels: ${frame}`);
      }
    }
  }
}

function validLayers(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => layerIds.has(value)))];
}

function buildGuidMap(assetsRoot) {
  const map = new Map();
  for (const metaPath of listFiles(assetsRoot, ".meta")) {
    const text = readFileSync(metaPath, "utf8");
    const guid = text.match(/^guid: ([0-9a-f]+)/m)?.[1];
    if (!guid) continue;
    const assetPath = metaPath.slice(0, -".meta".length);
    map.set(guid, assetPath);
  }
  return map;
}

function listFiles(dir, suffix) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(path, suffix));
    } else if (entry.isFile() && path.endsWith(suffix)) {
      result.push(path);
    }
  }
  return result;
}

function unityAssetPath(path) {
  const normalizedProject = resolve(unityProject).replace(/\\/g, "/");
  const normalizedPath = resolve(path).replace(/\\/g, "/");
  if (normalizedPath.startsWith(`${normalizedProject}/`)) {
    return normalizedPath.slice(normalizedProject.length + 1);
  }
  return normalizedPath;
}

function readYamlValue(text, key) {
  const match = text.match(new RegExp(`^  ${escapeRegExp(key)}: ?(.*)$`, "m"));
  if (!match) return "";
  return decodeYamlScalar(match[1]);
}

function readYamlBool(text, key) {
  return readYamlInteger(text, key) === 1;
}

function readYamlInteger(text, key) {
  return integer(readYamlValue(text, key));
}

function readYamlNumber(text, key) {
  const value = Number(readYamlValue(text, key));
  return Number.isFinite(value) ? value : 0;
}

function readUnityRef(text, key) {
  const match = text.match(
    new RegExp(`^  ${escapeRegExp(key)}: \\{fileID: ([^,]+), guid: ([0-9a-f]+), type: \\d+\\}`, "m"),
  );
  if (!match || match[2] === "00000000000000000000000000000000") return null;
  return {
    fileID: match[1],
    guid: match[2],
  };
}

function readTileLayerList(text) {
  const raw = readYamlValue(text, "TileLayers").replace(/\s+/g, "");
  if (!raw) return [];
  const values = [];
  for (let i = 0; i + 8 <= raw.length; i += 8) {
    const chunk = raw.slice(i, i + 8);
    const value = Number.parseInt(
      `${chunk.slice(6, 8)}${chunk.slice(4, 6)}${chunk.slice(2, 4)}${chunk.slice(0, 2)}`,
      16,
    );
    const layer = layerName(value);
    if (layer) values.push(layer);
  }
  return validLayers(values);
}

function readPivot(text) {
  const block = text.match(/\n  TilePivot:\s*([\s\S]*?)(?=\n  \S|$)/)?.[1] || "";
  return {
    left: integer(block.match(/\n    left: (-?\d+)/)?.[1]),
    right: integer(block.match(/\n    right: (-?\d+)/)?.[1]),
    up: integer(block.match(/\n    up: (-?\d+)/)?.[1]),
    down: integer(block.match(/\n    down: (-?\d+)/)?.[1]),
  };
}

function layerName(value) {
  return layers[value]?.[0] || "";
}

function decodeYamlScalar(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function normalizePivot(pivot) {
  return {
    up: integer(pivot?.up),
    right: integer(pivot?.right),
    down: integer(pivot?.down),
    left: integer(pivot?.left),
  };
}

function averageFps(minSpeed, maxSpeed) {
  const min = Number(minSpeed);
  const max = Number(maxSpeed);
  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    return Math.max(1, Math.round(((min + max) / 2) * 100) / 100);
  }
  if (Number.isFinite(min) && min > 0) return min;
  if (Number.isFinite(max) && max > 0) return max;
  return 8;
}

function uniqueEntryId(tile, seenIds) {
  const seed = tile.assetPath || tile.tileName || Math.random().toString(36);
  const base = safeFileName(tile.tileName || "tile").slice(0, 72) || "tile";
  let id = `tile-${base}-${hash(seed, 8)}`;
  let index = 2;
  while (seenIds.has(id)) {
    id = `tile-${base}-${hash(`${seed}-${index}`, 8)}`;
    index++;
  }
  seenIds.add(id);
  return id;
}

function resolveExportPath(relativePath) {
  const fullPath = resolve(exportDir, ...String(relativePath || "").split(/[\\/]+/));
  assertInside(fullPath, exportDir);
  return fullPath;
}

function assertInside(target, parent) {
  const resolvedTarget = resolve(target).toLowerCase();
  const resolvedParent = resolve(parent).toLowerCase();
  if (
    resolvedTarget !== resolvedParent &&
    !resolvedTarget.startsWith(`${resolvedParent}\\`) &&
    !resolvedTarget.startsWith(`${resolvedParent}/`)
  ) {
    throw new Error(`Refusing to operate outside ${parent}: ${target}`);
  }
}

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} not found: ${path}`);
  }
}

function safeRemoveDir(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`Could not remove temporary directory: ${path}`);
    console.warn(String(error?.message || error));
  }
}

function assertDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} not found: ${path}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeFileName(value) {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return cleaned || "tile";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hash(value, length) {
  return createHash("sha1").update(String(value)).digest("hex").slice(0, length);
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}
