import React, { useEffect, useState } from 'react';
import { BookCheck, X } from 'lucide-react';
import type { I18nDict } from '../i18n';
import type { PdfPaper } from '../types';

interface TakeawayModalProps {
  t: I18nDict;
  paper: PdfPaper | null;
  onClose: () => void;
  onSave: (relPath: string, takeaway: string) => Promise<void>;
}

export const TakeawayModal: React.FC<TakeawayModalProps> = ({
  t,
  paper,
  onClose,
  onSave,
}) => {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (paper) setText(paper.takeaway || '');
  }, [paper]);

  if (!paper) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await onSave(paper.relPath, text.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/25 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[#FAF9F6] border border-[#E5E0D5] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4 border-b border-[#ECE8DF]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-amber-700 mb-1">
              <BookCheck className="w-3.5 h-3.5" />
              {paper.status === 'read' ? t.editTakeawayHeader : t.finishReadingHeader}
            </div>
            <h3 className="text-[14.5px] font-semibold text-stone-900 line-clamp-2">
              {paper.title}
            </h3>
            <div className="mt-0.5 text-[11.5px] font-mono text-stone-400 truncate">
              {paper.fileName}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12.5px] text-stone-600 mb-2">
              {t.takeawayPrompt}
            </label>
            <textarea
              autoFocus
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleSubmit();
                }
              }}
              placeholder={t.takeawayPlaceholder}
              className="w-full rounded-xl bg-white border border-[#E2DDD0] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 outline-none px-4 py-3 text-[13.5px] leading-relaxed text-stone-900 placeholder:text-stone-400 resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11.5px] text-stone-400">
              <kbd className="px-1.5 py-0.5 rounded bg-stone-200/70 text-stone-600 font-mono text-[10.5px]">⌘ Enter</kbd>{' '}
              {t.saveShortcut}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg text-[13px] text-stone-600 hover:bg-stone-200/60"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
              >
                {paper.status === 'read' ? t.saveTakeaway : t.saveAndMarkRead}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
