import React from 'react';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Folder,
  FolderSearch,
  PenLine,
  Quote,
} from 'lucide-react';
import type { I18nDict } from '../i18n';
import type { PdfPaper } from '../types';

interface PaperRowProps {
  t: I18nDict;
  paper: PdfPaper;
  selected: boolean;
  showFolderBadge: boolean;
  onSelect: () => void;
  onOpenPdf: () => void;
  onRevealPdf: () => void;
  onOpenTakeaway: () => void;
  onTagClick: (tag: string) => void;
  onTeamClick: (team: string) => void;
  onFolderClick: (folderRelPath: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function formatAuthors(authors: string[]): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]} et al.`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatVenueYear(venue: string, year: number | null): string {
  const v = venue.trim();
  if (!v) return year ? String(year) : '';
  if (!year) return v;
  // Avoid "NeurIPS 2026 2026" when venue already contains the year
  if (v.includes(String(year))) return v;
  return `${v} ${year}`;
}

export const PaperRow: React.FC<PaperRowProps> = ({
  t,
  paper,
  selected,
  showFolderBadge,
  onSelect,
  onOpenPdf,
  onRevealPdf,
  onOpenTakeaway,
  onTagClick,
  onTeamClick,
  onFolderClick,
  onContextMenu,
}) => {
  const isRead = paper.status === 'read';
  const authorsStr = formatAuthors(paper.authors);
  const venueYear = formatVenueYear(paper.venue, paper.year);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-folio-paper', paper.relPath);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onSelect}
      onDoubleClick={onOpenPdf}
      onContextMenu={onContextMenu}
      className={`group px-4 py-3 border-b border-[#EFECE4] transition-colors cursor-default select-none ${
        selected
          ? 'bg-[#F4F0E6]/90'
          : 'bg-white hover:bg-[#FAF8F3]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* PDF / Read Status Icon */}
        <div className="pt-0.5 shrink-0">
          {isRead ? (
            <div
              title={t.read}
              className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div
              title={t.unread}
              className="w-6 h-6 rounded-md bg-rose-50/80 border border-rose-200/60 text-rose-500 flex items-center justify-center"
            >
              <FileText className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Center Content */}
        <div className="min-w-0 flex-1">
          {/* Row 1: Single-line ShortName + Full Title (never wraps awkwardly) */}
          <div className="flex items-center gap-2 min-w-0">
            {paper.shortName && (
              <span className="inline-flex items-center text-[11.5px] font-semibold tracking-tight text-stone-800 bg-[#EFECE3] border border-[#DFD9CB] px-1.5 py-0.5 rounded-md shrink-0">
                {paper.shortName}
              </span>
            )}
            <h3
              title={paper.title}
              className="text-[14px] font-medium text-stone-900 leading-snug truncate min-w-0"
            >
              {paper.title}
            </h3>
          </div>

          {/* Row 2: Unified compact metadata strip (Team, Venue/Year, Authors, File, Folder, Tags) */}
          <div className="mt-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap text-[11.5px] text-stone-400">
            {paper.team && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTeamClick(paper.team);
                }}
                title={t.filterByTeam(paper.team)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50/90 border border-indigo-200/70 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors shrink-0"
              >
                <Building2 className="w-2.5 h-2.5 opacity-75" />
                {paper.team}
              </button>
            )}
            {venueYear && (
              <span className="text-[11px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">
                {venueYear}
              </span>
            )}
            {authorsStr && <span className="text-stone-500 truncate max-w-[180px]">{authorsStr}</span>}
            <span className="font-mono text-[11px] truncate max-w-[220px]" title={paper.fileName}>
              {paper.fileName}
            </span>
            <span className="shrink-0">{formatSize(paper.sizeBytes)}</span>

            {showFolderBadge && paper.folderRelPath && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFolderClick(paper.folderRelPath);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-stone-500 bg-[#F2EFE8] hover:bg-[#E7E2D6] px-1.5 py-0.5 rounded transition-colors shrink-0"
              >
                <Folder className="w-2.5 h-2.5" />
                {paper.folderRelPath}
              </button>
            )}

            {paper.tags.map((tag) => (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(tag);
                }}
                className="text-[11px] text-stone-500 hover:text-stone-900 hover:underline shrink-0"
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* Row 3: The Hero Takeaway (What this paper did!) */}
          {paper.takeaway ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onOpenTakeaway();
              }}
              title={t.editTakeawayHint}
              className="mt-2 rounded-md bg-[#FAF6EC] border-l-2 border-amber-500/80 px-3 py-1.5 flex items-start gap-2 group/note hover:bg-[#F6EEDC] transition-colors cursor-pointer"
            >
              <Quote className="w-3 h-3 text-amber-600/70 shrink-0 mt-1" />
              <p className="text-[13px] leading-relaxed text-stone-800 whitespace-pre-wrap flex-1">
                {paper.takeaway}
              </p>
              <PenLine className="w-3 h-3 text-amber-700/60 shrink-0 mt-1 opacity-0 group-hover/note:opacity-100 transition-opacity" />
            </div>
          ) : isRead ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenTakeaway();
              }}
              className="mt-2 text-[12px] text-amber-700/80 hover:text-amber-800 hover:underline"
            >
              {t.addTakeawayPrompt}
            </button>
          ) : null}
        </div>

        {/* Right Actions */}
        <div
          className="flex items-center gap-1 shrink-0 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {!isRead && (
            <button
              onClick={onOpenTakeaway}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100 transition-colors"
              title={t.writeTakeawayTitle}
            >
              <PenLine className="w-3 h-3" />
              {t.writeTakeawayRead}
            </button>
          )}
          <button
            onClick={onOpenPdf}
            title={t.openPdfTooltip}
            className="p-1.5 rounded-md text-stone-400 hover:text-stone-800 hover:bg-stone-200/60 opacity-0 group-hover:opacity-100 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRevealPdf}
            title={t.revealInFinder}
            className="p-1.5 rounded-md text-stone-400 hover:text-stone-800 hover:bg-stone-200/60 opacity-0 group-hover:opacity-100 transition-all"
          >
            <FolderSearch className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
