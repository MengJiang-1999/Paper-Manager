import type { PdfPaper } from '../types';

export type CitationFormat = 'bibtex' | 'gbt7714' | 'ieee' | 'apa';

export interface ParsedBibEntry {
  type: string;
  key: string;
  title: string;
  authors: string[];
  year: string;
  venue: string;
  journal: string;
  booktitle: string;
  eprint: string;
  doi: string;
  url: string;
  pages: string;
  volume: string;
  number: string;
  address: string;
  archivePrefix: string;
}

export interface BibAuditIssue {
  key: string;
  type: string;
  missingRequired: string[];
  missingRecommended: string[];
}

const CONFERENCE_REGEX =
  /\b(NeurIPS|NIPS|ICML|ICLR|CVPR|ICCV|ECCV|ACL|EMNLP|NAACL|AAAI|IJCAI|KDD|SIGIR|OSDI|SOSP|NSDI|CHI|SIGGRAPH|WWW|USENIX|COLM|AISTATS|UAI|WACV|CoRL|RSS|ICRA|IROS)\b/i;

function makeCiteKey(paper: PdfPaper, usedKeys: Set<string>): string {
  const firstAuthor = paper.authors[0] || '';
  const lastName = firstAuthor
    .split(/\s+/)
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

  const shortToken = (paper.shortName || paper.title.split(/\s+/)[0] || 'paper')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

  const yearPart = paper.year ? String(paper.year) : 'nd';
  const base = `${lastName || shortToken || 'paper'}${yearPart}${
    lastName && shortToken && shortToken !== lastName ? shortToken.slice(0, 14) : ''
  }`;

  let key = base || 'paper';
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}${String.fromCharCode(95 + suffix)}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

function escapeBibValue(val: string): string {
  return val.replace(/\s+/g, ' ').trim();
}

export function generateBibtexFromPapers(papers: PdfPaper[]): string {
  const usedKeys = new Set<string>();

  return papers
    .map((paper) => {
      const key = makeCiteKey(paper, usedKeys);
      const isConf = CONFERENCE_REGEX.test(paper.venue || '');
      const isArxiv = !isConf && (Boolean(paper.arxivId) || /arxiv/i.test(paper.venue || ''));
      const entryType = isConf ? 'inproceedings' : isArxiv ? 'misc' : paper.venue ? 'article' : 'misc';

      // Prefer the publication venue year (e.g. "ICML 2026") over an earlier arXiv submission year
      const venueYearMatch = (paper.venue || '').match(/\b(20\d{2}|19\d{2})\b/);
      const effectiveYear = venueYearMatch ? Number.parseInt(venueYearMatch[1], 10) : paper.year;

      const fields: Array<[string, string]> = [];
      fields.push(['title', `{${escapeBibValue(paper.title)}}`]);
      if (paper.authors.length > 0) {
        fields.push(['author', `{${paper.authors.map(escapeBibValue).join(' and ')}}`]);
      }
      if (effectiveYear) {
        fields.push(['year', `{${effectiveYear}}`]);
      }
      if (isConf && paper.venue) {
        fields.push(['booktitle', `{${escapeBibValue(paper.venue)}}`]);
      } else if (entryType === 'article' && paper.venue) {
        fields.push(['journal', `{${escapeBibValue(paper.venue)}}`]);
      }
      if (paper.arxivId) {
        fields.push(['eprint', `{${paper.arxivId}}`]);
        fields.push(['archivePrefix', '{arXiv}']);
      }
      if (paper.doi) {
        fields.push(['doi', `{${paper.doi}}`]);
      }
      if (paper.url) {
        fields.push(['url', `{${paper.url}}`]);
      }

      const body = fields.map(([k, v]) => `  ${k} = ${v}`).join(',\n');
      return `@${entryType}{${key},\n${body}\n}`;
    })
    .join('\n\n');
}

