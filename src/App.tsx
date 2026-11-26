import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Building2,
  FileUp,
  FolderOpen,
  Loader2,
  Quote,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { CitationExportModal } from './components/CitationExportModal';
import { InspectorDrawer } from './components/InspectorDrawer';
import { LlmSettingsModal } from './components/LlmSettingsModal';
import { PaperRow } from './components/PaperRow';
import { Sidebar, type StatusFilter } from './components/Sidebar';
import { TakeawayModal } from './components/TakeawayModal';
import { loadSavedLocale, MESSAGES, saveLocale, type Locale } from './i18n';
import type { LlmConfig, PdfPaper, WorkspaceSnapshot } from './types';
import { splitTeams } from './utils/teams';

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => loadSavedLocale());
  const t = MESSAGES[locale];

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
    saveLocale(next);
  };
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'added' | 'year' | 'name'>('added');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [selectedRelPath, setSelectedRelPath] = useState<string | null>(null);
  const [takeawayPaper, setTakeawayPaper] = useState<PdfPaper | null>(null);
  const [importing, setImporting] = useState(false);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichingLlmBatch, setEnrichingLlmBatch] = useState(false);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);
  const [creatingFolderSignal, setCreatingFolderSignal] = useState(0);
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null);
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2600);
  };

  const reloadWorkspace = async () => {
    const snap = await window.folio.loadWorkspace();
    setWorkspace(snap);
  };

  useEffect(() => {
    reloadWorkspace();
    window.folio.getLlmConfig().then(setLlmConfig);
    const unsubWatch = window.folio.onWorkspaceChanged((snap) => {
      setWorkspace(snap);
    });
    return unsubWatch;
  }, []);

  useEffect(() => {
    const unsub = window.folio.onMenuAction((action) => {
      if (action === 'import-pdf') {
        handleImportDialog();
      } else if (action === 'new-folder') {
        setCreatingFolderSignal((n) => n + 1);
      } else if (action === 'choose-root') {
        handleChooseRoot();
      } else if (action === 'focus-search') {
        searchInputRef.current?.focus();
      } else if (action === 'refresh') {
        reloadWorkspace().then(() => showToast(t.toastRefreshed));
      } else if (action === 'open-llm-settings') {
        setLlmModalOpen(true);
      } else if (action === 'export-citations') {
        setExportModalOpen(true);
      }
    });
    return unsub;
  }, [selectedFolder, locale]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (takeawayPaper) setTakeawayPaper(null);
        else if (selectedRelPath) setSelectedRelPath(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [takeawayPaper, selectedRelPath]);

  const handleChooseRoot = async () => {
    const next = await window.folio.chooseRootFolder();
    if (next) {
      setWorkspace(next);
      setSelectedFolder(null);
      setSelectedTag(null);
      setSelectedRelPath(null);
      showToast(t.toastRootSwitched);
    }
  };

  const handleImportDialog = async (targetOverride?: string) => {
    setImporting(true);
    try {
      const target = targetOverride !== undefined ? targetOverride : selectedFolder ?? '';
      const res = await window.folio.importPdfsDialog(target);
      setWorkspace(res.workspace);
      if (res.imported.length > 0) {
        setSelectedRelPath(res.imported[0]);
        showToast(t.toastImported(res.imported.length));
      }
    } finally {
      setImporting(false);
    }
  };

  const handleExternalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingExternal(false);

    // Ignore internal drag-to-move events
    if (e.dataTransfer.types.includes('application/x-folio-paper')) return;

    const files = Array.from(e.dataTransfer.files);
    const pdfPaths = files
      .map((f) => window.folio.getPathForFile(f))
      .filter((p) => p && p.toLowerCase().endsWith('.pdf'));

    if (pdfPaths.length === 0) return;

    setImporting(true);
    try {
      const target = selectedFolder ?? '';
      const res = await window.folio.importPdfPaths(pdfPaths, target);
      setWorkspace(res.workspace);
      if (res.imported.length > 0) {
        setSelectedRelPath(res.imported[0]);
        showToast(t.toastDropped(res.imported.length));
      }
    } finally {
      setImporting(false);
    }
  };

  const counts = useMemo(() => {
    const papers = workspace?.papers ?? [];
    const tagMap = new Map<string, number>();
    const teamMap = new Map<string, number>();
    let unread = 0;
    let read = 0;
    for (const p of papers) {
      if (p.status === 'read') read += 1;
      else unread += 1;
      for (const tm of splitTeams(p.team)) {
        teamMap.set(tm, (teamMap.get(tm) || 0) + 1);
      }
      for (const t of p.tags) {
        tagMap.set(t, (tagMap.get(t) || 0) + 1);
      }
    }
    const byTag = Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    const byTeam = Array.from(teamMap.entries())
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));

    return { all: papers.length, unread, read, byTeam, byTag };
  }, [workspace]);

  const filteredPapers = useMemo(() => {
    const papers = workspace?.papers ?? [];
    const q = searchQuery.trim().toLowerCase();

    const matched = papers.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (selectedFolder !== null) {
        const prefix = `${selectedFolder}/`;
        if (p.folderRelPath !== selectedFolder && !p.folderRelPath.startsWith(prefix)) {
          return false;
        }
      }
      if (selectedTeam && !splitTeams(p.team).includes(selectedTeam)) return false;
      if (selectedTag && !p.tags.includes(selectedTag)) return false;
      if (q) {
        const haystack = [
          p.shortName,
          p.title,
          p.fileName,
          p.team,
          p.takeaway,
          p.venue,
          p.year ? String(p.year) : '',
          p.folderRelPath,
          p.arxivId || '',
          ...p.authors,
          ...p.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;

    return [...matched].sort((a, b) => {
      // 1. Always keep unread above read
      if (a.status !== b.status) {
        return a.status === 'unread' ? -1 : 1;
      }

      // 2. Within each status group, sort by chosen criterion
      if (sortBy === 'year') {
        const ya = a.year;
        const yb = b.year;
        if (ya === null && yb !== null) return 1;
        if (ya !== null && yb === null) return -1;
        if (ya !== null && yb !== null && ya !== yb) {
          return (ya - yb) * dir;
        }
        return (a.mtimeMs - b.mtimeMs) * dir;
      }

      if (sortBy === 'name') {
        const na = (a.shortName || a.title).trim();
        const nb = (b.shortName || b.title).trim();
        return na.localeCompare(nb, 'zh-CN', { sensitivity: 'base' }) * dir;
      }

      // Default: added time (file mtimeMs)
      return (a.mtimeMs - b.mtimeMs) * dir;
    });
  }, [workspace, statusFilter, selectedFolder, selectedTeam, selectedTag, searchQuery, sortBy, sortDir]);

  const selectedPaper = useMemo(
    () => workspace?.papers.find((p) => p.relPath === selectedRelPath) ?? null,
    [workspace, selectedRelPath]
  );

  // Determine which papers in the current view are missing key metadata (so LLM never wastes tokens on complete ones)
  const incompletePapers = useMemo(() => {
    return filteredPapers.filter((p) => {
      const baseName = p.fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim().toLowerCase();
      const titleLooksIncomplete =
        !p.title.trim() ||
        p.title.trim().split(/\s+/).length < 3 ||
        p.title.trim().toLowerCase() === baseName;
      const missingAuthors = p.authors.length === 0;
      const missingTeam = !p.team.trim();
      return titleLooksIncomplete || missingAuthors || missingTeam;
    });
  }, [filteredPapers]);

  if (!workspace) {
    return (
      <div className="h-full flex items-center justify-center bg-[#FAF9F6] text-stone-400 text-sm">
        {t.loadingWorkspace}
      </div>
    );
  }

  const rootName = workspace.rootPath.split('/').filter(Boolean).pop() || 'Papers';

  return (
    <div
      className="h-full flex bg-[#FAF9F6] text-stone-900 relative overflow-hidden"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('application/x-folio-paper')) return;
        e.preventDefault();
        dragCounterRef.current += 1;
        setIsDraggingExternal(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-folio-paper')) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (e.dataTransfer.types.includes('application/x-folio-paper')) return;
        e.preventDefault();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current <= 0) {
          dragCounterRef.current = 0;
          setIsDraggingExternal(false);
        }
      }}
      onDrop={handleExternalDrop}
    >
      {/* External PDF Drop Overlay */}
      {isDraggingExternal && (
        <div className="fixed inset-0 z-50 bg-[#FAF9F6]/90 backdrop-blur-sm flex items-center justify-center p-8 pointer-events-none">
          <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-amber-500 bg-white/95 p-9 text-center space-y-2.5 shadow-xl">
            <UploadCloud className="w-9 h-9 text-amber-600 mx-auto" />
            <div className="text-[15.5px] font-semibold text-stone-900">
              {t.dropToFolder(selectedFolder || rootName)}
            </div>
            <p className="text-[12.5px] text-stone-500">
              {t.dropSubHint}
            </p>
          </div>
        </div>
      )}

      {/* Left Sidebar (Finder Tree) */}
      <Sidebar
        t={t}
        rootPath={workspace.rootPath}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
        selectedTeam={selectedTeam}
        onSelectTeam={setSelectedTeam}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        folders={workspace.folders}
        counts={counts}
        onCreateFolder={async (parent, name) => {
          const next = await window.folio.createFolder(parent, name);
          setWorkspace(next);
          showToast(t.toastFolderCreated(name));
        }}
        onRenameFolder={async (folderRel, newName) => {
          const res = await window.folio.renameFolder(folderRel, newName);
          setWorkspace(res.workspace);
          if (selectedFolder === folderRel) setSelectedFolder(res.newRelPath);
          showToast(t.toastFolderRenamed(newName));
        }}
        onDeleteFolder={async (folderRel) => {
          const next = await window.folio.deleteFolder(folderRel);
          setWorkspace(next);
          if (selectedFolder === folderRel) setSelectedFolder(null);
          showToast(t.toastFolderTrashed);
        }}
        onImportToFolder={async (folderRel) => {
          await handleImportDialog(folderRel);
        }}
        onOpenFolderInFinder={(rel) => window.folio.openFolderInFinder(rel)}
        onChooseRootFolder={handleChooseRoot}
        onRefresh={() => reloadWorkspace().then(() => showToast(t.toastRefreshed))}
        llmEnabled={Boolean(llmConfig?.enabled)}
        onOpenLlmSettings={() => setLlmModalOpen(true)}
        onDropPaperToFolder={async (paperRel, targetFolder) => {
          const res = await window.folio.movePaper(paperRel, targetFolder);
          setWorkspace(res.workspace);
          if (selectedRelPath === paperRel) setSelectedRelPath(res.newRelPath);
          showToast(t.toastMovedTo(targetFolder || rootName));
        }}
        onDropExternalFilesToFolder={async (paths, targetFolder) => {
          const res = await window.folio.importPdfPaths(paths, targetFolder);
          setWorkspace(res.workspace);
          if (res.imported.length > 0) {
            setSelectedRelPath(res.imported[0]);
            showToast(t.toastDropped(res.imported.length));
          }
        }}
        creatingFolderSignal={creatingFolderSignal}
      />

      {/* Center Compact Academic Finder List */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Toolbar */}
        <header className="h-12 app-drag px-4 border-b border-[#EAE6DC] bg-[#FAF9F6] flex items-center justify-between gap-3 shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 min-w-0 text-[13px]">
            <button
              onClick={() => setSelectedFolder(null)}
              className={`app-no-drag font-medium truncate ${
                selectedFolder ? 'text-stone-500 hover:text-stone-900' : 'text-stone-900'
              }`}
            >
              {rootName}
            </button>
            {selectedFolder &&
              selectedFolder.split('/').map((seg, idx, arr) => {
                const partial = arr.slice(0, idx + 1).join('/');
                const isLast = idx === arr.length - 1;
                return (
                  <React.Fragment key={partial}>
                    <span className="text-stone-300">/</span>
                    <button
                      onClick={() => setSelectedFolder(partial)}
                      className={`app-no-drag truncate ${
                        isLast ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-900'
                      }`}
                    >
                      {seg}
                    </button>
                  </React.Fragment>
                );
              })}
            <span className="text-[11.5px] text-stone-400 tabular-nums ml-1">
              {t.papersCount(filteredPapers.length)}
            </span>
            {selectedTeam && (
              <button
                onClick={() => setSelectedTeam(null)}
                className="app-no-drag ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-indigo-700 text-white"
              >
                <Building2 className="w-2.5 h-2.5" />
                {selectedTeam}
                <X className="w-2.5 h-2.5" />
              </button>
            )}
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="app-no-drag ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-stone-800 text-white"
              >
                #{selectedTag}
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Search, Sort & Actions */}
          <div className="app-no-drag flex items-center gap-2">
            {/* Compact Sort Control */}
            <div className="inline-flex items-center rounded-lg bg-[#F0EDE5] p-0.5 text-[11.5px]">
              <select
                value={sortBy}
                onChange={(e) => {
                  const next = e.target.value as 'added' | 'year' | 'name';
                  setSortBy(next);
                  setSortDir(next === 'name' ? 'asc' : 'desc');
                }}
                className="bg-transparent text-stone-700 font-medium outline-none pl-2 pr-1 py-0.5 cursor-pointer"
              >
                <option value="added">{t.sortAdded}</option>
                <option value="year">{t.sortYear}</option>
                <option value="name">{t.sortName}</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                title={sortDir === 'desc' ? t.sortDescTitle : t.sortAscTitle}
                className="p-1 rounded-md text-stone-500 hover:text-stone-900 hover:bg-white/70 transition-colors"
              >
                {sortDir === 'desc' ? (
                  <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                ) : (
                  <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full rounded-lg bg-[#F0EDE5] focus:bg-white border border-transparent focus:border-[#D6CFC0] outline-none pl-8 pr-6 py-1 text-[12px] text-stone-800 placeholder:text-stone-400 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Always-available free local/arXiv batch enrichment */}
            <button
              onClick={async () => {
                setEnrichingAll(true);
                try {
                  const next = await window.folio.enrichAllPapers();
                  setWorkspace(next);
                  showToast(t.toastLocalEnrichDone);
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Scan failed');
                } finally {
                  setEnrichingAll(false);
                }
              }}
              disabled={enrichingAll}
              title={t.localEnrichTitle}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium text-stone-700 bg-[#F0EDE5] hover:bg-[#E5E0D5] disabled:opacity-60 transition-colors"
            >
              {enrichingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-600" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-stone-500" />
              )}
              {t.localEnrich}
            </button>

            {/* Explicit opt-in LLM button: ONLY processes papers with missing metadata */}
            {llmConfig?.enabled && (
              <button
                onClick={async () => {
                  if (incompletePapers.length === 0) {
                    showToast(t.toastAllComplete);
                    return;
                  }
                  setEnrichingLlmBatch(true);
                  try {
                    const res = await window.folio.enrichIncompleteWithLlm(
                      incompletePapers.map((p) => p.relPath)
                    );
                    setWorkspace(res.workspace);
                    showToast(t.toastLlmBatchDone(res.processed));
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'LLM failed');
                  } finally {
                    setEnrichingLlmBatch(false);
                  }
                }}
                disabled={enrichingLlmBatch || incompletePapers.length === 0}
                title={t.llmFillMissingTitle(incompletePapers.length)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium text-amber-800 bg-amber-50 border border-amber-200/80 hover:bg-amber-100 disabled:opacity-45 transition-colors"
              >
                {enrichingLlmBatch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {t.llmFillMissing}
                {incompletePapers.length > 0 && (
                  <span className="tabular-nums text-[11px] opacity-80">
                    ({incompletePapers.length})
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setExportModalOpen(true)}
              title={t.exportCitationsTitle}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium text-stone-700 bg-[#F0EDE5] hover:bg-[#E5E0D5] transition-colors"
            >
              <Quote className="w-3.5 h-3.5 text-stone-500" />
              {t.exportCitations}
            </button>

            <button
              onClick={() => handleImportDialog()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-60 transition-colors"
            >
              {importing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileUp className="w-3.5 h-3.5" />
              )}
              {t.importPdf}
            </button>
          </div>
        </header>

        {/* Compact File List */}
        <div className="flex-1 overflow-y-auto">
          {filteredPapers.length > 0 ? (
            <div>
              {filteredPapers.map((paper, idx) => {
                const prev = idx > 0 ? filteredPapers[idx - 1] : null;
                const showReadDivider =
                  statusFilter === 'all' &&
                  paper.status === 'read' &&
                  prev?.status === 'unread';
                const readCountInView = showReadDivider
                  ? filteredPapers.filter((p) => p.status === 'read').length
                  : 0;

                return (
                  <React.Fragment key={paper.relPath}>
                    {showReadDivider && (
                      <div className="px-4 py-1.5 bg-[#F6F4EE] border-b border-[#EAE6DC] text-[11px] font-medium text-stone-500 flex items-center justify-between select-none">
                        <span>{t.readSectionDivider}</span>
                        <span className="tabular-nums text-stone-400">
                          {t.papersCount(readCountInView)}
                        </span>
                      </div>
                    )}
                    <PaperRow
                      t={t}
                      paper={paper}
                      selected={selectedRelPath === paper.relPath}
                      showFolderBadge={selectedFolder === null}
                      onSelect={() => setSelectedRelPath(paper.relPath)}
                      onOpenPdf={async () => {
                        const res = await window.folio.openPdf(paper.relPath);
                        if (!res.ok && res.error) showToast(res.error);
                      }}
                      onRevealPdf={async () => {
                        const res = await window.folio.revealPdf(paper.relPath);
                        if (!res.ok && res.error) showToast(res.error);
                      }}
                      onOpenTakeaway={() => setTakeawayPaper(paper)}
                      onTagClick={(tag) => setSelectedTag(selectedTag === tag ? null : tag)}
                      onTeamClick={(team) => setSelectedTeam(selectedTeam === team ? null : team)}
                      onFolderClick={(folder) => setSelectedFolder(folder)}
                      onContextMenu={async (e) => {
                        e.preventDefault();
                        setSelectedRelPath(paper.relPath);
                        const action = await window.folio.showPaperContextMenu(
                          paper.relPath,
                          paper.status === 'read'
                        );
                        if (!action) return;
                        if (action === 'open') {
                          const res = await window.folio.openPdf(paper.relPath);
                          if (!res.ok && res.error) showToast(res.error);
                        } else if (action === 'takeaway') {
                          setTakeawayPaper(paper);
                        } else if (action === 'toggle-read') {
                          const next = await window.folio.updatePaperMeta(paper.relPath, {
                            status: paper.status === 'read' ? 'unread' : 'read',
                          });
                          setWorkspace(next);
                        } else if (action === 'reveal') {
                          const res = await window.folio.revealPdf(paper.relPath);
                          if (!res.ok && res.error) showToast(res.error);
                        } else if (action === 'enrich') {
                          const next = await window.folio.enrichPaperMeta(paper.relPath);
                          setWorkspace(next);
                          showToast(t.reEnrichDone);
                        } else if (action === 'enrich-llm') {
                          if (!llmConfig?.enabled) {
                            setLlmModalOpen(true);
                            return;
                          }
                          showToast(t.toastLlmRunning);
                          try {
                            const next = await window.folio.enrichPaperWithLlm(paper.relPath);
                            setWorkspace(next);
                            showToast(t.toastLlmSingleDone);
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'LLM error');
                          }
                        } else if (action === 'trash') {
                          const next = await window.folio.trashPaper(paper.relPath);
                          setWorkspace(next);
                          if (selectedRelPath === paper.relPath) setSelectedRelPath(null);
                          showToast(t.toastTrashed);
                        }
                      }}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F3F1EB] text-stone-400 flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="text-[14.5px] font-medium text-stone-800">
                {searchQuery || selectedTag
                  ? t.emptySearch
                  : statusFilter === 'read'
                    ? t.emptyRead
                    : t.emptyFolder}
              </div>
              <p className="text-[12.5px] text-stone-400 max-w-sm leading-relaxed">
                {statusFilter === 'read' ? t.emptyReadHint : t.emptyFolderHint}
              </p>
              {!searchQuery && !selectedTag && statusFilter !== 'read' && (
                <div className="pt-1 flex items-center gap-2">
                  <button
                    onClick={handleChooseRoot}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium bg-[#F2EFE8] text-stone-800 hover:bg-[#E7E2D6] transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {t.chooseExistingFolder}
                  </button>
                  <button
                    onClick={() => handleImportDialog()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    {t.importPdfBtn}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Right Lightweight PDF Inspector */}
      {selectedPaper && (
        <InspectorDrawer
          t={t}
          paper={selectedPaper}
          folders={workspace.folders}
          allTags={counts.byTag.map((item) => item.tag)}
          allTeams={counts.byTeam.map((item) => item.team)}
          onClose={() => setSelectedRelPath(null)}
          onUpdateMeta={async (relPath, patch) => {
            const next = await window.folio.updatePaperMeta(relPath, patch);
            setWorkspace(next);
          }}
          onMovePaper={async (relPath, targetFolder) => {
            const res = await window.folio.movePaper(relPath, targetFolder);
            setWorkspace(res.workspace);
            setSelectedRelPath(res.newRelPath);
            showToast(t.toastMovedTo(targetFolder || rootName));
          }}
          onRenameFile={async (relPath, newBase) => {
            const res = await window.folio.renamePaperFile(relPath, newBase);
            setWorkspace(res.workspace);
            setSelectedRelPath(res.newRelPath);
            showToast(t.toastFileRenamed);
          }}
          onTrashPaper={async (relPath) => {
            const next = await window.folio.trashPaper(relPath);
            setWorkspace(next);
            setSelectedRelPath(null);
            showToast(t.toastTrashed);
          }}
          onOpenPdf={async (relPath) => {
            const res = await window.folio.openPdf(relPath);
            if (!res.ok && res.error) showToast(res.error);
          }}
          onRevealPdf={async (relPath) => {
            const res = await window.folio.revealPdf(relPath);
            if (!res.ok && res.error) showToast(res.error);
          }}
          onEnrichPaper={async (relPath) => {
            const next = await window.folio.enrichPaperMeta(relPath);
            setWorkspace(next);
          }}
          llmEnabled={Boolean(llmConfig?.enabled)}
          onEnrichPaperWithLlm={async (relPath) => {
            const next = await window.folio.enrichPaperWithLlm(relPath);
            setWorkspace(next);
          }}
          onOpenLlmSettings={() => setLlmModalOpen(true)}
        />
      )}

      {/* Citation Export Modal */}
      <CitationExportModal
        t={t}
        open={exportModalOpen}
        allPapers={workspace.papers}
        currentViewPapers={filteredPapers}
        llmConfig={llmConfig}
        onLlmConfigSaved={setLlmConfig}
        onClose={() => setExportModalOpen(false)}
        onOpenLlmSettings={() => setLlmModalOpen(true)}
        onNotify={showToast}
      />

      {/* Settings & Optional LLM Modal (.env) */}
      <LlmSettingsModal
        t={t}
        locale={locale}
        onLocaleChange={handleLocaleChange}
        open={llmModalOpen}
        config={llmConfig}
        onClose={() => setLlmModalOpen(false)}
        onSaved={(next) => {
          setLlmConfig(next);
          showToast(t.toastLlmSaved);
        }}
      />

      {/* Takeaway Modal */}
      <TakeawayModal
        t={t}
        paper={takeawayPaper}
        onClose={() => setTakeawayPaper(null)}
        onSave={async (relPath, takeaway) => {
          const next = await window.folio.updatePaperMeta(relPath, {
            takeaway,
            status: 'read',
          });
          setWorkspace(next);
          showToast(t.toastTakeawaySaved);
        }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-stone-900 text-white text-[12px] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
