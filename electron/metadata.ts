import fs from 'node:fs/promises';
import path from 'node:path';
import type { MetadataLookupResult } from '../src/types';

const ARXIV_REGEX = /(?:arxiv[:\s/]*|^|[^0-9])(\d{4}\.\d{4,5})(?:v\d+)?(?![0-9])/i;
const DOI_REGEX = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;

// Well-known AI / CS labs, teams, and universities (ordered from more specific to general)
const TEAM_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'ByteDance Seed', regex: /\bByteDance\s+Seed\b|\bSeed\s+Team\b/i },
  { label: 'ByteDance', regex: /\bByteDance\b|@bytedance\.com/i },
  { label: 'Qwen', regex: /\bQwen\s*Team\b|\bTongyi\s*Lab\b/i },
  { label: 'Alibaba', regex: /\bAlibaba(?:\s+Group|\s+Cloud|\s+DAMO)?\b|\bDAMO\s+Academy\b|@alibaba-inc\.com/i },
  { label: 'DeepSeek', regex: /\bDeepSeek(?:-AI)?\b|@deepseek\.com/i },
  { label: 'Google DeepMind', regex: /\bGoogle\s+DeepMind\b|\bDeepMind\b|@deepmind\.com/i },
  { label: 'Google', regex: /\bGoogle\s+Research\b|\bGoogle\s+Cloud\b|@google\.com/i },
  { label: 'OpenAI', regex: /\bOpenAI\b|@openai\.com/i },
  { label: 'Anthropic', regex: /\bAnthropic\b|@anthropic\.com/i },
  { label: 'Meta', regex: /\bMeta\s+AI\b|\bMeta\s+Superintelligence\b|\bFAIR\b|@meta\.com/i },
  { label: 'Microsoft', regex: /\bMicrosoft\s+Research\b|\bMicrosoft\b|@microsoft\.com/i },
  { label: 'NVIDIA', regex: /\bNVIDIA\b|@nvidia\.com/i },
  { label: 'Apple', regex: /\bApple\b|@apple\.com/i },
  { label: 'Amazon', regex: /\bAmazon\s+Science\b|\bAWS\s+AI\b|@amazon\.com/i },
  { label: 'Tencent', regex: /\bTencent\b|\bHunyuan\b|@tencent\.com/i },
  { label: 'Huawei', regex: /\bHuawei\b|\bNoah'?s\s+Ark\b|@huawei\.com/i },
  { label: 'Zhipu AI', regex: /\bZhipu\s*AI\b|\bZ\.ai\b/i },
  { label: 'Moonshot AI', regex: /\bMoonshot\s*AI\b|\bKimi\b/i },
  { label: 'MiniMax', regex: /\bMiniMax\b/i },
  { label: 'StepFun', regex: /\bStepFun\b/i },
  { label: 'Shanghai AI Lab', regex: /\bShanghai\s+AI\s+Lab(?:oratory)?\b/i },
  { label: 'BAAI', regex: /\bBAAI\b|\bBeijing\s+Academy\s+of\s+Artificial\s+Intelligence\b/i },
  { label: 'AI2', regex: /\bAllen\s+Institute\s+for\s+AI\b|\bAllenAI\b/i },
  { label: 'Hugging Face', regex: /\bHugging\s*Face\b/i },
  { label: 'Stanford', regex: /\bStanford\s+University\b|@stanford\.edu/i },
  { label: 'MIT', regex: /\bMassachusetts\s+Institute\s+of\s+Technology\b|\bMIT\s+CSAIL\b|@mit\.edu/i },
  { label: 'CMU', regex: /\bCarnegie\s+Mellon\s+University\b|\bCMU\b|@cs\.cmu\.edu|@cmu\.edu/i },
  { label: 'UC Berkeley', regex: /\bUC\s+Berkeley\b|\bUniversity\s+of\s+California,?\s+Berkeley\b|@berkeley\.edu/i },
  { label: 'Princeton', regex: /\bPrinceton\s+University\b|@princeton\.edu/i },
  { label: 'Cornell', regex: /\bCornell\s+University\b|@cornell\.edu/i },
  { label: 'UW', regex: /\bUniversity\s+of\s+Washington\b|@cs\.washington\.edu/i },
  { label: 'UIUC', regex: /\bUIUC\b|\bUniversity\s+of\s+Illinois\s+Urbana/i },
  { label: 'ETH Zurich', regex: /\bETH\s+Z[uü]rich\b/i },
  { label: 'Oxford', regex: /\bUniversity\s+of\s+Oxford\b/i },
  { label: 'Cambridge', regex: /\bUniversity\s+of\s+Cambridge\b/i },
  { label: 'KAIST', regex: /\bKAIST\b|@kaist\.ac\.kr/i },
  { label: 'Tsinghua', regex: /\bTsinghua\s+University\b|@tsinghua\.edu\.cn|@mails\.tsinghua/i },
  { label: 'PKU', regex: /\bPeking\s+University\b|@pku\.edu\.cn/i },
  { label: 'SJTU', regex: /\bShanghai\s+Jiao\s+Tong\s+University\b|\bSJTU\b|@sjtu\.edu\.cn/i },
  { label: 'Fudan', regex: /\bFudan\s+University\b|@fudan\.edu\.cn/i },
  { label: 'ZJU', regex: /\bZhejiang\s+University\b|@zju\.edu\.cn/i },
  { label: 'USTC', regex: /\bUniversity\s+of\s+Science\s+and\s+Technology\s+of\s+China\b|\bUSTC\b|@ustc\.edu\.cn/i },
  { label: 'NJU', regex: /\bNanjing\s+University\b|@nju\.edu\.cn/i },
  { label: 'RUC', regex: /\bRenmin\s+University\s+of\s+China\b|@ruc\.edu\.cn/i },
  { label: 'CAS', regex: /\bChinese\s+Academy\s+of\s+Sciences\b/i },
  { label: 'CUHK', regex: /\bChinese\s+University\s+of\s+Hong\s+Kong\b|\bCUHK\b/i },
  { label: 'HKU', regex: /\bUniversity\s+of\s+Hong\s+Kong\b|\bHKU\b/i },
  { label: 'HKUST', regex: /\bHKUST\b|\bHong\s+Kong\s+University\s+of\s+Science\s+and\s+Technology\b/i },
  { label: 'NUS', regex: /\bNational\s+University\s+of\s+Singapore\b|\bNUS\b/i },
  { label: 'NTU', regex: /\bNanyang\s+Technological\s+University\b/i },
];

