import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  GitCompare,
  Loader2,
  PenLine,
  RotateCcw,
  Search,
  Sparkles,
  X,
  AlertCircle,
} from 'lucide-react';
import type { I18nDict } from '../i18n';
import type { LlmConfig, PdfPaper } from '../types';
import {
  auditBibtexCompleteness,
  computeSideBySideDiff,
  formatCitationsFromBibtex,
  generateBibtexFromPapers,
  type CitationFormat,
} from '../utils/citations';

const DEFAULT_BIBTEX_PROMPT =
  'Complete missing BibTeX fields (author, year, booktitle/journal, eprint, archivePrefix, doi, url) using the PDF first-page text. Always prefer the published conference/journal version (@inproceedings/@article) over an arXiv preprint (@misc): NEVER downgrade an existing @inproceedings/@article to @misc and NEVER delete existing booktitle/journal fields even if the PDF is an earlier arXiv preprint; if booktitle/journal has a publication year (e.g. ICML 2026), align year with it. Fix title typos, author format ("First Last and First Last"), and wrap title acronyms in {} (e.g. {LLM}). Output ONLY the corrected BibTeX.';

interface CitationExportModalProps {
  t: I18nDict;
  open: boolean;
  allPapers: PdfPaper[];
  currentViewPapers: PdfPaper[];
  llmConfig: LlmConfig | null;
  onLlmConfigSaved: (next: LlmConfig) => void;
  onClose: () => void;
  onOpenLlmSettings: () => void;
  onNotify: (msg: string) => void;
}

