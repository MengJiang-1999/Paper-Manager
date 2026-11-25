import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FolderSearch,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { I18nDict } from '../i18n';
import type { FolderNode, PaperMetaRecord, PdfPaper } from '../types';

interface InspectorDrawerProps {
  t: I18nDict;
  paper: PdfPaper | null;
  folders: FolderNode[];
  allTags: string[];
  allTeams: string[];
  onClose: () => void;
  onUpdateMeta: (relPath: string, patch: Partial<PaperMetaRecord>) => Promise<void>;
  onMovePaper: (relPath: string, targetFolderRelPath: string) => Promise<void>;
  onRenameFile: (relPath: string, newBaseName: string) => Promise<void>;
  onTrashPaper: (relPath: string) => Promise<void>;
  onOpenPdf: (relPath: string) => void;
  onRevealPdf: (relPath: string) => void;
  onEnrichPaper: (relPath: string) => Promise<void>;
  llmEnabled: boolean;
  onEnrichPaperWithLlm: (relPath: string) => Promise<void>;
  onOpenLlmSettings: () => void;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  t,
  paper,
  folders,
  allTags,
  allTeams,
  onClose,
  onUpdateMeta,
  onMovePaper,
  onRenameFile,
  onTrashPaper,
  onOpenPdf,
  onRevealPdf,
  onEnrichPaper,
  llmEnabled,
  onEnrichPaperWithLlm,
  onOpenLlmSettings,
}) => {
  const [fileBaseName, setFileBaseName] = useState('');
  const [shortName, setShortName] = useState('');
  const [title, setTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [team, setTeam] = useState('');
  const [year, setYear] = useState('');
  const [venue, setVenue] = useState('');
  const [takeaway, setTakeaway] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichingLlm, setEnrichingLlm] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);

  useEffect(() => {
    if (!paper) return;
    setFileBaseName(paper.fileName.replace(/\.pdf$/i, ''));
    setShortName(paper.shortName || '');
    setTitle(paper.title);
    setAuthorsText(paper.authors.join(', '));
    setTeam(paper.team || '');
    setYear(paper.year ? String(paper.year) : '');
    setVenue(paper.venue || '');
    setTakeaway(paper.takeaway || '');
    setLookupQuery(paper.arxivId || paper.doi || '');
    setLookupMsg(null);
    setConfirmTrash(false);
  }, [paper?.relPath, paper?.shortName, paper?.title, paper?.team, paper?.takeaway, paper?.venue, paper?.year, paper?.authors.join(',')]);

  if (!paper) return null;

  const commitMeta = async (extra: Partial<PaperMetaRecord> = {}) => {
    const parsedYear = year.trim() ? Number.parseInt(year.trim(), 10) : null;
    const authors = authorsText
      .split(/[,，;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    await onUpdateMeta(paper.relPath, {
      shortName: shortName.trim(),
      title: title.trim() || paper.title,
      authors,
      team: team.trim(),
      year: Number.isNaN(parsedYear) ? null : parsedYear,
      venue: venue.trim(),
      takeaway: takeaway.trim(),
      ...extra,
    });
  };

  const handleRenameSubmit = async () => {
    const currentBase = paper.fileName.replace(/\.pdf$/i, '');
    if (fileBaseName.trim() && fileBaseName.trim() !== currentBase) {
      await onRenameFile(paper.relPath, fileBaseName.trim());
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = lookupQuery.trim();
    if (!q) return;
    setLookingUp(true);
    setLookupMsg(null);
    try {
      const res = await window.folio.lookupMetadata(q);
      if (!res) {
        setLookupMsg(t.lookupNotFound);
        return;
      }
      await onUpdateMeta(paper.relPath, {
        title: res.title || title,
        authors: res.authors && res.authors.length > 0 ? res.authors : paper.authors,
        year: res.year ?? paper.year,
        venue: res.venue || paper.venue,
        arxivId: res.arxivId ?? paper.arxivId,
        doi: res.doi ?? paper.doi,
        url: res.url ?? paper.url,
        metaFetched: true,
      });
      setLookupMsg(t.lookupSuccess(res.source === 'arxiv' ? 'arXiv' : 'Crossref'));
    } finally {
      setLookingUp(false);
    }
  };

  const handleReEnrich = async () => {
    setEnriching(true);
    setLookupMsg(null);
    try {
      await onEnrichPaper(paper.relPath);
      setLookupMsg(t.reEnrichDone);
    } finally {
      setEnriching(false);
    }
  };

  const handleLlmEnrich = async () => {
    if (!llmEnabled) {
      onOpenLlmSettings();
      return;
    }
    setEnrichingLlm(true);
    setLookupMsg(null);
    try {
      await onEnrichPaperWithLlm(paper.relPath);
      setLookupMsg(t.llmEnrichDone);
    } catch (err) {
      setLookupMsg(err instanceof Error ? err.message : 'LLM error');
    } finally {
      setEnrichingLlm(false);
    }
  };

  const handleAddTag = async (raw: string) => {
    const clean = raw.trim().replace(/^#/, '');
    if (!clean || paper.tags.includes(clean)) {
      setTagInput('');
      return;
    }
    await onUpdateMeta(paper.relPath, { tags: [...paper.tags, clean] });
    setTagInput('');
  };

  const handleRemoveTag = async (tag: string) => {
    await onUpdateMeta(paper.relPath, { tags: paper.tags.filter((t) => t !== tag) });
  };

  const suggestedTags = allTags
    .filter((t) => !paper.tags.includes(t))
    .filter((t) => !tagInput.trim() || t.toLowerCase().includes(tagInput.toLowerCase()))
    .slice(0, 6);

  return (
    <aside className="w-[350px] shrink-0 bg-[#FBFBF9] border-l border-[#E7E3D9] flex flex-col h-full">
      {/* Header */}
      <div className="h-12 app-drag px-4 border-b border-[#ECE8DF] flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-stone-500">{t.inspectorHeader}</span>
        <button
          onClick={onClose}
          className="app-no-drag p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Primary PDF File Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenPdf(paper.relPath)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12.5px] font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t.openPdf}
          </button>
          <button
            onClick={() => onRevealPdf(paper.relPath)}
            className="px-2.5 py-1.5 rounded-lg text-[12px] text-stone-600 bg-[#F2EFE8] hover:bg-[#E7E2D6] transition-colors inline-flex items-center gap-1"
            title={t.revealInFinder}
          >
            <FolderSearch className="w-3.5 h-3.5" />
            Finder
          </button>
        </div>

        {/* Read / Unread Switch */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F2EFE8]">
          <button
            onClick={() => onUpdateMeta(paper.relPath, { status: 'unread' })}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              paper.status === 'unread'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t.unread}
          </button>
          <button
            onClick={() => onUpdateMeta(paper.relPath, { status: 'read' })}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-colors ${
              paper.status === 'read'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t.read}
          </button>
        </div>

        {/* Hero Takeaway */}
        <section className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-amber-800">
            {t.takeawayLabel}
          </label>
          <textarea
            rows={4}
            value={takeaway}
            onChange={(e) => setTakeaway(e.target.value)}
            onBlur={() => commitMeta()}
            placeholder={t.takeawayInputPlaceholder}
            className="w-full rounded-xl bg-[#FAF6EC] border border-amber-200/90 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 outline-none px-3 py-2 text-[13px] leading-relaxed text-stone-800 placeholder:text-stone-400 resize-none"
          />
        </section>

        {/* Real Folder (Category) & Real Filename */}
        <section className="space-y-2.5 pt-2 border-t border-[#ECE8DF]">
          <div>
            <label className="block text-[11.5px] text-stone-500 mb-1">
              {t.folderLabel}
            </label>
            <select
              value={paper.folderRelPath}
              onChange={(e) => onMovePaper(paper.relPath, e.target.value)}
              className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12.5px] text-stone-800"
            >
              <option value="">{t.rootFolderOption}</option>
              {folders.map((f) => (
                <option key={f.relPath} value={f.relPath}>
                  /{f.relPath}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11.5px] text-stone-500 mb-1">
              {t.filenameLabel}
            </label>
            <div className="flex items-center rounded-lg bg-white border border-[#E5E0D5] focus-within:border-stone-400 overflow-hidden">
              <input
                type="text"
                value={fileBaseName}
                onChange={(e) => setFileBaseName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                }}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] font-mono text-stone-800 outline-none"
              />
              <span className="pr-2.5 text-[11.5px] font-mono text-stone-400">.pdf</span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11.5px] text-stone-500 mb-1">{t.tags}</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {paper.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-200/70 text-stone-700 text-[11.5px]"
                >
                  #{tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-rose-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }
              }}
              placeholder={t.tagInputPlaceholder}
              className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12px] text-stone-800"
            />
            {suggestedTags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {suggestedTags.map((tTag) => (
                  <button
                    key={tTag}
                    type="button"
                    onClick={() => handleAddTag(tTag)}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                  >
                    + {tTag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Foolproof Academic Metadata */}
        <section className="space-y-2.5 pt-2 border-t border-[#ECE8DF]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-medium text-stone-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-600" />
              {t.academicMeta}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReEnrich}
                disabled={enriching}
                className="inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-900"
              >
                <RefreshCw className={`w-3 h-3 ${enriching ? 'animate-spin' : ''}`} />
                {t.localIdentify}
              </button>
              <button
                onClick={handleLlmEnrich}
                disabled={enrichingLlm}
                className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                  llmEnabled
                    ? 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
                    : 'bg-stone-100 text-stone-500 hover:text-stone-800'
                }`}
              >
                {enrichingLlm ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {t.llmComplete}
              </button>
            </div>
          </div>

          <form onSubmit={handleLookup} className="flex gap-1.5">
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder={t.lookupPlaceholder}
              className="flex-1 min-w-0 rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12px] text-stone-800 placeholder:text-stone-400"
            />
            <button
              type="submit"
              disabled={lookingUp || !lookupQuery.trim()}
              className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium bg-[#F2EFE8] text-stone-800 hover:bg-[#E7E2D6] disabled:opacity-50 shrink-0 inline-flex items-center gap-1"
            >
              {lookingUp && <Loader2 className="w-3 h-3 animate-spin" />}
              {t.lookupBtn}
            </button>
          </form>
          {lookupMsg && <p className="text-[11px] text-amber-700">{lookupMsg}</p>}

          <div>
            <label className="block text-[11px] text-stone-400 mb-0.5">{t.shortNameLabel}</label>
            <input
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              onBlur={() => commitMeta()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitMeta();
              }}
              placeholder={t.shortNamePlaceholder}
              className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12.5px] font-medium text-stone-900"
            />
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-0.5">{t.fullTitleLabel}</label>
            <textarea
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => commitMeta()}
              className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12.5px] text-stone-900 resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-0.5">{t.teamLabel}</label>
            <input
              type="text"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              onBlur={() => commitMeta()}
              placeholder={t.teamPlaceholder}
              className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12px] text-stone-800"
            />
            {allTeams.filter((tm) => tm !== team).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {allTeams
                  .filter((tm) => tm !== team)
                  .slice(0, 6)
                  .map((tm) => (
                    <button
                      key={tm}
                      type="button"
                      onClick={() => {
                        setTeam(tm);
                        onUpdateMeta(paper.relPath, { team: tm });
                      }}
                      className="text-[10.5px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      {tm}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-0.5">{t.authorsLabel}</label>
            <input
              type="text"
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              onBlur={() => commitMeta()}
              placeholder={t.authorsPlaceholder}
              className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12px] text-stone-800"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-stone-400 mb-0.5">{t.yearLabel}</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                onBlur={() => commitMeta()}
                placeholder="2024"
                className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12px] text-stone-800"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-stone-400 mb-0.5">{t.venueLabel}</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                onBlur={() => commitMeta()}
                placeholder="NeurIPS / arXiv"
                className="w-full rounded-lg bg-white border border-[#E5E0D5] focus:border-stone-400 outline-none px-2.5 py-1.5 text-[12px] text-stone-800"
              />
            </div>
          </div>
        </section>

        {/* Move to Trash */}
        <section className="pt-2 border-t border-[#ECE8DF]">
          {!confirmTrash ? (
            <button
              onClick={() => setConfirmTrash(true)}
              className="inline-flex items-center gap-1.5 text-[12px] text-stone-400 hover:text-rose-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.moveToTrash}
            </button>
          ) : (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-2">
              <p className="text-[12px] text-rose-800">
                {t.confirmTrashText(paper.fileName)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onTrashPaper(paper.relPath)}
                  className="px-3 py-1 rounded-lg text-[12px] font-medium bg-rose-600 text-white hover:bg-rose-700"
                >
                  {t.confirmTrashBtn}
                </button>
                <button
                  onClick={() => setConfirmTrash(false)}
                  className="px-3 py-1 rounded-lg text-[12px] text-stone-600 hover:bg-rose-100"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
