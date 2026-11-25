import { app, shell } from 'electron';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import type {
  FolderNode,
  PaperMetaRecord,
  PdfPaper,
  WorkspaceSnapshot,
} from '../src/types';
import { extractMetadataWithLlm, loadLlmConfig } from './llm';
import { extractMetadataFromPdf, extractPage1TextForLlm, inferShortName } from './metadata';

interface AppConfig {
  rootPath?: string;
}

interface MetaStore {
  version: number;
  papers: Record<string, PaperMetaRecord>;
}

const META_FILE_NAME = '.folio-meta.json';
const CURRENT_META_VERSION = 3;
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_ROOT_DIR = () => path.join(app.getPath('documents'), 'Papers');

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function fromPosix(p: string): string {
  return p.split('/').join(path.sep);
}

function cleanFileNameToTitle(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function getRootPath(): Promise<string> {
  const candidates = [
    CONFIG_FILE(),
    path.join(app.getPath('appData'), 'folio-paper-manager', 'config.json'),
    path.join(app.getPath('appData'), 'Folio', 'config.json'),
  ];
  for (const cfgPath of candidates) {
    try {
      const raw = await fs.readFile(cfgPath, 'utf8');
      const cfg = JSON.parse(raw) as AppConfig;
      if (cfg.rootPath) return cfg.rootPath;
    } catch {
      // try next
    }
  }
  return DEFAULT_ROOT_DIR();
}

export async function setRootPath(newPath: string): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_FILE()), { recursive: true });
  await fs.writeFile(CONFIG_FILE(), JSON.stringify({ rootPath: newPath }, null, 2), 'utf8');
}

async function ensureRootExists(rootPath: string): Promise<void> {
  await fs.mkdir(rootPath, { recursive: true });
}

async function loadMetaStore(rootPath: string): Promise<MetaStore> {
  const metaPath = path.join(rootPath, META_FILE_NAME);
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as MetaStore;
    return {
      version: parsed.version ?? 1,
      papers: parsed.papers && typeof parsed.papers === 'object' ? parsed.papers : {},
    };
  } catch {
    return { version: 1, papers: {} };
  }
}

async function saveMetaStore(rootPath: string, store: MetaStore): Promise<void> {
  const metaPath = path.join(rootPath, META_FILE_NAME);
  await fs.writeFile(metaPath, JSON.stringify(store, null, 2), 'utf8');
}

function defaultMetaRecord(): PaperMetaRecord {
  return {
    tags: [],
    status: 'unread',
    takeaway: '',
    metaFetched: false,
    readAt: null,
  };
}

// Track in-flight background metadata extractions so we never duplicate work
const enrichingSet = new Set<string>();
let onEnrichCallback: ((snapshot: WorkspaceSnapshot) => void) | null = null;

export function setOnEnrichCallback(cb: (snapshot: WorkspaceSnapshot) => void) {
  onEnrichCallback = cb;
}

