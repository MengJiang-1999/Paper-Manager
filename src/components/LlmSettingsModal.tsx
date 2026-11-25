import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  FolderSearch,
  Globe,
  Loader2,
  Settings,
  X,
} from 'lucide-react';
import type { I18nDict, Locale } from '../i18n';
import type { LlmConfig } from '../types';

interface LlmSettingsModalProps {
  t: I18nDict;
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
  open: boolean;
  config: LlmConfig | null;
  onClose: () => void;
  onSaved: (next: LlmConfig) => void;
}

const PRESETS = [
  { label: 'OpenAI', apiBase: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', apiBase: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Qwen', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'OpenRouter', apiBase: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { label: 'Ollama', apiBase: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
];

const DEFAULT_PROMPT =
  'Complete missing BibTeX fields (author, year, booktitle/journal, eprint, archivePrefix, doi, url) using the PDF first-page text. Always prefer the published conference/journal version (@inproceedings/@article) over an arXiv preprint (@misc): NEVER downgrade an existing @inproceedings/@article to @misc and NEVER delete existing booktitle/journal fields even if the PDF is an earlier arXiv preprint; if booktitle/journal has a publication year (e.g. ICML 2026), align year with it. Fix title typos, author format ("First Last and First Last"), and wrap title acronyms in {} (e.g. {LLM}). Output ONLY the corrected BibTeX.';

export const LlmSettingsModal: React.FC<LlmSettingsModalProps> = ({
  t,
  locale,
  onLocaleChange,
  open,
  config,
  onClose,
  onSaved,
}) => {
  const [enabled, setEnabled] = useState(false);
  const [apiBase, setApiBase] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [bibtexPrompt, setBibtexPrompt] = useState(DEFAULT_PROMPT);
  const [envPath, setEnvPath] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    if (config) {
      setEnabled(config.enabled);
      setApiBase(config.apiBase);
      setApiKey(config.apiKey);
      setModel(config.model);
      setBibtexPrompt(config.bibtexPrompt || DEFAULT_PROMPT);
      setEnvPath(config.envPath);
    }
  }, [open, config]);

  if (!open) return null;

  const handleImportEnv = async () => {
    const imported = await window.folio.importEnvFile();
    if (!imported) return;
    setEnabled(imported.enabled);
    setApiBase(imported.apiBase);
    setApiKey(imported.apiKey);
    setModel(imported.model);
    setBibtexPrompt(imported.bibtexPrompt || DEFAULT_PROMPT);
    setEnvPath(imported.envPath);
    onSaved(imported);
    setTestResult({ ok: true, message: t.envImportedMsg });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await window.folio.testLlmConnection({ apiBase, apiKey, model });
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await window.folio.saveLlmConfig({
        enabled,
        apiBase,
        apiKey,
        model,
        bibtexPrompt: bibtexPrompt.trim() || DEFAULT_PROMPT,
      });
      setEnvPath(saved.envPath);
      onSaved(saved);
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
        className="w-full max-w-lg rounded-2xl bg-[#FAF9F6] border border-[#E5E0D5] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#ECE8DF] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-600" />
            <h3 className="text-[15px] font-semibold text-stone-900">
              {t.settingsTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Language Switcher */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-[#E7E3D9]">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-stone-900 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-stone-500" />
                {t.languageSection}
              </div>
              <div className="text-[11.5px] text-stone-400 mt-0.5">
                {t.languageDesc}
              </div>
            </div>
            <div className="flex items-center p-0.5 rounded-lg bg-[#F2EFE8] shrink-0 text-[12px]">
              <button
                type="button"
                onClick={() => onLocaleChange('zh')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  locale === 'zh'
                    ? 'bg-white text-stone-900 font-medium shadow-sm'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => onLocaleChange('en')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  locale === 'en'
                    ? 'bg-white text-stone-900 font-medium shadow-sm'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-[#E7E3D9]">
            <div>
              <div className="text-[13px] font-medium text-stone-900">
                {t.enableLlmTitle}
              </div>
              <div className="text-[11.5px] text-stone-400 mt-0.5">
                {t.enableLlmDesc}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                enabled ? 'bg-amber-600' : 'bg-stone-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                  enabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-stone-500">{t.presetsLabel}</span>
              <button
                type="button"
                onClick={handleImportEnv}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-700 hover:text-amber-800"
              >
                <FileUp className="w-3 h-3" />
                {t.importEnvBtn}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setApiBase(p.apiBase);
                    setModel(p.model);
                  }}
                  className="text-[11.5px] px-2 py-0.5 rounded-md bg-[#EFECE3] text-stone-700 hover:bg-[#E5E0D5] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11.5px] text-stone-500 mb-1">
                {t.apiBaseLabel} <span className="font-mono text-[10.5px] text-stone-400">(LLM_API_BASE)</span>
              </label>
              <input
                type="text"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-lg bg-white border border-[#E2DDD0] focus:border-stone-400 outline-none px-3 py-1.5 text-[12.5px] font-mono text-stone-800"
              />
            </div>

            <div>
              <label className="block text-[11.5px] text-stone-500 mb-1">
                {t.apiKeyLabel} <span className="font-mono text-[10.5px] text-stone-400">(LLM_API_KEY)</span>
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg bg-white border border-[#E2DDD0] focus:border-stone-400 outline-none pl-3 pr-9 py-1.5 text-[12.5px] font-mono text-stone-800"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11.5px] text-stone-500 mb-1">
                {t.modelLabel} <span className="font-mono text-[10.5px] text-stone-400">(LLM_MODEL)</span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini / deepseek-chat / qwen-plus"
                className="w-full rounded-lg bg-white border border-[#E2DDD0] focus:border-stone-400 outline-none px-3 py-1.5 text-[12.5px] font-mono text-stone-800"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11.5px] text-stone-500">
                  {t.promptLabel} <span className="font-mono text-[10.5px] text-stone-400">(LLM_BIBTEX_PROMPT)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setBibtexPrompt(DEFAULT_PROMPT)}
                  className="text-[11px] text-stone-400 hover:text-stone-700"
                >
                  {t.restoreDefault}
                </button>
              </div>
              <textarea
                rows={3}
                value={bibtexPrompt}
                onChange={(e) => setBibtexPrompt(e.target.value)}
                className="w-full rounded-lg bg-white border border-[#E2DDD0] focus:border-stone-400 outline-none px-3 py-2 text-[12px] leading-relaxed text-stone-800 resize-none"
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`rounded-lg px-3 py-2 text-[12px] flex items-center gap-2 ${
                testResult.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{testResult.message}</span>
            </div>
          )}

          {/* .env Path Info */}
          {envPath && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-stone-400 pt-1">
              <span className="truncate font-mono" title={envPath}>
                {t.savePathPrefix}
                {envPath.replace(/^\/Users\/[^/]+/, '~')}
              </span>
              <button
                type="button"
                onClick={() => window.folio.revealEnvFile()}
                className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-800 shrink-0"
              >
                <FolderSearch className="w-3 h-3" />
                Finder
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#ECE8DF]">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-stone-700 bg-[#F0EDE5] hover:bg-[#E5E0D5] disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t.testConnection}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg text-[12.5px] text-stone-600 hover:bg-stone-200/60"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {t.saveToEnv}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
