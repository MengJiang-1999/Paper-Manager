import React, { useState } from 'react';
import {
  BookCheck,
  BookOpen,
  Building2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  RefreshCw,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type { I18nDict } from '../i18n';
import type { FolderNode } from '../types';

export type StatusFilter = 'all' | 'unread' | 'read';

interface SidebarProps {
  t: I18nDict;
  rootPath: string;
  statusFilter: StatusFilter;
  onStatusFilterChange: (s: StatusFilter) => void;
  selectedFolder: string | null; // null = all folders, "" = root only, "LLM" = subfolder
  onSelectFolder: (relPath: string | null) => void;
  selectedTeam: string | null;
  onSelectTeam: (team: string | null) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  folders: FolderNode[];
  counts: {
    all: number;
    unread: number;
    read: number;
    byTeam: Array<{ team: string; count: number }>;
    byTag: Array<{ tag: string; count: number }>;
  };
  onCreateFolder: (parentRelPath: string, name: string) => Promise<void>;
  onRenameFolder: (folderRelPath: string, newName: string) => Promise<void>;
  onDeleteFolder: (folderRelPath: string) => Promise<void>;
  onImportToFolder: (folderRelPath: string) => Promise<void>;
  onOpenFolderInFinder: (folderRelPath: string) => void;
  onChooseRootFolder: () => void;
  onRefresh: () => void;
  llmEnabled: boolean;
  onOpenLlmSettings: () => void;
  onDropPaperToFolder: (paperRelPath: string, targetFolderRelPath: string) => Promise<void>;
  onDropExternalFilesToFolder: (filePaths: string[], targetFolderRelPath: string) => Promise<void>;
  creatingFolderSignal: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  t,
  rootPath,
  statusFilter,
  onStatusFilterChange,
  selectedFolder,
  onSelectFolder,
  selectedTeam,
  onSelectTeam,
  selectedTag,
  onSelectTag,
  folders,
  counts,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onImportToFolder,
  onOpenFolderInFinder,
  onChooseRootFolder,
  onRefresh,
  llmEnabled,
  onOpenLlmSettings,
  onDropPaperToFolder,
  onDropExternalFilesToFolder,
  creatingFolderSignal,
}) => {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createParentRel, setCreateParentRel] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderRel, setRenamingFolderRel] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  React.useEffect(() => {
    if (creatingFolderSignal > 0) {
      setCreateParentRel(selectedFolder && selectedFolder.length > 0 ? selectedFolder : '');
      setCreatingFolder(true);
    }
  }, [creatingFolderSignal]);

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await onCreateFolder(createParentRel, trimmed);
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const handleCommitRename = async (folderRel: string) => {
    const trimmed = renameValue.trim();
    const currentName = folderRel.split('/').pop() || '';
    setRenamingFolderRel(null);
    if (trimmed && trimmed !== currentName) {
      await onRenameFolder(folderRel, trimmed);
    }
  };

  const handleFolderContextMenu = async (e: React.MouseEvent, folderRel: string) => {
    e.preventDefault();
    e.stopPropagation();
    const action = await window.folio.showFolderContextMenu(folderRel);
    if (!action) return;
    if (action === 'new-subfolder') {
      setCreateParentRel(folderRel);
      setCreatingFolder(true);
    } else if (action === 'import-here') {
      await onImportToFolder(folderRel);
    } else if (action === 'open-finder') {
      onOpenFolderInFinder(folderRel);
    } else if (action === 'rename' && folderRel) {
      setRenamingFolderRel(folderRel);
      setRenameValue(folderRel.split('/').pop() || '');
    } else if (action === 'delete' && folderRel) {
      await onDeleteFolder(folderRel);
    } else if (action === 'choose-root') {
      onChooseRootFolder();
    }
  };

  const handleFolderDragOver = (e: React.DragEvent, targetRel: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(targetRel);
  };

  const handleFolderDrop = async (e: React.DragEvent, targetRel: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);

    const internalRel = e.dataTransfer.getData('application/x-folio-paper');
    if (internalRel) {
      await onDropPaperToFolder(internalRel, targetRel);
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const pdfPaths = files
      .map((f) => window.folio.getPathForFile(f))
      .filter((p) => p && p.toLowerCase().endsWith('.pdf'));
    if (pdfPaths.length > 0) {
      await onDropExternalFilesToFolder(pdfPaths, targetRel);
    }
  };

  const rootName = rootPath.split('/').filter(Boolean).pop() || 'Papers';

  const statusItems: Array<{
    key: StatusFilter;
    label: string;
    icon: React.ReactNode;
    count: number;
  }> = [
    { key: 'unread', label: t.unread, icon: <BookOpen className="w-3.5 h-3.5" />, count: counts.unread },
    { key: 'read', label: t.read, icon: <BookCheck className="w-3.5 h-3.5" />, count: counts.read },
    { key: 'all', label: t.allPdfs, icon: <FileText className="w-3.5 h-3.5" />, count: counts.all },
  ];

  return (
    <aside className="w-[244px] shrink-0 bg-[#F3F1EB] border-r border-[#E7E3D9] flex flex-col select-none">
      {/* macOS traffic light safe area */}
      <div className="h-12 app-drag flex items-end justify-between px-4 pb-1.5">
        <div className="pl-[68px] flex items-baseline gap-1.5 min-w-0">
          <span className="font-serif text-[14px] font-semibold tracking-tight text-stone-800 truncate">
            Paper Reading
          </span>
        </div>
        <button
          onClick={onRefresh}
          title={t.refreshTitle}
          className="app-no-drag p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Reading Status */}
        <section>
          <div className="px-2 mb-1 text-[11px] font-medium tracking-wider text-stone-400 uppercase">
            {t.readingStatus}
          </div>
          <nav className="space-y-0.5">
            {statusItems.map((item) => {
              const active = statusFilter === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onStatusFilterChange(item.key)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                    active
                      ? 'bg-white text-stone-900 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                      : 'text-stone-600 hover:bg-stone-200/50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={active ? 'text-amber-600' : 'text-stone-400'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-stone-400">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </section>

        {/* Real Local Folders (Categories) */}
        <section>
          <div className="px-2 mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wider text-stone-400 uppercase">
              {t.folders}
            </span>
            <button
              onClick={() => {
                setCreateParentRel(selectedFolder && selectedFolder.length > 0 ? selectedFolder : '');
                setCreatingFolder((v) => !v);
              }}
              title={t.newFolderTitle}
              className="p-0.5 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
            >
              {creatingFolder ? <X className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {creatingFolder && (
            <form
              onSubmit={handleAddFolder}
              className="mb-2 p-2 rounded-lg bg-white border border-[#E5E0D5] shadow-sm space-y-1.5"
            >
              <div className="text-[10.5px] text-stone-400 truncate">
                {t.locationPrefix}
                {createParentRel ? `${rootName}/${createParentRel}` : rootName}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={t.folderNamePlaceholder}
                  className="flex-1 min-w-0 text-[12.5px] bg-transparent outline-none text-stone-800 placeholder:text-stone-400"
                />
                <button
                  type="submit"
                  className="text-[11px] font-medium px-2 py-0.5 rounded bg-stone-800 text-white hover:bg-stone-700 shrink-0"
                >
                  {t.create}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-0.5">
            {/* Root folder item */}
            <div
              onClick={() => onSelectFolder(null)}
              onContextMenu={(e) => handleFolderContextMenu(e, '')}
              onDragOver={(e) => handleFolderDragOver(e, '')}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(e) => handleFolderDrop(e, '')}
              className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] cursor-pointer transition-colors ${
                dragOverFolder === ''
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                  : selectedFolder === null
                    ? 'bg-white text-stone-900 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                    : 'text-stone-600 hover:bg-stone-200/50 hover:text-stone-900'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-600/80" />
                <span className="truncate">{rootName}</span>
              </span>
              <span className="text-[11px] tabular-nums text-stone-400">{counts.all}</span>
            </div>

            {/* Real subfolders */}
            {folders.map((folder) => {
              const depth = folder.relPath.split('/').length - 1;
              const active = selectedFolder === folder.relPath;
              const isDropTarget = dragOverFolder === folder.relPath;
              const isRenaming = renamingFolderRel === folder.relPath;

              return (
                <div
                  key={folder.relPath}
                  style={{ paddingLeft: `${12 + depth * 14}px` }}
                  onClick={() => !isRenaming && onSelectFolder(active ? null : folder.relPath)}
                  onContextMenu={(e) => handleFolderContextMenu(e, folder.relPath)}
                  onDragOver={(e) => handleFolderDragOver(e, folder.relPath)}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={(e) => handleFolderDrop(e, folder.relPath)}
                  className={`group flex items-center justify-between pr-2.5 py-1.5 rounded-lg text-[12.5px] cursor-pointer transition-colors ${
                    isDropTarget
                      ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                      : active
                        ? 'bg-white text-stone-900 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                        : 'text-stone-600 hover:bg-stone-200/50 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    <Folder
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-amber-600' : 'text-stone-400'
                      }`}
                    />
                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleCommitRename(folder.relPath)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCommitRename(folder.relPath);
                          if (e.key === 'Escape') setRenamingFolderRel(null);
                        }}
                        className="flex-1 min-w-0 bg-white border border-amber-400 rounded px-1 py-0 text-[12px] text-stone-900 outline-none"
                      />
                    ) : (
                      <span className="truncate">{folder.name}</span>
                    )}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFolderInFinder(folder.relPath);
                      }}
                      title={t.openInFinder}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-stone-400 hover:text-stone-700"
                    >
                      <FolderOpen className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(folder.relPath);
                      }}
                      title={t.trashFolderTitle}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-stone-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <span className="text-[11px] tabular-nums text-stone-400 min-w-[14px] text-right">
                      {folder.pdfCount}
                    </span>
                  </div>
                </div>
              );
            })}

            {folders.length === 0 && !creatingFolder && (
              <p className="px-2.5 py-1 text-[11.5px] text-stone-400 leading-relaxed">
                {t.emptyFoldersHint}
              </p>
            )}
          </div>
        </section>

        {/* Teams / Research Groups */}
        {counts.byTeam.length > 0 && (
          <section>
            <div className="px-2 mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium tracking-wider text-stone-400 uppercase">
                {t.teams}
              </span>
              {selectedTeam && (
                <button
                  onClick={() => onSelectTeam(null)}
                  className="text-[11px] text-indigo-700 hover:underline"
                >
                  {t.clear}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 px-1.5">
              {counts.byTeam.map(({ team, count }) => {
                const active = selectedTeam === team;
                return (
                  <button
                    key={team}
                    onClick={() => onSelectTeam(active ? null : team)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] transition-colors ${
                      active
                        ? 'bg-indigo-700 text-white font-medium'
                        : 'bg-indigo-50/80 text-indigo-800 hover:bg-indigo-100'
                    }`}
                  >
                    <Building2 className="w-2.5 h-2.5 opacity-70" />
                    <span>{team}</span>
                    <span className="text-[10px] opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Tags */}
        <section>
          <div className="px-2 mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wider text-stone-400 uppercase">
              {t.tags}
            </span>
            {selectedTag && (
              <button
                onClick={() => onSelectTag(null)}
                className="text-[11px] text-amber-700 hover:underline"
              >
                {t.clear}
              </button>
            )}
          </div>
          {counts.byTag.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-1.5">
              {counts.byTag.map(({ tag, count }) => {
                const active = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => onSelectTag(active ? null : tag)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] transition-colors ${
                      active
                        ? 'bg-stone-800 text-white font-medium'
                        : 'bg-[#E9E6DD]/70 text-stone-600 hover:bg-[#E2DDD0] hover:text-stone-900'
                    }`}
                  >
                    <Hash className="w-2.5 h-2.5 opacity-60" />
                    <span>{tag}</span>
                    <span className="text-[10px] opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-2 text-[11.5px] text-stone-400">{t.emptyTagsHint}</p>
          )}
        </section>
      </div>

      {/* Footer: Mounted Local Folder & Settings */}
      <div className="p-2.5 border-t border-[#E7E3D9] space-y-1">
        <button
          onClick={onOpenLlmSettings}
          title={t.settingsEntry}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[11.5px] text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Settings
              className={`w-3.5 h-3.5 ${llmEnabled ? 'text-amber-600' : 'text-stone-400'}`}
            />
            <span>{t.settingsEntry}</span>
          </span>
          {llmEnabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
              {t.llmEnabledBadge}
            </span>
          )}
        </button>

        <div className="flex items-center justify-between gap-1">
          <button
            onClick={() => onOpenFolderInFinder('')}
            title={`${t.openInFinder}: ${rootPath}`}
            className="flex items-center gap-1.5 min-w-0 flex-1 px-2 py-1 rounded-md text-[11.5px] text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-stone-400" />
            <span className="truncate font-mono text-[11px]">
              {rootPath.replace(/^\/Users\/[^/]+/, '~')}
            </span>
          </button>
          <button
            onClick={onChooseRootFolder}
            className="px-2 py-1 rounded-md text-[11px] font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 shrink-0 transition-colors"
          >
            {t.switchFolder}
          </button>
        </div>
      </div>
    </aside>
  );
};