async function backgroundEnrich(rootPath: string, relPaths: string[], forceOverwrite = false) {
  const toProcess = relPaths.filter((p) => !enrichingSet.has(`${rootPath}::${p}`));
  if (toProcess.length === 0) return;

  for (const relPath of toProcess) {
    enrichingSet.add(`${rootPath}::${relPath}`);
  }

  let changed = false;
  try {
    // Process sequentially in batches to be polite to arXiv / Crossref APIs
    for (const relPath of toProcess.slice(0, 25)) {
      const absPath = path.join(rootPath, fromPosix(relPath));
      if (!(await exists(absPath))) continue;
      try {
        const extracted = await extractMetadataFromPdf(absPath);
        const store = await loadMetaStore(rootPath);
        const prev = store.papers[relPath] ?? defaultMetaRecord();
        const isUpgradingV1 = (prev.metaVersion ?? 1) < CURRENT_META_VERSION;
        const shouldUseExtractedTitle =
          Boolean(extracted.title) &&
          (forceOverwrite ||
            !prev.title ||
            (isUpgradingV1 && extracted.source !== 'filename'));

        store.papers[relPath] = {
          ...prev,
          shortName: prev.shortName !== undefined ? prev.shortName : extracted.shortName || '',
          title: shouldUseExtractedTitle ? extracted.title : prev.title || extracted.title,
          authors:
            extracted.authors && extracted.authors.length > 0 && (forceOverwrite || isUpgradingV1 || !prev.authors?.length)
              ? extracted.authors
              : prev.authors,
          team: prev.team || extracted.team || '',
          year: extracted.year ?? prev.year ?? null,
          venue: prev.venue || extracted.venue || '',
          arxivId: prev.arxivId || extracted.arxivId,
          doi: prev.doi || extracted.doi,
          url: prev.url || extracted.url,
          metaFetched: true,
          metaVersion: CURRENT_META_VERSION,
          updatedAt: new Date().toISOString(),
        };
        await saveMetaStore(rootPath, store);
        changed = true;
      } catch {
        const store = await loadMetaStore(rootPath);
        const prev = store.papers[relPath] ?? defaultMetaRecord();
        store.papers[relPath] = {
          ...prev,
          metaFetched: true,
          metaVersion: CURRENT_META_VERSION,
        };
        await saveMetaStore(rootPath, store);
      }
    }
  } finally {
    for (const relPath of toProcess) {
      enrichingSet.delete(`${rootPath}::${relPath}`);
    }
  }

  if (changed && onEnrichCallback) {
    const snap = await scanWorkspace(false);
    onEnrichCallback(snap);
  }
}