export function extractArxivId(input: string): string | null {
  const cleaned = input.trim();
  const urlMatch = cleaned.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i);
  if (urlMatch) return urlMatch[1];
  const bareMatch = cleaned.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/i);
  if (bareMatch) return bareMatch[1];
  const generalMatch = cleaned.match(ARXIV_REGEX);
  return generalMatch ? generalMatch[1] : null;
}

export function extractDoi(input: string): string | null {
  const match = input.match(DOI_REGEX);
  if (!match) return null;
  return match[1].replace(/[.,;)\]]+$/, '');
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FolioPaperManager/1.0 (mailto:folio@local.app)',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArxivEntry(entry: string): MetadataLookupResult | null {
  const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : undefined;
  if (!title || title.toLowerCase() === 'error') return null;

  const idMatch = entry.match(/<id>[\s\S]*?arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i);
  const arxivId = idMatch ? idMatch[1] : undefined;

  const authors: string[] = [];
  const authorRegex = /<author>\s*<name>([\s\S]*?)<\/name>/g;
  let m: RegExpExecArray | null;
  while ((m = authorRegex.exec(entry)) !== null) {
    const name = decodeXmlEntities(m[1]);
    if (name) authors.push(name);
  }

  const publishedMatch = entry.match(/<published>(\d{4})-/);
  const year = publishedMatch ? Number.parseInt(publishedMatch[1], 10) : null;

  const journalRefMatch = entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/);
  const commentMatch = entry.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/);
  let venue = 'arXiv';
  if (journalRefMatch) {
    venue = decodeXmlEntities(journalRefMatch[1]).slice(0, 48);
  } else if (commentMatch) {
    const comment = decodeXmlEntities(commentMatch[1]);
    const confMatch = comment.match(
      /\b(NeurIPS|ICML|ICLR|CVPR|ICCV|ECCV|ACL|EMNLP|NAACL|AAAI|IJCAI|KDD|SIGIR|OSDI|SOSP|NSDI|CHI|SIGGRAPH|Nature|Science)\b(?:\s*\d{4})?/i
    );
    if (confMatch) venue = confMatch[0];
  }

  return {
    title,
    authors,
    year,
    venue,
    arxivId,
    url: arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined,
    source: 'arxiv',
  };
}