export const CitationExportModal: React.FC<CitationExportModalProps> = ({
  t,
  open,
  allPapers,
  currentViewPapers,
  llmConfig,
  onLlmConfigSaved,
  onClose,
  onOpenLlmSettings,
  onNotify,
}) => {
  const formatOptions: Array<{
    key: CitationFormat;
    label: string;
    desc: string;
    ext: string;
  }> = [
    { key: 'bibtex', label: 'BibTeX (.bib)', desc: t.formatBibDesc, ext: 'bib' },
    { key: 'gbt7714', label: t.formatGbtLabel, desc: t.formatGbtDesc, ext: 'txt' },
    { key: 'ieee', label: 'IEEE', desc: t.formatIeeeDesc, ext: 'txt' },
    { key: 'apa', label: 'APA 7th', desc: t.formatApaDesc, ext: 'txt' },
  ];
  const llmEnabled = Boolean(llmConfig?.enabled);
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [pickerScope, setPickerScope] = useState<'current' | 'read' | 'all'>('current');
  const [pickerSearch, setPickerSearch] = useState('');

  // BibTeX editing & LLM Diff state
  const [originalBib, setOriginalBib] = useState('');
  const [llmBib, setLlmBib] = useState<string | null>(null);
  const [llmNotes, setLlmNotes] = useState<string[]>([]);
  const [reviewingLlm, setReviewingLlm] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_BIBTEX_PROMPT);

  // Export state
  const [format, setFormat] = useState<CitationFormat>('bibtex');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('select');
    setPickerScope('current');
    setPickerSearch('');
    setLlmBib(null);
    setLlmNotes([]);
    setLlmError(null);
    setShowPromptEditor(false);
    setCustomPrompt(llmConfig?.bibtexPrompt || DEFAULT_BIBTEX_PROMPT);
    setFormat('bibtex');
    setCopied(false);
    // Pre-select read papers in current view if any, otherwise empty for deliberate selection
    const defaultSel = new Set(
      currentViewPapers.filter((p) => p.status === 'read').map((p) => p.relPath)
    );
    setSelectedPaths(defaultSel);
  }, [open, llmConfig?.bibtexPrompt]);

  const pickerPapers = useMemo(() => {
    const base =
      pickerScope === 'current'
        ? currentViewPapers
        : pickerScope === 'read'
          ? allPapers.filter((p) => p.status === 'read')
          : allPapers;

    const q = pickerSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) =>
      [p.shortName, p.title, p.team, p.venue, p.fileName, ...p.authors]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [allPapers, currentViewPapers, pickerScope, pickerSearch]);

  const activeBib = llmBib !== null ? llmBib : originalBib;

  const formattedOutput = useMemo(
    () => formatCitationsFromBibtex(activeBib, format),
    [activeBib, format]
  );

  const diffRows = useMemo(() => {
    if (llmBib === null) return [];
    return computeSideBySideDiff(originalBib, llmBib);
  }, [originalBib, llmBib]);

  const auditIssues = useMemo(() => auditBibtexCompleteness(activeBib), [activeBib]);

  if (!open) return null;

  const toggleSelect = (relPath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  };

  const handleProceedToReview = () => {
    const chosen = allPapers.filter((p) => selectedPaths.has(p.relPath));
    if (chosen.length === 0) return;
    const generated = generateBibtexFromPapers(chosen);
    setOriginalBib(generated);
    setLlmBib(null);
    setLlmNotes([]);
    setLlmError(null);
    setStep('review');
  };

  const handleRunLlmReview = async () => {
    if (!llmEnabled) {
      onOpenLlmSettings();
      return;
    }
    setReviewingLlm(true);
    setLlmError(null);
    try {
      const baseToReview = llmBib !== null ? llmBib : originalBib;
      const orderedSelectedPaths = allPapers
        .filter((p) => selectedPaths.has(p.relPath))
        .map((p) => p.relPath);
      const res = await window.folio.reviewBibtexWithLlm(
        baseToReview,
        customPrompt,
        orderedSelectedPaths
      );
      setLlmBib(res.bibtex);
      setLlmNotes(res.notes);
    } catch (err) {
      setLlmError(err instanceof Error ? err.message : 'LLM 检查失败');
    } finally {
      setReviewingLlm(false);
    }
  };

  const handleSavePromptToEnv = async () => {
    if (!llmConfig) return;
    const saved = await window.folio.saveLlmConfig({
      enabled: llmConfig.enabled,
      apiBase: llmConfig.apiBase,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      bibtexPrompt: customPrompt.trim() || DEFAULT_BIBTEX_PROMPT,
    });
    onLlmConfigSaved(saved);
    onNotify(t.toastPromptSaved);
  };

  const handleEditRightDiffLine = (rightLineNo: number, nextValue: string) => {
    if (llmBib === null) return;
    const lines = llmBib.split('\n');
    const idx = rightLineNo - 1;
    if (idx < 0 || idx >= lines.length) return;
    lines[idx] = nextValue;
    setLlmBib(lines.join('\n'));
  };

  const handleRightDiffKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    rightLineNo: number
  ) => {
    if (llmBib === null) return;
    const lines = llmBib.split('\n');
    const idx = rightLineNo - 1;
    if (e.key === 'Enter') {
      e.preventDefault();
      lines.splice(idx + 1, 0, '');
      setLlmBib(lines.join('\n'));
    } else if (e.key === 'Backspace' && lines[idx] === '' && lines.length > 1) {
      e.preventDefault();
      lines.splice(idx, 1);
      setLlmBib(lines.join('\n'));
    }
  };

  const handleAcceptLlm = () => {
    if (llmBib === null) return;
    setOriginalBib(llmBib);
    setLlmBib(null);
    setLlmNotes([]);
    onNotify(t.toastAcceptedLlm);
  };

  const handleDiscardLlm = () => {
    setLlmBib(null);
    setLlmNotes([]);
    setLlmError(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formattedOutput);
    setCopied(true);
    onNotify(t.toastCopied);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveFile = async () => {
    const opt = formatOptions.find((f) => f.key === format) || formatOptions[0];
    const defaultName =
      format === 'bibtex' ? 'references.bib' : `references_${format}.${opt.ext}`;
    const res = await window.folio.saveTextFile(defaultName, formattedOutput, opt.ext);
    if (res.ok) {
      onNotify(t.toastExported(res.filePath?.split('/').pop() || defaultName));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/35 backdrop-blur-[2px] flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        className={`w-full ${
          step === 'review' ? 'max-w-6xl h-[84vh]' : 'max-w-3xl h-[76vh]'
        } rounded-2xl bg-[#FAF9F6] border border-[#E5E0D5] shadow-2xl flex flex-col overflow-hidden transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="px-5 py-3.5 border-b border-[#EAE6DC] bg-[#F5F3ED] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {step === 'review' && (
              <button
                onClick={() => setStep('select')}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-600 hover:text-stone-900 px-2 py-1 rounded-md hover:bg-stone-200/60 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t.reselectPapers}
              </button>
            )}
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-amber-700" />
              <h2 className="text-[14.5px] font-semibold text-stone-900">
                {step === 'select'
                  ? t.exportSelectTitle
                  : t.exportReviewTitle(selectedPaths.size)}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* STEP 1: Paper Picker */}
        {step === 'select' ? (
          <>
            <div className="px-5 py-3 border-b border-[#EFECE4] bg-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#F2EFE8]">
                {(
                  [
                    ['current', t.scopeCurrent(currentViewPapers.length)],
                    ['read', t.scopeRead(allPapers.filter((p) => p.status === 'read').length)],
                    ['all', t.scopeAll(allPapers.length)],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setPickerScope(k)}
                    className={`px-2.5 py-1 rounded-md text-[12px] transition-colors ${
                      pickerScope === k
                        ? 'bg-white text-stone-900 font-medium shadow-sm'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-52">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder={t.filterPapersPlaceholder}
                    className="w-full rounded-lg bg-[#F2EFE8] focus:bg-white border border-transparent focus:border-[#D6CFC0] outline-none pl-8 pr-2.5 py-1 text-[12px]"
                  />
                </div>
                <button
                  onClick={() => {
                    const next = new Set(selectedPaths);
                    for (const p of pickerPapers) next.add(p.relPath);
                    setSelectedPaths(next);
                  }}
                  className="text-[12px] text-stone-600 hover:text-stone-900 px-2 py-1 rounded hover:bg-stone-100"
                >
                  {t.selectAll}
                </button>
                <button
                  onClick={() => setSelectedPaths(new Set())}
                  className="text-[12px] text-stone-500 hover:text-stone-900 px-2 py-1 rounded hover:bg-stone-100"
                >
                  {t.clear}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#F0EDE5] bg-white">
              {pickerPapers.map((p) => {
                const checked = selectedPaths.has(p.relPath);
                return (
                  <label
                    key={p.relPath}
                    className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
                      checked ? 'bg-[#FAF6EC]/70' : 'hover:bg-[#FAF8F3]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(p.relPath)}
                      className="w-4 h-4 rounded accent-stone-900 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.shortName && (
                          <span className="text-[11px] font-semibold bg-[#EFECE3] border border-[#DFD9CB] text-stone-800 px-1.5 py-0.5 rounded shrink-0">
                            {p.shortName}
                          </span>
                        )}
                        <span className="text-[13px] font-medium text-stone-900 truncate">
                          {p.title}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-400">
                        {p.status === 'read' && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            {t.read}
                          </span>
                        )}
                        {p.team && <span className="text-indigo-600">{p.team}</span>}
                        {p.authors.length > 0 && (
                          <span className="truncate max-w-[200px]">
                            {p.authors[0]}
                            {p.authors.length > 1 ? ' et al.' : ''}
                          </span>
                        )}
                        {(p.venue || p.year) && (
                          <span>{[p.venue, p.year].filter(Boolean).join(' ')}</span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
              {pickerPapers.length === 0 && (
                <div className="py-16 text-center text-[13px] text-stone-400">
                  {t.noMatchingPapers}
                </div>
              )}
            </div>

            <footer className="px-5 py-3 border-t border-[#EAE6DC] bg-[#F5F3ED] flex items-center justify-between shrink-0">
              <span className="text-[12.5px] text-stone-600">
                {t.selectedCount(selectedPaths.size)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-lg text-[12.5px] text-stone-600 hover:bg-stone-200/60"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleProceedToReview}
                  disabled={selectedPaths.size === 0}
                  className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-45 transition-colors"
                >
                  {t.nextStepReview}
                </button>
              </div>
            </footer>
          </>
        ) : (
          /* STEP 2: Two-Pane Review & Export Workspace */
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* LEFT PANE: BibTeX Editor OR VS Code Side-by-Side Diff */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-[#E7E3D9] bg-white">
              {/* Left Toolbar */}
              <div className="px-4 py-2 border-b border-[#EFECE4] bg-[#FAF9F6] flex items-center justify-between gap-2 shrink-0">
                {llmBib === null ? (
                  <>
                    <span className="text-[12px] font-medium text-stone-600 flex items-center gap-1.5">
                      <PenLine className="w-3.5 h-3.5 text-stone-400" />
                      {t.bibEditorHint}
                    </span>
                    <span className="text-[11px] font-mono text-stone-400">
                      {t.linesCount(originalBib.split('\n').length)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      <GitCompare className="w-3 h-3" />
                      {t.diffHeaderBadge}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleDiscardLlm}
                        className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded text-stone-600 hover:bg-stone-200/70"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t.revertOriginal}
                      </button>
                      <button
                        onClick={handleAcceptLlm}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800"
                      >
                        <Check className="w-3 h-3" />
                        {t.acceptChanges}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Left Body */}
              {llmBib === null ? (
                <textarea
                  value={originalBib}
                  onChange={(e) => setOriginalBib(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full p-4 font-mono text-[12.5px] leading-relaxed text-stone-800 bg-white outline-none resize-none"
                />
              ) : (
                /* VS Code Style Side-by-Side Diff View (Right pane directly editable) */
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <div className="grid grid-cols-2 border-b border-[#ECE8DF] bg-[#F6F4EE] text-[11px] font-medium text-stone-500 shrink-0">
                    <div className="px-3 py-1.5 border-r border-[#E7E3D9]">
                      {t.diffLeftTitle}
                    </div>
                    <div className="px-3 py-1.5 text-emerald-800">
                      {t.diffRightTitle}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto font-mono text-[12px] leading-[1.6]">
                    {diffRows.map((row, idx) => {
                      const leftBg =
                        row.type === 'delete' || row.type === 'replace'
                          ? 'bg-rose-50/90 text-rose-950'
                          : row.type === 'insert'
                            ? 'bg-stone-50/70 text-stone-300'
                            : 'bg-white text-stone-700';
                      const rightBg =
                        row.type === 'insert' || row.type === 'replace'
                          ? 'bg-emerald-50/90 text-emerald-950'
                          : row.type === 'delete'
                            ? 'bg-stone-50/70 text-stone-300'
                            : 'bg-white text-stone-700';

                      return (
                        <div
                          key={idx}
                          className="grid grid-cols-2 border-b border-stone-100/80"
                        >
                          {/* Left side (read-only original) */}
                          <div className={`flex border-r border-[#E7E3D9] min-w-0 ${leftBg}`}>
                            <span className="w-9 shrink-0 select-none text-right pr-2 text-[10.5px] text-stone-400 border-r border-stone-200/60">
                              {row.leftLineNo ?? ''}
                            </span>
                            <span className="w-4 shrink-0 select-none text-center text-rose-500 font-bold">
                              {row.type === 'delete' || row.type === 'replace' ? '-' : ''}
                            </span>
                            <pre className="flex-1 px-1.5 whitespace-pre-wrap break-all m-0">
                              {row.leftText || ' '}
                            </pre>
                          </div>

                          {/* Right side (directly editable like VS Code Diff) */}
                          <div className={`flex min-w-0 ${rightBg}`}>
                            <span className="w-9 shrink-0 select-none text-right pr-2 text-[10.5px] text-stone-400 border-r border-stone-200/60">
                              {row.rightLineNo ?? ''}
                            </span>
                            <span className="w-4 shrink-0 select-none text-center text-emerald-600 font-bold">
                              {row.type === 'insert' || row.type === 'replace' ? '+' : ''}
                            </span>
                            {row.rightLineNo !== null ? (
                              <textarea
                                rows={Math.max(1, Math.ceil((row.rightText.length || 1) / 44))}
                                value={row.rightText}
                                spellCheck={false}
                                onChange={(e) =>
                                  handleEditRightDiffLine(
                                    row.rightLineNo!,
                                    e.target.value.replace(/\r?\n/g, ' ')
                                  )
                                }
                                onKeyDown={(e) =>
                                  handleRightDiffKeyDown(e, row.rightLineNo!)
                                }
                                className="flex-1 min-w-0 px-1.5 bg-transparent outline-none focus:bg-white/80 font-mono text-[12px] leading-[1.6] resize-none overflow-hidden break-all"
                              />
                            ) : (
                              <span className="flex-1 px-1.5">&nbsp;</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT PANE: LLM Check (Top) + Format & Export Options */}
            <aside className="w-[320px] shrink-0 bg-[#FAF9F6] flex flex-col overflow-y-auto p-4 space-y-4">
              {/* Top Module: Optional LLM Rigorous Audit */}
              <section className="rounded-xl bg-white border border-[#E7E3D9] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-stone-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    {t.llmReviewTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPromptEditor((v) => !v)}
                    className="text-[11px] text-stone-500 hover:text-stone-900 underline underline-offset-2"
                  >
                    {showPromptEditor ? t.collapsePrompt : t.editPrompt}
                  </button>
                </div>

                {showPromptEditor ? (
                  <div className="space-y-1.5">
                    <textarea
                      rows={4}
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      className="w-full rounded-lg bg-[#FAF9F6] border border-[#E2DDD0] focus:border-amber-500 outline-none p-2 text-[11.5px] leading-relaxed text-stone-800 resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setCustomPrompt(DEFAULT_BIBTEX_PROMPT)}
                        className="text-[11px] text-stone-400 hover:text-stone-700"
                      >
                        {t.restoreDefault}
                      </button>
                      <button
                        type="button"
                        onClick={handleSavePromptToEnv}
                        className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#EFECE3] text-stone-800 hover:bg-[#E5E0D5]"
                      >
                        {t.saveToEnv}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11.5px] text-stone-500 leading-relaxed">
                    {t.llmReviewDesc}
                  </p>
                )}

                <button
                  onClick={handleRunLlmReview}
                  disabled={reviewingLlm}
                  className={`w-full py-2 rounded-lg text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                    llmEnabled
                      ? 'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60'
                      : 'bg-[#F2EFE8] text-stone-700 hover:bg-[#E7E2D6]'
                  }`}
                >
                  {reviewingLlm ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t.llmReviewing}
                    </>
                  ) : llmEnabled ? (
                    <>
                      <GitCompare className="w-3.5 h-3.5" />
                      {llmBib !== null ? t.llmReReview : t.llmStartReview}
                    </>
                  ) : (
                    t.goConfigLlm
                  )}
                </button>

                {llmError && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-2 text-[11.5px] text-rose-800 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{llmError}</span>
                  </div>
                )}

                {llmNotes.length > 0 && (
                  <div className="pt-2 border-t border-[#F0EDE5] space-y-1">
                    <div className="text-[11px] font-medium text-stone-500">{t.reviewNotesLabel}</div>
                    <ul className="space-y-1 text-[11.5px] text-stone-700 list-disc pl-4">
                      {llmNotes.map((n, i) => (
                        <li key={i} className="leading-snug">
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* Completeness Audit Warning Card (real-time, 0 tokens) */}
              <section
                className={`rounded-xl border p-3 space-y-2 ${
                  auditIssues.length === 0
                    ? 'bg-emerald-50/70 border-emerald-200/80'
                    : 'bg-amber-50/80 border-amber-200/90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[12px] font-semibold flex items-center gap-1.5 ${
                      auditIssues.length === 0 ? 'text-emerald-800' : 'text-amber-900'
                    }`}
                  >
                    {auditIssues.length === 0 ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.fieldsComplete}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        {t.fieldsIncomplete(auditIssues.length)}
                      </>
                    )}
                  </span>
                </div>

                {auditIssues.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {auditIssues.map((item) => (
                      <div
                        key={item.key}
                        className="text-[11px] leading-snug bg-white/80 rounded-lg px-2 py-1.5 border border-amber-200/60"
                      >
                        <div className="font-mono font-semibold text-stone-800 truncate">
                          {item.key}{' '}
                          <span className="font-normal text-stone-400">(@{item.type})</span>
                        </div>
                        {item.missingRequired.length > 0 && (
                          <div className="text-rose-700 mt-0.5">
                            {t.missingRequired}
                            {item.missingRequired.join(', ')}
                          </div>
                        )}
                        {item.missingRecommended.length > 0 && (
                          <div className="text-amber-800 mt-0.5">
                            {t.missingRecommended}
                            {item.missingRecommended.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Middle Module: Citation Format Selection */}
              <section className="space-y-2">
                <div className="text-[11.5px] font-medium text-stone-500">{t.exportFormatLabel}</div>
                <div className="space-y-1.5">
                  {formatOptions.map((opt) => {
                    const active = format === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setFormat(opt.key)}
                        className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                          active
                            ? 'bg-white border-stone-800 ring-1 ring-stone-800/15 shadow-sm'
                            : 'bg-white/60 border-[#E7E3D9] hover:bg-white'
                        }`}
                      >
                        <div className="text-[12.5px] font-medium text-stone-900">
                          {opt.label}
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Live Preview when non-BibTeX format is selected */}
              {format !== 'bibtex' && (
                <section className="space-y-1.5 flex-1 flex flex-col min-h-[120px]">
                  <div className="text-[11.5px] font-medium text-stone-500">
                    {t.previewLabel}
                  </div>
                  <div className="flex-1 rounded-xl bg-white border border-[#E7E3D9] p-3 text-[11.5px] leading-relaxed text-stone-700 overflow-y-auto whitespace-pre-wrap select-text">
                    {formattedOutput || t.invalidBibPreview}
                  </div>
                </section>
              )}

              {/* Bottom Module: Copy & Export Actions */}
              <div className="pt-2 mt-auto space-y-2 border-t border-[#EAE6DC]">
                <button
                  onClick={handleCopy}
                  disabled={!formattedOutput.trim()}
                  className="w-full py-2 rounded-xl text-[12.5px] font-medium bg-[#F0EDE5] text-stone-800 hover:bg-[#E5E0D5] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      {t.copiedBtn}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {format === 'bibtex' ? t.copyBibBtn : t.copyRefBtn}
                    </>
                  )}
                </button>
                <button
                  onClick={handleSaveFile}
                  disabled={!formattedOutput.trim()}
                  className="w-full py-2 rounded-xl text-[12.5px] font-medium bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.exportFileBtn}
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
