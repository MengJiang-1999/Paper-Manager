import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmConfig, MetadataLookupResult } from '../src/types';
import { extractPage1TextForLlm } from './metadata';

export const DEFAULT_BIBTEX_PROMPT =
  'Complete missing BibTeX fields (author, year, booktitle/journal, eprint, archivePrefix, doi, url) using the PDF first-page text. Always prefer the published conference/journal version (@inproceedings/@article) over an arXiv preprint (@misc): NEVER downgrade an existing @inproceedings/@article to @misc and NEVER delete existing booktitle/journal fields even if the PDF is an earlier arXiv preprint; if booktitle/journal has a publication year (e.g. ICML 2026), align year with it. Fix title typos, author format ("First Last and First Last"), and wrap title acronyms in {} (e.g. {LLM}). Output ONLY the corrected BibTeX.';

export function getEnvFilePath(): string {
  // Store .env in the app root (project directory in local runs) for easy inspection/editing
  const appRoot = app.getAppPath();
  if (appRoot.endsWith('.asar')) {
    return path.join(app.getPath('userData'), '.env');
  }
  return path.join(appRoot, '.env');
}

export function parseEnvText(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

export function serializeEnvConfig(cfg: Omit<LlmConfig, 'envPath'>): string {
  const escapedPrompt = (cfg.bibtexPrompt || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
  const lines = [
    '# Folio Optional LLM Metadata Enrichment Configuration',
    `LLM_ENABLED=${cfg.enabled ? 'true' : 'false'}`,
    `LLM_API_BASE=${cfg.apiBase.trim()}`,
    `LLM_API_KEY=${cfg.apiKey.trim()}`,
    `LLM_MODEL=${cfg.model.trim()}`,
    `LLM_BIBTEX_PROMPT="${escapedPrompt}"`,
    '',
  ];
  return lines.join('\n');
}

export async function loadLlmConfig(): Promise<LlmConfig> {
  const envPath = getEnvFilePath();
  let parsed: Record<string, string> = {};
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    parsed = parseEnvText(raw);
  } catch {
    // .env does not exist yet — defaults to disabled
  }

  const enabled = (parsed.LLM_ENABLED || '').toLowerCase() === 'true';
  const apiBase =
    parsed.LLM_API_BASE ||
    parsed.OPENAI_API_BASE ||
    parsed.OPENAI_BASE_URL ||
    'https://api.openai.com/v1';
  const apiKey = parsed.LLM_API_KEY || parsed.OPENAI_API_KEY || '';
  const model = parsed.LLM_MODEL || parsed.OPENAI_MODEL || 'gpt-4o-mini';
  const rawPrompt = parsed.LLM_BIBTEX_PROMPT
    ? parsed.LLM_BIBTEX_PROMPT.replace(/\\n/g, '\n').replace(/\\"/g, '"')
    : '';
  const bibtexPrompt = rawPrompt.trim() || DEFAULT_BIBTEX_PROMPT;

  return {
    enabled,
    apiBase,
    apiKey,
    model,
    bibtexPrompt,
    envPath,
  };
}

export async function saveLlmConfig(
  input: Pick<LlmConfig, 'enabled' | 'apiBase' | 'apiKey' | 'model' | 'bibtexPrompt'>
): Promise<LlmConfig> {
  const envPath = getEnvFilePath();
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, serializeEnvConfig(input), 'utf8');
  return loadLlmConfig();
}

export async function importEnvFile(sourcePath: string): Promise<LlmConfig> {
  const raw = await fs.readFile(sourcePath, 'utf8');
  const parsed = parseEnvText(raw);
  const current = await loadLlmConfig();

  const next = {
    enabled:
      parsed.LLM_ENABLED !== undefined
        ? parsed.LLM_ENABLED.toLowerCase() === 'true'
        : current.enabled,
    apiBase:
      parsed.LLM_API_BASE ||
      parsed.OPENAI_API_BASE ||
      parsed.OPENAI_BASE_URL ||
      current.apiBase,
    apiKey: parsed.LLM_API_KEY || parsed.OPENAI_API_KEY || current.apiKey,
    model: parsed.LLM_MODEL || parsed.OPENAI_MODEL || current.model,
    bibtexPrompt: parsed.LLM_BIBTEX_PROMPT
      ? parsed.LLM_BIBTEX_PROMPT.replace(/\\n/g, '\n').replace(/\\"/g, '"')
      : current.bibtexPrompt,
  };

  return saveLlmConfig(next);
}

function buildCompletionsUrl(apiBase: string): string {
  const trimmed = apiBase.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

export async function testLlmConnection(
  cfg: Pick<LlmConfig, 'apiBase' | 'apiKey' | 'model'>
): Promise<{ ok: boolean; message: string }> {
  if (!cfg.apiBase.trim()) return { ok: false, message: '请填写 API Base URL' };
  if (!cfg.model.trim()) return { ok: false, message: '请填写模型名称' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey.trim()) {
      headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    }

    const res = await fetch(buildCompletionsUrl(cfg.apiBase), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model.trim(),
        temperature: 0,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with OK' }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 140)}` };
    }
    return { ok: true, message: '连接成功，模型响应正常' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '连接失败',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function extractMetadataWithLlm(
  pageText: string,
  fileName: string
): Promise<MetadataLookupResult> {
  const cfg = await loadLlmConfig();
  if (!cfg.apiBase.trim() || !cfg.model.trim()) {
    throw new Error('请先在 LLM 配置中填写 API Base URL 和模型名称');
  }

  const prompt = [
    'You are an academic paper metadata extractor.',
    'Given the text from the first page of a PDF paper and its filename, extract accurate bibliographic metadata and return ONLY a valid JSON object (no markdown fences, no commentary).',
    'JSON schema:',
    '{',
    '  "title": "Full canonical paper title (string)",',
    '  "shortName": "Short acronym/system name if the paper clearly has one, e.g. ACON, FoldGRPO, SE-Agent, SWE-Pruner, DPO; otherwise empty string",',
    '  "team": "Primary research lab, company team, or university (concise, e.g. ByteDance Seed, Qwen, DeepSeek, Tsinghua, HKU, Stanford; max 2 joined by \' · \'; empty string if unknown)",',
    '  "authors": ["Author 1", "Author 2"],',
    '  "year": 2025,',
    '  "venue": "Conference/journal name (e.g. NeurIPS, ICLR, ICML, ACL) or arXiv, empty string if unknown",',
    '  "arxivId": "YYMM.NNNNN if present, else empty string"',
    '}',
    '',
    `Filename: ${fileName}`,
    '--- PDF Page 1 Text ---',
    pageText.slice(0, 4200),
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey.trim()) {
      headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    }

    const res = await fetch(buildCompletionsUrl(cfg.apiBase), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model.trim(),
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Return strictly valid JSON only. No markdown code blocks.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`LLM 请求失败 (${res.status}): ${errText.slice(0, 140)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 返回内容不是有效 JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      shortName?: string;
      team?: string;
      authors?: string[];
      year?: number | string | null;
      venue?: string;
      arxivId?: string;
    };

    const yearNum =
      typeof parsed.year === 'number'
        ? parsed.year
        : typeof parsed.year === 'string' && /^\d{4}$/.test(parsed.year.trim())
          ? Number.parseInt(parsed.year.trim(), 10)
          : null;

    return {
      title: parsed.title?.trim() || undefined,
      shortName: parsed.shortName?.trim() || undefined,
      team: parsed.team?.trim() || undefined,
      authors: Array.isArray(parsed.authors)
        ? parsed.authors.map((a) => String(a).trim()).filter(Boolean)
        : undefined,
      year: yearNum,
      venue: parsed.venue?.trim() || undefined,
      arxivId: parsed.arxivId?.trim() || undefined,
      url: parsed.arxivId?.trim()
        ? `https://arxiv.org/abs/${parsed.arxivId.trim()}`
        : undefined,
      source: 'llm',
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('LLM 请求超时（超过 90 秒），请检查网络或更换响应更快的模型');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callChatCompletionStream(
  cfg: Pick<LlmConfig, 'apiBase' | 'apiKey' | 'model'>,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  idleTimeoutMs = 90000
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleTimeoutMs);
  };
  resetIdleTimer();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey.trim()) {
      headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    }

    const res = await fetch(buildCompletionsUrl(cfg.apiBase), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model.trim(),
        temperature: 0,
        stream: true,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`LLM 核对请求失败 (${res.status}): ${errText.slice(0, 140)}`);
    }

    resetIdleTimer();

    const contentType = res.headers.get('content-type') || '';
    // Fallback if upstream ignores stream:true and returns plain JSON
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() || '';
    }

    // Parse SSE stream (data: {...}) and reset idle timer on every chunk
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return text.trim();
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let assembled = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdleTimer();
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string };
              message?: { content?: string };
            }>;
          };
          const piece =
            chunk.choices?.[0]?.delta?.content ??
            chunk.choices?.[0]?.message?.content ??
            '';
          if (piece) assembled += piece;
        } catch {
          // Ignore malformed keep-alive or partial SSE lines
        }
      }
    }

    return assembled.trim();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function splitBibtexBlocks(bibtex: string): string[] {
  const blocks: string[] = [];
  const regex = /@\w+\s*\{/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(bibtex)) !== null) {
    starts.push(m.index);
  }
  if (starts.length <= 1) return [bibtex.trim()].filter(Boolean);
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : bibtex.length;
    const block = bibtex.slice(start, end).trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

