// Поиск по каталогу игр. Простое вхождение подстроки не находило игру при опечатке,
// другом порядке слов, «ё», знаках препинания, русской раскладке или кириллице вместо
// латиницы. Здесь:
//   - нормализация: регистр, ё→е, диакритика, знаки препинания, римские цифры (III → 3);
//   - слова запроса ищутся в любом порядке, каждое — по началу слова или внутри;
//   - опечатки: 1 ошибка в словах от 4 букв, 2 — от 8 (Дамерау — Левенштейн);
//   - «не та раскладка» (ыекфн → stray) и транслитерация (сталкер → stalker);
//   - оценка релевантности: точное название > начало названия > слова названия >
//     опечатки > разработчик, издатель и теги.

export type SearchableGame = {
  title?: string;
  developer?: string;
  publisher?: string;
  tags?: { name?: string }[];
};

const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' };

/** Нормализовать строку: нижний регистр, без диакритики и знаков, ё→е */
export function normalize(s: string): string {
  return String(s || '')
    .toLowerCase()
    // аббревиатура через точки: S.T.A.L.K.E.R. → stalker
    .replace(/(^|[^\p{L}])((?:\p{L}\.){2,}\p{L}?)/gu, (_m, pre: string, acr: string) => pre + acr.replace(/\./g, ''))
    .replace(/ё/g, 'е')
    .replace(/й/g, '') // й при разложении стала бы «и» + знак — бережём её
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // диакритика: Pokémon → pokemon
    .replace(//g, 'й')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '') // Assassin's → assassins
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const words = (s: string) => normalize(s).split(' ').filter(Boolean).map((w) => ROMAN[w] || w);

// ---------- раскладка и транслитерация ----------

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const swapMap = new Map<string, string>();
for (let i = 0; i < EN.length; i++) { swapMap.set(EN[i], RU[i]); swapMap.set(RU[i], EN[i]); }

/** Текст, набранный не в той раскладке: «ыекфн» → «stray», «ghbdtn» → «привет» */
export function swapLayout(s: string): string {
  return [...String(s || '').toLowerCase()].map((ch) => swapMap.get(ch) ?? ch).join('');
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
/** Кириллица латиницей: «сталкер» → «stalker», «майнкрафт» → «maynkraft» */
export function translit(s: string): string {
  return [...normalize(s)].map((ch) => TRANSLIT[ch] ?? ch).join('');
}

// ---------- сравнение слов ----------

/** Расстояние Дамерау — Левенштейна с ранним выходом, если превышен предел */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

const allowedTypos = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/**
 * Насколько слово запроса совпадает со словами поля: 3 — слово целиком, 2 — начало слова,
 * 1.5 — внутри слова (от 3 букв), 1 — с опечаткой; 0 — нет.
 */
function matchWord(q: string, fieldWords: string[], fieldJoined: string): number {
  let best = 0;
  for (const w of fieldWords) {
    if (w === q) return 3;
    if (w.startsWith(q)) best = Math.max(best, 2);
  }
  if (best) return best;
  if (q.length >= 3 && fieldJoined.includes(q)) return 1.5;
  const typos = allowedTypos(q.length);
  if (typos) {
    for (const w of fieldWords) {
      // опечатка в целом слове или в начале длинного слова («witchr» → «witcher»)
      if (distance(q, w, typos) <= typos) return 1;
      if (w.length > q.length && distance(q, w.slice(0, q.length), typos) <= typos) return 1;
    }
  }
  return 0;
}

type Prepared = { title: string[]; titleJoined: string; titleTr: string; other: string[]; otherJoined: string };
const cache = new WeakMap<object, Prepared>();

function prepare(g: SearchableGame): Prepared {
  const hit = cache.get(g);
  if (hit) return hit;
  const title = words(g.title || '');
  const other = words([g.developer, g.publisher, ...(g.tags || []).map((t) => t.name)].filter(Boolean).join(' '));
  const p = { title, titleJoined: title.join(' '), titleTr: translit(g.title || ''), other, otherJoined: other.join(' ') };
  cache.set(g, p);
  return p;
}

/** Оценка одного варианта запроса; 0 — игра не подходит (каждое слово должно найтись) */
function scoreWords(qWords: string[], qJoined: string, p: Prepared): number {
  if (qWords.length === 0) return 0;
  let score = 0;
  for (const q of qWords) {
    const t = matchWord(q, p.title, p.titleJoined);
    const o = t ? 0 : matchWord(q, p.other, p.otherJoined);
    if (!t && !o) return 0;
    score += t ? t * 10 : o * 3;
  }
  // бонусы за совпадение всего названия
  if (p.titleJoined === qJoined) score += 100;
  else if (p.titleJoined.startsWith(qJoined)) score += 50;
  else if (p.titleJoined.includes(qJoined)) score += 20;
  return score;
}

export type CompiledQuery = { raw: string; variants: { words: string[]; joined: string; penalty: number }[] };

/** Разобрать запрос один раз: сам запрос, другая раскладка, транслит */
export function compileQuery(raw: string): CompiledQuery {
  const variants: CompiledQuery['variants'] = [];
  const add = (s: string, penalty: number) => {
    const w = words(s);
    const joined = w.join(' ');
    if (joined && !variants.some((v) => v.joined === joined)) variants.push({ words: w, joined, penalty });
  }
  add(raw, 1);
  add(swapLayout(raw), 0.8);
  if (/[а-яё]/i.test(raw)) add(translit(raw), 0.9);
  return { raw, variants };
}

/** Релевантность игры запросу; 0 — не подходит */
export function scoreGame(g: SearchableGame, q: CompiledQuery): number {
  const p = prepare(g);
  let best = 0;
  for (const v of q.variants) {
    const s = scoreWords(v.words, v.joined, p) * v.penalty;
    if (s > best) best = s;
  }
  // кириллический запрос против латинского названия целиком («сталкер 2» → «stalker 2»)
  if (!best && q.variants.length) {
    const tr = translit(q.raw).replace(/\s+/g, ' ');
    if (tr.length >= 4 && p.titleTr.includes(tr)) best = 15;
  }
  return best;
}