export async function scanWorkspace(triggerEnrich = true): Promise<WorkspaceSnapshot> {
  const rootPath = await getRootPath();
  await ensureRootExists(rootPath);
  const store = await loadMetaStore(rootPath);

  const folders: FolderNode[] = [];
  const papers: PdfPaper[] = [];
  const unenriched: string[] = [];

  async function walk(currentAbs: string, currentRel: string) {
    let entries;
    try {
      entries = await fs.readdir(currentAbs, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    for (const entry of entries) {
      // Skip hidden files/folders (.DS_Store, .folio-meta.json, .git, etc.)
      if (entry.name.startsWith('.')) continue;

      const abs = path.join(currentAbs, entry.name);
      const rel = currentRel ? `${currentRel}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        folders.push({
          relPath: rel,
          name: entry.name,
          parentRelPath: currentRel,
          pdfCount: 0,
        });
        await walk(abs, rel);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        let stat;
        try {
          stat = await fs.stat(abs);
        } catch {
          continue;
        }
        const meta = store.papers[rel];
        if (!meta || !meta.metaFetched || (meta.metaVersion ?? 1) < CURRENT_META_VERSION) {
          unenriched.push(rel);
        }

        const resolvedTitle = meta?.title?.trim() || cleanFileNameToTitle(entry.name);
        const resolvedShortName =
          meta?.shortName !== undefined
            ? meta.shortName.trim()
            : inferShortName(resolvedTitle, entry.name);

        papers.push({
          relPath: rel,
          absPath: abs,
          fileName: entry.name,
          folderRelPath: currentRel,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
          shortName: resolvedShortName,
          title: resolvedTitle,
          authors: meta?.authors ?? [],
          team: meta?.team?.trim() || '',
          year: meta?.year ?? null,
          venue: meta?.venue ?? '',
          tags: meta?.tags ?? [],
          status: meta?.status ?? 'unread',
          takeaway: meta?.takeaway ?? '',
          arxivId: meta?.arxivId,
          doi: meta?.doi,
          url: meta?.url,
          metaFetched: Boolean(meta?.metaFetched),
          readAt: meta?.readAt ?? null,
        });
      }
    }
  }

  await walk(rootPath, '');

  // Compute PDF counts per folder (including nested subfolders)
  for (const folder of folders) {
    const prefix = `${folder.relPath}/`;
    folder.pdfCount = papers.filter(
      (p) => p.folderRelPath === folder.relPath || p.folderRelPath.startsWith(prefix)
    ).length;
  }

  // Sort papers by most recently modified first
  papers.sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (triggerEnrich && unenriched.length > 0) {
    void backgroundEnrich(rootPath, unenriched);
  }

  return { rootPath, folders, papers };
}

export async function createFolder(
  parentRelPath: string,
  name: string
): Promise<WorkspaceSnapshot> {
  const rootPath = await getRootPath();
  const safeName = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
  if (!safeName) return scanWorkspace(false);

  const targetAbs = parentRelPath
    ? path.join(rootPath, fromPosix(parentRelPath), safeName)
    : path.join(rootPath, safeName);

  await fs.mkdir(targetAbs, { recursive: true });
  return scanWorkspace(false);
}

export async function renameFolder(
  folderRelPath: string,
  newName: string
): Promise<{ newRelPath: string; workspace: WorkspaceSnapshot }> {
  const rootPath = await getRootPath();
  const safeName = newName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
  if (!folderRelPath || !safeName) {
    return { newRelPath: folderRelPath, workspace: await scanWorkspace(false) };
  }

  const oldAbs = path.join(rootPath, fromPosix(folderRelPath));
  const parentAbs = path.dirname(oldAbs);
  const newAbs = path.join(parentAbs, safeName);

  if (oldAbs === newAbs || !(await exists(oldAbs)) || (await exists(newAbs))) {
    return { newRelPath: folderRelPath, workspace: await scanWorkspace(false) };
  }

  await fs.rename(oldAbs, newAbs);
  const newRelPath = toPosix(path.relative(rootPath, newAbs));

  // Migrate all nested paper metadata keys seamlessly
  const store = await loadMetaStore(rootPath);
  const oldPrefix = `${folderRelPath}/`;
  const newPrefix = `${newRelPath}/`;
  let migrated = false;
  for (const key of Object.keys(store.papers)) {
    if (key.startsWith(oldPrefix)) {
      const nextKey = `${newPrefix}${key.slice(oldPrefix.length)}`;
      store.papers[nextKey] = store.papers[key];
      delete store.papers[key];
      migrated = true;
    }
  }
  if (migrated) {
    await saveMetaStore(rootPath, store);
  }

  return { newRelPath, workspace: await scanWorkspace(false) };
}

export async function deleteFolder(folderRelPath: string): Promise<WorkspaceSnapshot> {
  const rootPath = await getRootPath();
  if (!folderRelPath) return scanWorkspace(false);
  const absPath = path.join(rootPath, fromPosix(folderRelPath));
  if (await exists(absPath)) {
    await shell.trashItem(absPath);
  }
  return scanWorkspace(false);
}

async function resolveUniquePdfPath(destDir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName) || '.pdf';
  const base = path.basename(fileName, ext);
  let candidate = `${base}${ext}`;
  let i = 1;
  while (await exists(path.join(destDir, candidate))) {
    candidate = `${base}_${i}${ext}`;
    i += 1;
  }
  return path.join(destDir, candidate);
}

export async function importPdfPaths(
  filePaths: string[],
  targetFolderRelPath: string
): Promise<{ imported: string[]; workspace: WorkspaceSnapshot }> {
  const rootPath = await getRootPath();
  const destDir = targetFolderRelPath
    ? path.join(rootPath, fromPosix(targetFolderRelPath))
    : rootPath;
  await fs.mkdir(destDir, { recursive: true });

  const imported: string[] = [];
  for (const src of filePaths) {
    if (!src.toLowerCase().endsWith('.pdf')) continue;
    const resolvedSrc = path.resolve(src);
    const resolvedRoot = path.resolve(rootPath);

    // If file is already inside the exact destination directory, skip copying
    if (path.dirname(resolvedSrc) === path.resolve(destDir)) {
      imported.push(toPosix(path.relative(resolvedRoot, resolvedSrc)));
      continue;
    }

    const destAbs = await resolveUniquePdfPath(destDir, path.basename(src));
    await fs.copyFile(src, destAbs);
    const rel = toPosix(path.relative(resolvedRoot, destAbs));
    imported.push(rel);
  }

  const workspace = await scanWorkspace(true);
  return { imported, workspace };
}

export async function updatePaperMeta(
  relPath: string,
  patch: Partial<PaperMetaRecord>
): Promise<WorkspaceSnapshot> {
  const rootPath = await getRootPath();
  const store = await loadMetaStore(rootPath);
  const prev = store.papers[relPath] ?? defaultMetaRecord();
  const now = new Date().toISOString();

  const nextStatus = patch.status ?? prev.status;
  let nextReadAt = prev.readAt ?? null;
  if (nextStatus === 'read' && !prev.readAt) {
    nextReadAt = now;
  } else if (nextStatus === 'unread') {
    nextReadAt = null;
  }

  store.papers[relPath] = {
    ...prev,
    ...patch,
    status: nextStatus,
    readAt: nextReadAt,
    updatedAt: now,
  };

  await saveMetaStore(rootPath, store);
  return scanWorkspace(false);
}

export async function movePaper(
  relPath: string,
  targetFolderRelPath: string
): Promise<{ newRelPath: string; workspace: WorkspaceSnapshot }> {
  const rootPath = await getRootPath();
  const oldAbs = path.join(rootPath, fromPosix(relPath));
  const destDir = targetFolderRelPath
    ? path.join(rootPath, fromPosix(targetFolderRelPath))
    : rootPath;

  if (path.dirname(oldAbs) === path.resolve(destDir)) {
    return { newRelPath: relPath, workspace: await scanWorkspace(false) };
  }

  await fs.mkdir(destDir, { recursive: true });
  const newAbs = await resolveUniquePdfPath(destDir, path.basename(oldAbs));
  await fs.rename(oldAbs, newAbs);

  const newRelPath = toPosix(path.relative(rootPath, newAbs));

  // Migrate metadata seamlessly
  const store = await loadMetaStore(rootPath);
  if (store.papers[relPath]) {
    store.papers[newRelPath] = store.papers[relPath];
    delete store.papers[relPath];
    await saveMetaStore(rootPath, store);
  }

  return { newRelPath, workspace: await scanWorkspace(false) };
}

export async function renamePaperFile(
  relPath: string,
  newBaseName: string
): Promise<{ newRelPath: string; workspace: WorkspaceSnapshot }> {
  const rootPath = await getRootPath();
  const safeBase = newBaseName
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim();
  if (!safeBase) {
    return { newRelPath: relPath, workspace: await scanWorkspace(false) };
  }

  const oldAbs = path.join(rootPath, fromPosix(relPath));
  const dir = path.dirname(oldAbs);
  const targetAbs = path.join(dir, `${safeBase}.pdf`);

  if (oldAbs === targetAbs) {
    return { newRelPath: relPath, workspace: await scanWorkspace(false) };
  }

  const finalAbs = (await exists(targetAbs))
    ? await resolveUniquePdfPath(dir, `${safeBase}.pdf`)
    : targetAbs;

  await fs.rename(oldAbs, finalAbs);
  const newRelPath = toPosix(path.relative(rootPath, finalAbs));

  const store = await loadMetaStore(rootPath);
  if (store.papers[relPath]) {
    store.papers[newRelPath] = store.papers[relPath];
    delete store.papers[relPath];
    await saveMetaStore(rootPath, store);
  }

  return { newRelPath, workspace: await scanWorkspace(false) };
}

export async function trashPaper(relPath: string): Promise<WorkspaceSnapshot> {
  const rootPath = await getRootPath();
  const absPath = path.join(rootPath, fromPosix(relPath));
  if (await exists(absPath)) {
    await shell.trashItem(absPath);
  }
  const store = await loadMetaStore(rootPath);
  if (store.papers[relPath]) {
    delete store.papers[relPath];
    await saveMetaStore(rootPath, store);
  }
  return scanWorkspace(false);
}

export async function enrichSinglePaper(relPath: string): Promise<WorkspaceSnapshot> {
  const rootPath = await getRootPath();
  const absPath = path.join(rootPath, fromPosix(relPath));
  if (!(await exists(absPath))) return scanWorkspace(false);

  const extracted = await extractMetadataFromPdf(absPath);
  const store = await loadMetaStore(rootPath);
  const prev = store.papers[relPath] ?? defaultMetaRecord();
  store.papers[relPath] = {
    ...prev,
    shortName: prev.shortName || extracted.shortName || '',
    title: extracted.title || prev.title,
    authors: extracted.authors && extracted.authors.length > 0 ? extracted.authors : prev.authors,
    team: prev.team || extracted.team || '',
    year: extracted.year ?? prev.year ?? null,
    venue: extracted.venue || prev.venue || '',
    arxivId: extracted.arxivId || prev.arxivId,
    doi: extracted.doi || prev.doi,
    url: extracted.url || prev.url,
    metaFetched: true,
    metaVersion: CURRENT_META_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await saveMetaStore(rootPath, store);
  return scanWorkspace(false);
}

export async function enrichSinglePaperWithLlm(relPath: string): Promise<WorkspaceSnapshot> {
  const rootPath = await getRootPath();
  const absPath = path.join(rootPath, fromPosix(relPath));
  if (!(await exists(absPath))) return scanWorkspace(false);

  const pageText = await extractPage1TextForLlm(absPath);
  const extracted = await extractMetadataWithLlm(pageText, path.basename(absPath));
  const store = await loadMetaStore(rootPath);
  const prev = store.papers[relPath] ?? defaultMetaRecord();

  store.papers[relPath] = {
    ...prev,
    shortName: extracted.shortName !== undefined ? extracted.shortName : prev.shortName || '',
    title: extracted.title || prev.title,
    authors: extracted.authors && extracted.authors.length > 0 ? extracted.authors : prev.authors,
    team: extracted.team || prev.team || '',
    year: extracted.year ?? prev.year ?? null,
    venue: extracted.venue || prev.venue || '',
    arxivId: extracted.arxivId || prev.arxivId,
    url: extracted.url || prev.url,
    metaFetched: true,
    metaVersion: CURRENT_META_VERSION,
    updatedAt: new Date().toISOString(),
  };

  await saveMetaStore(rootPath, store);
  return scanWorkspace(false);
}

export async function enrichAllPapers(): Promise<WorkspaceSnapshot> {
  const snap = await scanWorkspace(false);
  const allRelPaths = snap.papers.map((p) => p.relPath);
  await backgroundEnrich(snap.rootPath, allRelPaths, true);
  return scanWorkspace(false);
}

export async function enrichIncompleteWithLlm(
  relPaths: string[]
): Promise<{ processed: number; workspace: WorkspaceSnapshot }> {
  const cfg = await loadLlmConfig();
  if (!cfg.enabled) {
    throw new Error('LLM 补全尚未启用，请先在左下角 LLM 配置中开启并保存 .env');
  }
  let processed = 0;
  for (const relPath of relPaths) {
    try {
      await enrichSinglePaperWithLlm(relPath);
      processed += 1;
    } catch (err) {
      console.warn('[Folio] LLM enrich failed for', relPath, err);
    }
  }
  return { processed, workspace: await scanWorkspace(false) };
}

export async function getAbsolutePdfPath(relPath: string): Promise<string | null> {
  const rootPath = await getRootPath();
  const absPath = path.join(rootPath, fromPosix(relPath));
  return (await exists(absPath)) ? absPath : null;
}

// Live filesystem watcher (macOS recursive fs.watch)
let activeWatcher: FSWatcher | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;

export async function startWatchingRoot(onChange: (snapshot: WorkspaceSnapshot) => void) {
  stopWatchingRoot();
  const rootPath = await getRootPath();
  await ensureRootExists(rootPath);

  try {
    activeWatcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      // Ignore our own metadata file & macOS .DS_Store to prevent feedback loops
      const base = path.basename(filename);
      if (base === META_FILE_NAME || base.startsWith('.')) return;

      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(async () => {
        const snap = await scanWorkspace(true);
        onChange(snap);
      }, 350);
    });
  } catch {
    // Graceful fallback if watching fails
  }
}

export function stopWatchingRoot() {
  if (watchDebounce) {
    clearTimeout(watchDebounce);
    watchDebounce = null;
  }
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
}