export async function reviewBibtexWithLlm(
  bibtex: string,
  customPrompt?: string,
  pdfAbsPaths: string[] = []
): Promise<{ bibtex: string; notes: string[] }> {
  const cfg = await loadLlmConfig();
  if (!cfg.enabled) {
    throw new Error('LLM 功能尚未启用，请先在左下角 LLM 配置中开启并保存 .env');
  }
  if (!cfg.apiBase.trim() || !cfg.model.trim()) {
    throw new Error('请先在 LLM 配置中填写 API Base URL 和模型名称');
  }

  const instruction = (customPrompt?.trim() || cfg.bibtexPrompt || DEFAULT_BIBTEX_PROMPT).trim();

  // Extract compact Page-1 header text for each selected PDF so the LLM has ground-truth authors, venue, arXiv ID, etc.
  const pdfSnippets: string[] = [];
  for (const absPath of pdfAbsPaths) {
    try {
      const text = await extractPage1TextForLlm(absPath);
      const abstractIdx = text.search(/\bAbstract\b/i);
      const header =
        abstractIdx > 0 ? text.slice(0, Math.min(abstractIdx, 1400)) : text.slice(0, 1400);
      pdfSnippets.push(`[File: ${path.basename(absPath)}]\n${header}`);
    } catch {
      pdfSnippets.push('');
    }
  }

  // Process 1 BibTeX entry per request with concurrency = 3 so each call stays small & fast
  const blocks = splitBibtexBlocks(bibtex);
  const alignedWithPdfs = pdfSnippets.length === blocks.length;
  const results = new Array<string>(blocks.length);
  const CONCURRENCY = 3;

  try {
    let cursor = 0;
    const runWorker = async () => {
      while (cursor < blocks.length) {
        const idx = cursor;
        cursor += 1;
        const singleBib = blocks[idx];
        const ctx = alignedWithPdfs ? pdfSnippets[idx] : '';
        const promptParts = [instruction, '', '--- Current BibTeX ---', singleBib];
        if (ctx) {
          promptParts.push('', '--- PDF Page 1 Reference Text ---', ctx);
        }
        const prompt = promptParts.join('\n');

        const rawContent = await callChatCompletionStream(
          cfg,
          [
            {
              role: 'system',
              content: 'Output ONLY valid BibTeX. No prose, no explanations, no markdown.',
            },
            { role: 'user', content: prompt },
          ],
          90000
        );

        const cleaned = rawContent
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/^```(?:bibtex|bib|tex)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        if (!/@\w+\s*\{/.test(cleaned)) {
          // Preserve original block if a single entry returned invalid output
          results[idx] = singleBib;
        } else {
          results[idx] = cleaned.slice(cleaned.indexOf('@')).trim();
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, blocks.length) },
      () => runWorker()
    );
    await Promise.all(workers);

    const finalBib = results.filter(Boolean).join('\n\n');
    const changed = finalBib.trim() !== bibtex.trim();
    return {
      bibtex: finalBib,
      notes: changed
        ? ['已完成核对，请在左侧双栏 Diff 中逐行检查差异']
        : ['核对完成，当前 BibTeX 无需修改'],
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('LLM 超过 90 秒无响应已超时，建议更换响应更快的模型后重试');
    }
    throw err;
  }
}
