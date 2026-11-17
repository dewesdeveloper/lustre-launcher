// Какая из установленных игр — эта игра каталога. Раньше искали только по словам названия:
// игра «Моадра» из раздачи «Moadra-RUNE» не находилась (кириллица против латиницы) — лаунчер
// писал «не установлена», хотя запись об установке была. Теперь сначала — точный id каталога,
// который лаунчер сохраняет при установке; по названию — только для старых записей без него.

type InstalledLike = { name?: string; catalogId?: number | string | null };

const tokens = (s?: string | null) =>
  new Set(String(s || '').toLowerCase().split(/[^a-z0-9а-яё]+/).filter((t) => t.length >= 3));

/** Установленная игра для игры каталога (id и название) или null */
export function findInstalled<T extends InstalledLike>(gameId: number | string | null | undefined, title: string | null | undefined, list: T[]): T | null {
  const id = Number(gameId) || 0;
  if (id > 0) {
    const exact = list.find((g) => Number(g.catalogId) === id);
    if (exact) return exact;
  }
  const want = [...tokens(title)];
  if (want.length === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const g of list) {
    // запись другой игры каталога не подходит, даже если слова совпали
    if (id > 0 && Number(g.catalogId) > 0 && Number(g.catalogId) !== id) continue;
    const have = tokens(g.name);
    const score = want.filter((t) => have.has(t)).length;
    if (score > bestScore) { best = g; bestScore = score; }
  }
  return best;
}
