export type ReadStatus = 'unread' | 'read';

/** Metadata stored in hidden .folio-meta.json keyed by relative PDF path */
export interface PaperMetaRecord {
  shortName?: string;
  title?: string;
  authors?: string[];
  team?: string;
  year?: number | null;
  venue?: string;
  tags: string[];
  status: ReadStatus;
  takeaway: string;
  arxivId?: string;
  doi?: string;
  url?: string;
  metaFetched?: boolean;
  metaVersion?: number;
  readAt?: string | null;
  updatedAt?: string;
}

/** A real PDF file on disk combined with its Folio metadata */
export interface PdfPaper {
  /** Relative POSIX path from rootDir (e.g. "LLM/2305.18290.pdf" or "paper.pdf") */
  relPath: string;
  /** Full absolute path on disk */
  absPath: string;
  /** File name on disk (e.g. "2305.18290.pdf") */
  fileName: string;
  /** Relative folder path ("" for root, or "LLM", "LLM/Alignment") */
  folderRelPath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modified timestamp (ms) */
  mtimeMs: number;
  /** Short alias / acronym (e.g. "ACON", "FoldGRPO", "SE-Agent") */
  shortName: string;
  /** Display title (full paper title auto-extracted or user-edited) */
  title: string;
  authors: string[];
  /** Research team / lab / institution (e.g. "ByteDance Seed", "Tsinghua", "Qwen") */
  team: string;
  year: number | null;
  venue: string;
  tags: string[];
  status: ReadStatus;
  takeaway: string;
  arxivId?: string;
  doi?: string;
  url?: string;
  metaFetched: boolean;
  readAt: string | null;
}

export interface FolderNode {
  /** Relative POSIX path from rootDir (e.g. "LLM" or "LLM/Agents") */
  relPath: string;
  name: string;
  parentRelPath: string;
  /** Direct + nested PDF count */
  pdfCount: number;
}

export interface WorkspaceSnapshot {
  rootPath: string;
  folders: FolderNode[];
  papers: PdfPaper[];
}

export interface LlmConfig {
  enabled: boolean;
  apiBase: string;
  apiKey: string;
  model: string;
  bibtexPrompt: string;
  envPath: string;
}

export interface MetadataLookupResult {
  shortName?: string;
  title?: string;
  authors?: string[];
  team?: string;
  year?: number | null;
  venue?: string;
  arxivId?: string;
  doi?: string;
  url?: string;
  source: 'arxiv' | 'crossref' | 'pdf' | 'filename' | 'llm';
}

export interface FolioAPI {
  loadWorkspace: () => Promise<WorkspaceSnapshot>;
  chooseRootFolder: () => Promise<WorkspaceSnapshot | null>;
  openRootFolder: () => Promise<void>;
  openFolderInFinder: (folderRelPath: string) => Promise<void>;
  createFolder: (parentRelPath: string, name: string) => Promise<WorkspaceSnapshot>;
  renameFolder: (folderRelPath: string, newName: string) => Promise<{ newRelPath: string; workspace: WorkspaceSnapshot }>;
  deleteFolder: (folderRelPath: string) => Promise<WorkspaceSnapshot>;
  showFolderContextMenu: (folderRelPath: string) => Promise<string | null>;
  showPaperContextMenu: (relPath: string, isRead: boolean) => Promise<string | null>;
  importPdfsDialog: (targetFolderRelPath: string) => Promise<{ imported: string[]; workspace: WorkspaceSnapshot }>;
  importPdfPaths: (filePaths: string[], targetFolderRelPath: string) => Promise<{ imported: string[]; workspace: WorkspaceSnapshot }>;
  updatePaperMeta: (relPath: string, patch: Partial<PaperMetaRecord>) => Promise<WorkspaceSnapshot>;
  movePaper: (relPath: string, targetFolderRelPath: string) => Promise<{ newRelPath: string; workspace: WorkspaceSnapshot }>;
  renamePaperFile: (relPath: string, newBaseName: string) => Promise<{ newRelPath: string; workspace: WorkspaceSnapshot }>;
  trashPaper: (relPath: string) => Promise<WorkspaceSnapshot>;
  openPdf: (relPath: string) => Promise<{ ok: boolean; error?: string }>;
  revealPdf: (relPath: string) => Promise<{ ok: boolean; error?: string }>;
  enrichPaperMeta: (relPath: string) => Promise<WorkspaceSnapshot>;
  enrichPaperWithLlm: (relPath: string) => Promise<WorkspaceSnapshot>;
  enrichAllPapers: () => Promise<WorkspaceSnapshot>;
  enrichIncompleteWithLlm: (relPaths: string[]) => Promise<{ processed: number; workspace: WorkspaceSnapshot }>;
  lookupMetadata: (query: string) => Promise<MetadataLookupResult | null>;
  getLlmConfig: () => Promise<LlmConfig>;
  saveLlmConfig: (input: Pick<LlmConfig, 'enabled' | 'apiBase' | 'apiKey' | 'model' | 'bibtexPrompt'>) => Promise<LlmConfig>;
  importEnvFile: () => Promise<LlmConfig | null>;
  revealEnvFile: () => Promise<void>;
  testLlmConnection: (input: Pick<LlmConfig, 'apiBase' | 'apiKey' | 'model'>) => Promise<{ ok: boolean; message: string }>;
  reviewBibtexWithLlm: (bibtex: string, customPrompt?: string, paperRelPaths?: string[]) => Promise<{ bibtex: string; notes: string[] }>;
  saveTextFile: (defaultFileName: string, content: string, ext: string) => Promise<{ ok: boolean; filePath?: string }>;
  getPathForFile: (file: File) => string;
  onWorkspaceChanged: (callback: (snapshot: WorkspaceSnapshot) => void) => () => void;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    folio: FolioAPI;
  }
}
