import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { FolioAPI, LlmConfig, PaperMetaRecord, WorkspaceSnapshot } from '../src/types';

const api: FolioAPI = {
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  chooseRootFolder: () => ipcRenderer.invoke('workspace:choose-root'),
  openRootFolder: () => ipcRenderer.invoke('workspace:open-root'),
  openFolderInFinder: (folderRelPath: string) =>
    ipcRenderer.invoke('folder:open-finder', folderRelPath),
  createFolder: (parentRelPath: string, name: string) =>
    ipcRenderer.invoke('folder:create', parentRelPath, name),
  renameFolder: (folderRelPath: string, newName: string) =>
    ipcRenderer.invoke('folder:rename', folderRelPath, newName),
  deleteFolder: (folderRelPath: string) =>
    ipcRenderer.invoke('folder:delete', folderRelPath),
  showFolderContextMenu: (folderRelPath: string) =>
    ipcRenderer.invoke('context-menu:folder', folderRelPath),
  showPaperContextMenu: (relPath: string, isRead: boolean) =>
    ipcRenderer.invoke('context-menu:paper', relPath, isRead),
  importPdfsDialog: (targetFolderRelPath: string) =>
    ipcRenderer.invoke('pdf:import-dialog', targetFolderRelPath),
  importPdfPaths: (filePaths: string[], targetFolderRelPath: string) =>
    ipcRenderer.invoke('pdf:import-paths', filePaths, targetFolderRelPath),
  updatePaperMeta: (relPath: string, patch: Partial<PaperMetaRecord>) =>
    ipcRenderer.invoke('pdf:update-meta', relPath, patch),
  movePaper: (relPath: string, targetFolderRelPath: string) =>
    ipcRenderer.invoke('pdf:move', relPath, targetFolderRelPath),
  renamePaperFile: (relPath: string, newBaseName: string) =>
    ipcRenderer.invoke('pdf:rename', relPath, newBaseName),
  trashPaper: (relPath: string) => ipcRenderer.invoke('pdf:trash', relPath),
  openPdf: (relPath: string) => ipcRenderer.invoke('pdf:open', relPath),
  revealPdf: (relPath: string) => ipcRenderer.invoke('pdf:reveal', relPath),
  enrichPaperMeta: (relPath: string) => ipcRenderer.invoke('pdf:enrich', relPath),
  enrichPaperWithLlm: (relPath: string) => ipcRenderer.invoke('pdf:enrich-llm', relPath),
  enrichAllPapers: () => ipcRenderer.invoke('pdf:enrich-all'),
  enrichIncompleteWithLlm: (relPaths: string[]) =>
    ipcRenderer.invoke('pdf:enrich-llm-batch', relPaths),
  lookupMetadata: (query: string) => ipcRenderer.invoke('pdf:lookup', query),
  getLlmConfig: () => ipcRenderer.invoke('llm:get-config'),
  saveLlmConfig: (input: Pick<LlmConfig, 'enabled' | 'apiBase' | 'apiKey' | 'model' | 'bibtexPrompt'>) =>
    ipcRenderer.invoke('llm:save-config', input),
  importEnvFile: () => ipcRenderer.invoke('llm:import-env'),
  revealEnvFile: () => ipcRenderer.invoke('llm:reveal-env'),
  testLlmConnection: (input: Pick<LlmConfig, 'apiBase' | 'apiKey' | 'model'>) =>
    ipcRenderer.invoke('llm:test', input),
  reviewBibtexWithLlm: (bibtex: string, customPrompt?: string, paperRelPaths?: string[]) =>
    ipcRenderer.invoke('llm:review-bibtex', bibtex, customPrompt, paperRelPaths),
  saveTextFile: (defaultFileName: string, content: string, ext: string) =>
    ipcRenderer.invoke('file:save-text', defaultFileName, content, ext),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onWorkspaceChanged: (callback: (snapshot: WorkspaceSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snap: WorkspaceSnapshot) =>
      callback(snap);
    ipcRenderer.on('workspace:changed', handler);
    return () => ipcRenderer.removeListener('workspace:changed', handler);
  },
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
};

contextBridge.exposeInMainWorld('folio', api);
