/**
 * Split a paper's team/affiliation string (e.g. "ByteDance Seed · CMU" or "Tsinghua, Alibaba")
 * into individual deduplicated institution names so collaborative papers aggregate cleanly.
 */
export function splitTeams(raw?: string | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[·•,，;；/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}