export async function fetchArxivMetadata(arxivId: string): Promise<MetadataLookupResult | null> {
  try {
    const res = await fetchWithTimeout(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return null;
    const parsed = parseArxivEntry(entryMatch[1]);
    if (parsed && !parsed.arxivId) {
      parsed.arxivId = arxivId;
      parsed.url = `https://arxiv.org/abs/${arxivId}`;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
  );
}

function titleSimilarity(a: string, b: string): number {
  const wa = normalizeWords(a);
  const wb = normalizeWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) {
    if (wb.has(w)) overlap += 1;
  }
  return overlap / Math.min(wa.size, wb.size);
}

async function searchArxivByTitle(candidateTitle: string): Promise<MetadataLookupResult | null> {
  const clean = candidateTitle
    .replace(/[:()[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 4) return null;

  try {
    const query = `ti:"${clean}"`;
    const res = await fetchWithTimeout(
      `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&max_results=3`
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    let best: { meta: MetadataLookupResult; score: number } | null = null;

    while ((m = entryRegex.exec(xml)) !== null) {
      const meta = parseArxivEntry(m[1]);
      if (!meta?.title) continue;
      const score = titleSimilarity(clean, meta.title);
      if (score >= 0.72 && (!best || score > best.score)) {
        best = { meta, score };
      }
    }
    return best?.meta ?? null;
  } catch {
    return null;
  }
}

export async function fetchCrossrefMetadata(doi: string): Promise<MetadataLookupResult | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      message?: {
        title?: string[];
        author?: Array<{ given?: string; family?: string; name?: string }>;
        issued?: { 'date-parts'?: number[][] };
        published?: { 'date-parts'?: number[][] };
        'container-title'?: string[];
        'short-container-title'?: string[];
        URL?: string;
      };
    };
    const msg = data.message;
    if (!msg) return null;

    const title = msg.title?.[0]?.replace(/\s+/g, ' ').trim();
    const authors = (msg.author || [])
      .map((a) => (a.name ? a.name : [a.given, a.family].filter(Boolean).join(' ')).trim())
      .filter(Boolean);

    const year =
      msg.issued?.['date-parts']?.[0]?.[0] ??
      msg.published?.['date-parts']?.[0]?.[0] ??
      null;

    const venue =
      msg['short-container-title']?.[0] ||
      msg['container-title']?.[0] ||
      '';

    return {
      title,
      authors,
      year,
      venue: venue.slice(0, 60),
      doi,
      url: msg.URL || `https://doi.org/${doi}`,
      source: 'crossref',
    };
  } catch {
    return null;
  }
}

function detectTeamFromText(headerText: string): string {
  const found: string[] = [];
  for (const { label, regex } of TEAM_PATTERNS) {
    if (regex.test(headerText)) {
      // Avoid redundant parent when specific child matched (e.g. ByteDance Seed + ByteDance)
      if (label === 'ByteDance' && found.includes('ByteDance Seed')) continue;
      if (label === 'Google' && found.includes('Google DeepMind')) continue;
      if (label === 'Alibaba' && found.includes('Qwen')) continue;
      if (!found.includes(label)) {
        found.push(label);
      }
      if (found.length >= 2) break;
    }
  }
  return found.join(' · ');
}

interface PdfPage1Hints {
  title?: string;
  authors?: string[];
  team?: string;
  year?: number | null;
  arxivId?: string;
  doi?: string;
}

interface TextItemLike {
  str: string;
  transform: number[];
  height?: number;
}

function isNoiseHeaderLine(s: string): boolean {
  return /^(preprint|under review|published as|proceedings of|arxiv:|technical report|working paper|copyright|\d{4}$)/i.test(
    s.trim()
  );
}

async function extractPage1WithPdfJs(buffer: Buffer): Promise<PdfPage1Hints> {
  try {
    // Use legacy Node-compatible ESM build of pdfjs-dist
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });

    const doc = await loadingTask.promise;
    let infoTitle: string | undefined;
    let infoAuthors: string[] | undefined;
    let infoYear: number | null = null;

    try {
      const meta = await doc.getMetadata();
      const info = meta.info as Record<string, unknown> | undefined;
      if (typeof info?.Title === 'string') {
        const t = info.Title.replace(/\s+/g, ' ').trim();
        if (
          t.length >= 8 &&
          !/^(untitled|microsoft word|latex|arxiv|powerpoint)/i.test(t) &&
          !/\.pdf$/i.test(t)
        ) {
          infoTitle = t;
        }
      }
      if (typeof info?.Author === 'string' && info.Author.trim().length >= 2) {
        infoAuthors = info.Author.split(/;|,\s*and\s+|\s+and\s+|,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (typeof info?.CreationDate === 'string') {
        const m = info.CreationDate.match(/D:(\d{4})/);
        if (m) {
          const y = Number.parseInt(m[1], 10);
          if (y >= 1980 && y <= 2035) infoYear = y;
        }
      }
    } catch {
      // Ignore metadata dict errors
    }

    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height || 800;
    const textContent = await page.getTextContent();

    const items = (textContent.items as unknown[])
      .filter((it): it is TextItemLike => typeof (it as TextItemLike)?.str === 'string')
      .map((it) => {
        const t = it.transform || [0, 0, 0, 0, 0, 0];
        const fontSize = Math.hypot(t[0], t[1]) || it.height || 0;
        return {
          str: it.str,
          x: t[4] ?? 0,
          y: t[5] ?? 0,
          fontSize,
        };
      })
      .filter((it) => it.str.trim().length > 0);

    const fullText = items.map((i) => i.str).join(' ');

    // 1. Scan Page 1 text for arXiv stamp & DOI
    const arxivMatch = fullText.match(/arXiv\s*[:\s]*(\d{4}\.\d{4,5})/i);
    const arxivId = arxivMatch ? arxivMatch[1] : undefined;

    const doiMatch = fullText.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]{4,})\b/i);
    const doi = doiMatch ? doiMatch[1].replace(/[.,;)\]]+$/, '') : undefined;

    // 2. Extract Full Title from the largest-font block in the upper half of Page 1
    const upperItems = items.filter(
      (it) => it.y >= pageHeight * 0.45 && it.fontSize >= 10 && !isNoiseHeaderLine(it.str)
    );
    let pageTitle: string | undefined;
    if (upperItems.length > 0) {
      const maxFont = Math.max(...upperItems.map((i) => i.fontSize));
      const titleItems = upperItems
        .filter((i) => i.fontSize >= maxFont * 0.85)
        .sort((a, b) => (Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x));

      const joined = titleItems
        .map((i) => i.str.trim())
        .join(' ')
        .replace(/\s+([:;,.)\]])/g, '$1')
        .replace(/([(\[])\s+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

      if (joined.length >= 8 && joined.length <= 260) {
        pageTitle = joined;
      }
    }

    // 3. Extract Team / Institution from header region (before Abstract, plus footnotes at bottom)
    const abstractIdx = fullText.search(/\bAbstract\b/i);
    const headerSlice =
      abstractIdx > 0 ? fullText.slice(0, Math.min(abstractIdx, 2600)) : fullText.slice(0, 2200);
    const footerSlice = fullText.length > 2600 ? fullText.slice(-1000) : '';
    const team = detectTeamFromText(`${headerSlice}\n${footerSlice}`);

    await loadingTask.destroy();

    // Prefer Page-1 full title when infoTitle is missing or looks abbreviated
    const bestTitle =
      pageTitle && (!infoTitle || pageTitle.length > infoTitle.length + 6)
        ? pageTitle
        : infoTitle || pageTitle;

    return {
      title: bestTitle,
      authors: infoAuthors,
      team: team || undefined,
      year: infoYear,
      arxivId,
      doi,
    };
  } catch (err) {
    console.warn('[Folio] pdfjs extraction fallback:', err);
    return {};
  }
}