function stripOuterBraces(s: string): string {
  let out = s.trim();
  while (
    (out.startsWith('{') && out.endsWith('}')) ||
    (out.startsWith('"') && out.endsWith('"'))
  ) {
    out = out.slice(1, -1).trim();
  }
  // Remove inline BibTeX case-protection braces like {LLM} -> LLM
  return out.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

export function parseBibtexEntries(bibtex: string): ParsedBibEntry[] {
  const entries: ParsedBibEntry[] = [];
  const headerRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(bibtex)) !== null) {
    const type = match[1].toLowerCase();
    const key = match[2].trim();
    const startIdx = match.index + match[0].length;

    // Walk balanced braces to find end of this entry
    let depth = 1;
    let i = startIdx;
    while (i < bibtex.length && depth > 0) {
      if (bibtex[i] === '{') depth += 1;
      else if (bibtex[i] === '}') depth -= 1;
      i += 1;
    }
    const body = bibtex.slice(startIdx, Math.max(startIdx, i - 1));
    const fields: Record<string, string> = {};

    // Parse key = {value} or key = "value" or key = 2024
    let pos = 0;
    while (pos < body.length) {
      const rest = body.slice(pos);
      const fm = rest.match(/^\s*,?\s*([a-zA-Z0-9_-]+)\s*=\s*/);
      if (!fm) {
        pos += 1;
        continue;
      }
      const fieldName = fm[1].toLowerCase();
      pos += fm[0].length;

      let value = '';
      if (body[pos] === '{') {
        let d = 1;
        const vStart = pos + 1;
        pos += 1;
        while (pos < body.length && d > 0) {
          if (body[pos] === '{') d += 1;
          else if (body[pos] === '}') d -= 1;
          pos += 1;
        }
        value = body.slice(vStart, Math.max(vStart, pos - 1));
      } else if (body[pos] === '"') {
        const vStart = pos + 1;
        pos += 1;
        while (pos < body.length && body[pos] !== '"') {
          if (body[pos] === '\\') pos += 2;
          else pos += 1;
        }
        value = body.slice(vStart, pos);
        pos += 1;
      } else {
        const vStart = pos;
        while (pos < body.length && body[pos] !== ',' && body[pos] !== '\n') {
          pos += 1;
        }
        value = body.slice(vStart, pos);
      }

      fields[fieldName] = stripOuterBraces(value);
    }

    const authors = (fields.author || '')
      .split(/\s+and\s+/i)
      .map((a) => a.trim())
      .filter(Boolean);

    entries.push({
      type,
      key,
      title: fields.title || key,
      authors,
      year: fields.year || '',
      booktitle: fields.booktitle || '',
      journal: fields.journal || '',
      venue: fields.booktitle || fields.journal || (fields.eprint ? `arXiv:${fields.eprint}` : ''),
      eprint: fields.eprint || '',
      doi: fields.doi || '',
      url: fields.url || (fields.eprint ? `https://arxiv.org/abs/${fields.eprint}` : ''),
      pages: fields.pages || '',
      volume: fields.volume || '',
      number: fields.number || '',
      address: fields.address || '',
      archivePrefix: fields.archiveprefix || '',
    });
  }

  return entries;
}

export function auditBibtexCompleteness(bibtex: string): BibAuditIssue[] {
  const entries = parseBibtexEntries(bibtex);
  const issues: BibAuditIssue[] = [];

  for (const e of entries) {
    const missingRequired: string[] = [];
    const missingRecommended: string[] = [];

    if (e.authors.length === 0) missingRequired.push('author');
    if (!e.title) missingRequired.push('title');
    if (!e.year) missingRequired.push('year');

    if (e.type === 'inproceedings' || e.type === 'conference') {
      if (!e.booktitle) missingRequired.push('booktitle');
      if (!e.pages) missingRecommended.push('pages');
      if (!e.address) missingRecommended.push('address');
    } else if (e.type === 'article') {
      if (!e.journal) missingRequired.push('journal');
      if (!e.volume) missingRecommended.push('volume');
      if (!e.pages) missingRecommended.push('pages');
    } else {
      if (!e.eprint && !e.doi && !e.url) {
        missingRequired.push('eprint/url/doi');
      }
      if (e.eprint && !e.archivePrefix) {
        missingRecommended.push('archivePrefix');
      }
    }

    if (missingRequired.length > 0 || missingRecommended.length > 0) {
      issues.push({
        key: e.key,
        type: e.type,
        missingRequired,
        missingRecommended,
      });
    }
  }

  return issues;
}

