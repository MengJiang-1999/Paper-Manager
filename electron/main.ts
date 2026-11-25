import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmConfig, PaperMetaRecord, WorkspaceSnapshot } from '../src/types';
import {
  createFolder,
  deleteFolder,
  enrichAllPapers,
  enrichIncompleteWithLlm,
  enrichSinglePaper,
  enrichSinglePaperWithLlm,
  getAbsolutePdfPath,
  getRootPath,
  importPdfPaths,
  movePaper,
  renameFolder,
  renamePaperFile,
  scanWorkspace,
  setOnEnrichCallback,
  setRootPath,
  startWatchingRoot,
  stopWatchingRoot,
  trashPaper,
  updatePaperMeta,
} from './fsLibrary';
import {
  getEnvFilePath,
  importEnvFile,
  loadLlmConfig,
  reviewBibtexWithLlm,
  saveLlmConfig,
  testLlmConnection,
} from './llm';
import { lookupMetadataByQuery } from './metadata';

let mainWindow: BrowserWindow | null = null;

function broadcastWorkspace(snapshot: WorkspaceSnapshot) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace:changed', snapshot);
  }
}

function createWindow() {
  const appRoot = app.getAppPath();
  const preloadPath = path.join(appRoot, 'dist-electron', 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    title: 'PaperManager',
    backgroundColor: '#FAF9F6',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('preload-error', (_event, p, error) => {
    console.error('[Folio] Preload error:', p, error);
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[Folio] Failed to load:', code, desc, url);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const indexPath = path.join(appRoot, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

function setupMenu() {
  const send = (action: string) => {
    mainWindow?.webContents.send('menu:action', action);
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 PaperManager' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 PaperManager' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 PaperManager' },
      ],
    },
    {
      label: '文件',
      submenu: [
        {
          label: '导入 PDF 到当前文件夹…',
          accelerator: 'CmdOrCtrl+I',
          click: () => send('import-pdf'),
        },
        {
          label: '导出参考文献…',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('export-citations'),
        },
        {
          label: '新建分类文件夹…',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('new-folder'),
        },
        { type: 'separator' },
        {
          label: '切换论文根目录…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('choose-root'),
        },
        {
          label: '在 Finder 中打开根目录',
          click: async () => {
            const p = await getRootPath();
            await shell.openPath(p);
          },
        },
        { type: 'separator' },
        {
          label: 'LLM 元信息补全配置 (.env)…',
          accelerator: 'CmdOrCtrl+,',
          click: () => send('open-llm-settings'),
        },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        {
          label: '搜索论文',
          accelerator: 'CmdOrCtrl+K',
          click: () => send('focus-search'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '刷新目录',
          accelerator: 'CmdOrCtrl+R',
          click: () => send('refresh'),
        },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle('workspace:load', async () => {
    const snap = await scanWorkspace(true);
    await startWatchingRoot(broadcastWorkspace);
    return snap;
  });

  ipcMain.handle('workspace:choose-root', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择本地论文文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    await setRootPath(res.filePaths[0]);
    const snap = await scanWorkspace(true);
    await startWatchingRoot(broadcastWorkspace);
    return snap;
  });

  ipcMain.handle('workspace:open-root', async () => {
    const p = await getRootPath();
    await shell.openPath(p);
  });

  ipcMain.handle('folder:open-finder', async (_e, folderRelPath: string) => {
    const root = await getRootPath();
    const target = folderRelPath
      ? path.join(root, ...folderRelPath.split('/'))
      : root;
    await shell.openPath(target);
  });

  ipcMain.handle('folder:create', (_e, parentRelPath: string, name: string) =>
    createFolder(parentRelPath, name)
  );

  ipcMain.handle('folder:rename', (_e, folderRelPath: string, newName: string) =>
    renameFolder(folderRelPath, newName)
  );

  ipcMain.handle('folder:delete', (_e, folderRelPath: string) =>
    deleteFolder(folderRelPath)
  );

  ipcMain.handle('context-menu:folder', (event, folderRelPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const isRoot = !folderRelPath;

    return new Promise<string | null>((resolve) => {
      let resolved = false;
      const done = (action: string | null) => {
        if (!resolved) {
          resolved = true;
          resolve(action);
        }
      };

      const items: Electron.MenuItemConstructorOptions[] = [
        { label: '新建子文件夹…', click: () => done('new-subfolder') },
        { label: '导入 PDF 到此文件夹…', click: () => done('import-here') },
        { type: 'separator' },
        { label: '在 Finder 中打开', click: () => done('open-finder') },
      ];

      if (!isRoot) {
        items.push(
          { type: 'separator' },
          { label: '重命名…', click: () => done('rename') },
          { label: '移至废纸篓', click: () => done('delete') }
        );
      } else {
        items.push(
          { type: 'separator' },
          { label: '切换论文根目录…', click: () => done('choose-root') }
        );
      }

      const menu = Menu.buildFromTemplate(items);
      menu.popup({ window: win, callback: () => done(null) });
    });
  });

  ipcMain.handle('context-menu:paper', (event, _relPath: string, isRead: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    return new Promise<string | null>((resolve) => {
      let resolved = false;
      const done = (action: string | null) => {
        if (!resolved) {
          resolved = true;
          resolve(action);
        }
      };

      const menu = Menu.buildFromTemplate([
        { label: '打开 PDF', click: () => done('open') },
        { label: isRead ? '编辑一句话总结…' : '写总结并标为已读…', click: () => done('takeaway') },
        { label: isRead ? '标为未读' : '直接标为已读', click: () => done('toggle-read') },
        { type: 'separator' },
        { label: '在 Finder 中显示', click: () => done('reveal') },
        { label: '重新识别全名与团队', click: () => done('enrich') },
        { label: '使用 LLM 补全元信息', click: () => done('enrich-llm') },
        { type: 'separator' },
        { label: '移至废纸篓', click: () => done('trash') },
      ]);
      menu.popup({ window: win, callback: () => done(null) });
    });
  });

  ipcMain.handle('pdf:import-dialog', async (_e, targetFolderRelPath: string) => {
    const res = await dialog.showOpenDialog({
      title: '导入 PDF 论文',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { imported: [], workspace: await scanWorkspace(false) };
    }
    return importPdfPaths(res.filePaths, targetFolderRelPath);
  });

  ipcMain.handle(
    'pdf:import-paths',
    (_e, filePaths: string[], targetFolderRelPath: string) =>
      importPdfPaths(filePaths, targetFolderRelPath)
  );

  ipcMain.handle(
    'pdf:update-meta',
    (_e, relPath: string, patch: Partial<PaperMetaRecord>) =>
      updatePaperMeta(relPath, patch)
  );

  ipcMain.handle('pdf:move', (_e, relPath: string, targetFolderRelPath: string) =>
    movePaper(relPath, targetFolderRelPath)
  );

  ipcMain.handle('pdf:rename', (_e, relPath: string, newBaseName: string) =>
    renamePaperFile(relPath, newBaseName)
  );

  ipcMain.handle('pdf:trash', (_e, relPath: string) => trashPaper(relPath));

  ipcMain.handle('pdf:open', async (_e, relPath: string) => {
    const abs = await getAbsolutePdfPath(relPath);
    if (!abs) return { ok: false, error: '找不到本地 PDF 文件' };
    const err = await shell.openPath(abs);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('pdf:reveal', async (_e, relPath: string) => {
    const abs = await getAbsolutePdfPath(relPath);
    if (!abs) return { ok: false, error: '找不到本地 PDF 文件' };
    shell.showItemInFolder(abs);
    return { ok: true };
  });

  ipcMain.handle('pdf:enrich', (_e, relPath: string) => enrichSinglePaper(relPath));

  ipcMain.handle('pdf:enrich-llm', (_e, relPath: string) => enrichSinglePaperWithLlm(relPath));

  ipcMain.handle('pdf:enrich-all', () => enrichAllPapers());

  ipcMain.handle('pdf:enrich-llm-batch', (_e, relPaths: string[]) =>
    enrichIncompleteWithLlm(relPaths)
  );

  ipcMain.handle('pdf:lookup', (_e, query: string) => lookupMetadataByQuery(query));

  ipcMain.handle('llm:get-config', () => loadLlmConfig());

  ipcMain.handle(
    'llm:save-config',
    (_e, input: Pick<LlmConfig, 'enabled' | 'apiBase' | 'apiKey' | 'model' | 'bibtexPrompt'>) =>
      saveLlmConfig(input)
  );

  ipcMain.handle('llm:import-env', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择已有的 .env 配置文件',
      properties: ['openFile', 'showHiddenFiles'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return importEnvFile(res.filePaths[0]);
  });

  ipcMain.handle('llm:reveal-env', async () => {
    const envPath = getEnvFilePath();
    shell.showItemInFolder(envPath);
  });

  ipcMain.handle(
    'llm:test',
    (_e, input: Pick<LlmConfig, 'apiBase' | 'apiKey' | 'model'>) =>
      testLlmConnection(input)
  );

  ipcMain.handle(
    'llm:review-bibtex',
    async (_e, bibtex: string, customPrompt?: string, paperRelPaths?: string[]) => {
      const absPaths: string[] = [];
      if (Array.isArray(paperRelPaths)) {
        for (const rel of paperRelPaths) {
          const abs = await getAbsolutePdfPath(rel);
          if (abs) absPaths.push(abs);
        }
      }
      return reviewBibtexWithLlm(bibtex, customPrompt, absPaths);
    }
  );

  ipcMain.handle(
    'file:save-text',
    async (_e, defaultFileName: string, content: string, ext: string) => {
      const res = await dialog.showSaveDialog({
        title: '导出参考文献',
        defaultPath: defaultFileName,
        filters: [
          { name: ext.toUpperCase(), extensions: [ext] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (res.canceled || !res.filePath) return { ok: false };
      await fs.writeFile(res.filePath, content, 'utf8');
      return { ok: true, filePath: res.filePath };
    }
  );
}

app.whenReady().then(() => {
  app.setName('PaperManager');
  setOnEnrichCallback(broadcastWorkspace);
  registerIpc();
  setupMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  stopWatchingRoot();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