export function inferShortName(title?: string, fileName?: string): string {
  // 1. Check title prefix before colon: e.g. "ACON: Optimizing..." or "SE-Agent: Self-Evolution..."
  if (title) {
    const colonIdx = title.indexOf(':');
    if (colonIdx > 1 && colonIdx <= 24) {
      const prefix = title.slice(0, colonIdx).trim();
      const wordCount = prefix.split(/\s+/).length;
      if (
        wordCount <= 2 &&
        !/^(on|a|an|the|towards|toward|beyond|how|why|what|when|rethinking|understanding|exploring|learning|scaling|improving|reducing)\b/i.test(
          prefix
        )
      ) {
        return prefix;
      }
    }
  }

  // 2. Fallback to concise PDF filename alias (e.g. "FoldGRPO.pdf", "AgentDiet.pdf", "Ouro.pdf")
  if (fileName) {
    const base = path.basename(fileName, path.extname(fileName)).trim();
    const isArxivLike = /^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(base);
    const words = base.split(/[\s_]+/).filter(Boolean);
    if (!isArxivLike && base.length >= 2 && base.length <= 22 && words.length <= 2) {
      return base;
    }
  }

  return '';
}

function cleanFilenameToTitle(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function lookupMetadataByQuery(query: string): Promise<MetadataLookupResult | null> {
  const arxivId = extractArxivId(query);
  if (arxivId) {
    const res = await fetchArxivMetadata(arxivId);
    if (res) return res;
  }
  const doi = extractDoi(query);
  if (doi) {
    const res = await fetchCrossrefMetadata(doi);
    if (res) return res;
  }
  return searchArxivByTitle(query);
}

export async function extractPage1TextForLlm(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    const parts = (textContent.items as unknown[])
      .filter((it): it is TextItemLike => typeof (it as TextItemLike)?.str === 'string')
      .map((it) => it.str.trim())
      .filter(Boolean);
    return parts.join(' ');
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractMetadataFromPdf(filePath: string): Promise<MetadataLookupResult> {
  const fileName = path.basename(filePath);
  const filenameArxiv = extractArxivId(fileName);

  let page1: PdfPage1Hints = {};
  try {
    const buffer = await fs.readFile(filePath);
    page1 = await extractPage1WithPdfJs(buffer);
  } catch {
    // Ignore read errors
  }

  const arxivId = filenameArxiv || page1.arxivId;
  if (arxivId) {
    const arxivMeta = await fetchArxivMetadata(arxivId);
    if (arxivMeta) {
      return {
        ...arxivMeta,
        shortName: inferShortName(arxivMeta.title, fileName),
        team: page1.team || arxivMeta.team,
      };
    }
  }

  if (page1.doi) {
    const crossrefMeta = await fetchCrossrefMetadata(page1.doi);
    if (crossrefMeta) {
      return {
        ...crossrefMeta,
        shortName: inferShortName(crossrefMeta.title, fileName),
        team: page1.team || crossrefMeta.team,
      };
    }
  }

  // If we extracted a Page-1 title (even if filename was abbreviated like "SE-Agent.pdf"),
  // try matching it on arXiv to get the canonical full title, authors, and year
  if (page1.title) {
    const matched = await searchArxivByTitle(page1.title);
    if (matched) {
      return {
        ...matched,
        shortName: inferShortName(matched.title, fileName),
        team: page1.team || matched.team,
      };
    }

    return {
      shortName: inferShortName(page1.title, fileName),
      title: page1.title,
      authors: page1.authors || [],
      team: page1.team,
      year: page1.year ?? null,
      venue: arxivId ? 'arXiv' : '',
      arxivId,
      doi: page1.doi,
      url: arxivId
        ? `https://arxiv.org/abs/${arxivId}`
        : page1.doi
          ? `https://doi.org/${page1.doi}`
          : undefined,
      source: 'pdf',
    };
  }

  const fallbackTitle = cleanFilenameToTitle(filePath);
  return {
    shortName: inferShortName(fallbackTitle, fileName),
    title: fallbackTitle,
    authors: page1.authors || [],
    team: page1.team,
    year: page1.year ?? null,
    venue: arxivId ? 'arXiv' : '',
    arxivId,
    doi: page1.doi,
    source: 'filename',
  };
}