function splitAuthorName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((s) => s.trim());
    return { first: first || '', last: last || '' };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: '', last: parts[0] || '' };
  const last = parts.pop() || '';
  return { first: parts.join(' '), last };
}

function isCjk(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

function formatGbt7714Author(name: string): string {
  if (isCjk(name)) return name.trim();
  const { first, last } = splitAuthorName(name);
  const initials = first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .join(' ');
  return initials ? `${last.toUpperCase()} ${initials}` : last.toUpperCase();
}

function formatGbt7714(entries: ParsedBibEntry[]): string {
  return entries
    .map((e, idx) => {
      const authors =
        e.authors.length === 0
          ? '佚名'
          : e.authors.length <= 3
            ? e.authors.map(formatGbt7714Author).join(', ')
            : `${e.authors.slice(0, 3).map(formatGbt7714Author).join(', ')}, et al`;

      const isConf = e.type === 'inproceedings' || Boolean(e.booktitle);
      const isJournal = e.type === 'article' || Boolean(e.journal);
      const docType = isConf ? '[C]' : isJournal ? '[J]' : e.eprint || e.url ? '[EB/OL]' : '[M]';

      let tail = '';
      if (isConf) {
        const venue = e.booktitle || e.venue;
        const addr = e.address ? `${e.address}: ` : '';
        const yearPages = [e.year, e.pages ? `:${e.pages}` : ''].join('');
        tail = `//${venue}. ${addr}${yearPages}.`.replace(/\.\s*\./g, '.');
      } else if (isJournal) {
        const vol = e.volume ? `, ${e.volume}${e.number ? `(${e.number})` : ''}` : '';
        const pages = e.pages ? `:${e.pages}` : '';
        tail = `. ${e.journal || e.venue}, ${e.year}${vol}${pages}.`;
      } else if (e.eprint) {
        tail = `. arXiv preprint arXiv:${e.eprint}, ${e.year || 'n.d.'}.${e.url ? ` ${e.url}.` : ''}`;
      } else {
        tail = `${e.venue ? `. ${e.venue}` : ''}${e.year ? `, ${e.year}` : ''}.${e.url ? ` ${e.url}.` : ''}`;
      }

      return `[${idx + 1}] ${authors}. ${e.title}${docType}${tail}`;
    })
    .join('\n');
}

function formatIeeeAuthor(name: string): string {
  if (isCjk(name)) return name.trim();
  const { first, last } = splitAuthorName(name);
  const initials = first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ');
  return initials ? `${initials} ${last}` : last;
}

function formatIeee(entries: ParsedBibEntry[]): string {
  return entries
    .map((e, idx) => {
      const authors =
        e.authors.length === 0
          ? ''
          : e.authors.length <= 3
            ? e.authors.map(formatIeeeAuthor).join(', ')
            : `${formatIeeeAuthor(e.authors[0])} et al.`;

      const isConf = e.type === 'inproceedings' || Boolean(e.booktitle);
      const venuePart = isConf
        ? `in ${e.booktitle || e.venue}`
        : e.journal
          ? e.journal
          : e.eprint
            ? `arXiv preprint arXiv:${e.eprint}`
            : e.venue;

      const parts = [
        authors ? `${authors},` : '',
        `"${e.title},"`,
        venuePart ? `${venuePart},` : '',
        e.pages ? `pp. ${e.pages},` : '',
        e.year ? `${e.year}.` : '',
      ].filter(Boolean);

      return `[${idx + 1}] ${parts.join(' ').replace(/,\s*$/, '.')}`;
    })
    .join('\n');
}

function formatApaAuthor(name: string): string {
  if (isCjk(name)) return name.trim();
  const { first, last } = splitAuthorName(name);
  const initials = first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ');
  return initials ? `${last}, ${initials}` : last;
}

function formatApa(entries: ParsedBibEntry[]): string {
  return entries
    .map((e) => {
      let authors = '';
      if (e.authors.length === 1) {
        authors = formatApaAuthor(e.authors[0]);
      } else if (e.authors.length === 2) {
        authors = `${formatApaAuthor(e.authors[0])}, & ${formatApaAuthor(e.authors[1])}`;
      } else if (e.authors.length > 2) {
        const list = e.authors.slice(0, 6).map(formatApaAuthor);
        authors =
          e.authors.length > 6
            ? `${list.join(', ')}, ... ${formatApaAuthor(e.authors[e.authors.length - 1])}`
            : `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
      }

      const year = e.year ? `(${e.year}).` : '(n.d.).';
      const venue = e.booktitle || e.journal || (e.eprint ? `arXiv preprint arXiv:${e.eprint}` : '');
      const url = e.doi ? `https://doi.org/${e.doi}` : e.url;

      return [authors, year, `${e.title}.`, venue ? `${venue}.` : '', url]
        .filter(Boolean)
        .join(' ');
    })
    .join('\n\n');
}

export function formatCitationsFromBibtex(bibtex: string, format: CitationFormat): string {
  if (format === 'bibtex') return bibtex;
  const entries = parseBibtexEntries(bibtex);
  if (entries.length === 0) return '';
  if (format === 'gbt7714') return formatGbt7714(entries);
  if (format === 'ieee') return formatIeee(entries);
  return formatApa(entries);
}

// --- VS Code-style Side-by-Side Line Diff (LCS) ---

export interface DiffRow {
  type: 'equal' | 'delete' | 'insert' | 'replace';
  leftLineNo: number | null;
  rightLineNo: number | null;
  leftText: string;
  rightText: string;
}

export function computeSideBySideDiff(original: string, modified: string): DiffRow[] {
  const a = original.split('\n');
  const b = modified.split('\n');
  const m = a.length;
  const n = b.length;

  // LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  type Op = { kind: 'equal' | 'delete' | 'insert'; text: string; lineNo: number };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', text: a[i], lineNo: i + 1 });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'delete', text: a[i], lineNo: i + 1 });
      i += 1;
    } else {
      ops.push({ kind: 'insert', text: b[j], lineNo: j + 1 });
      j += 1;
    }
  }
  while (i < m) {
    ops.push({ kind: 'delete', text: a[i], lineNo: i + 1 });
    i += 1;
  }
  while (j < n) {
    ops.push({ kind: 'insert', text: b[j], lineNo: j + 1 });
    j += 1;
  }

  // Pair consecutive deletes + inserts into side-by-side rows
  const rows: DiffRow[] = [];
  let leftNo = 1;
  let rightNo = 1;
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === 'equal') {
      rows.push({
        type: 'equal',
        leftLineNo: leftNo++,
        rightLineNo: rightNo++,
        leftText: ops[k].text,
        rightText: ops[k].text,
      });
      k += 1;
      continue;
    }

    const dels: string[] = [];
    const ins: string[] = [];
    while (k < ops.length && ops[k].kind !== 'equal') {
      if (ops[k].kind === 'delete') dels.push(ops[k].text);
      else ins.push(ops[k].text);
      k += 1;
    }

    const maxLen = Math.max(dels.length, ins.length);
    for (let x = 0; x < maxLen; x += 1) {
      const hasLeft = x < dels.length;
      const hasRight = x < ins.length;
      rows.push({
        type: hasLeft && hasRight ? 'replace' : hasLeft ? 'delete' : 'insert',
        leftLineNo: hasLeft ? leftNo++ : null,
        rightLineNo: hasRight ? rightNo++ : null,
        leftText: hasLeft ? dels[x] : '',
        rightText: hasRight ? ins[x] : '',
      });
    }
  }

  return rows;
}
