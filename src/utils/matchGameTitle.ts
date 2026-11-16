// Сопоставление имени установленной игры (папка/торрент: «Call of Duty Modern Warfare 2 (2022)
// [FitGirl Repack]») с играми библиотеки — для записей без catalogId (старые установки, игры,
// добавленные вручную). Раньше побеждала игра с наибольшим числом общих слов, и у
// «Modern Warfare 2» с «Modern Warfare® II» и «Modern Warfare® 4» было поровну: римская II
// не равнялась 2, а лишняя «4» не мешала — запуск MW2 засчитывался MW4.

const ROMAN: Record<string, string> = {
  ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12',
};

const isYear = (t: string) => /^(19[89]\d|20\d\d)$/.test(t);

export function titleTokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[™®©]/g, '')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .split(' ')
    .filter(Boolean)
    .map((t) => ROMAN[t] || t);
}

/**
 * Лучшая игра библиотеки для имени установки; 0 — уверенного совпадения нет.
 * Правила: номер части из названия (2, 4, II) обязан быть в имени; покрыто должно быть
 * не меньше 3/4 слов названия; побеждает больше общих слов, затем полнее покрытое и короче название.
 */
export function matchGameTitle(name: string | undefined, library: { id: number; title: string }[]): number {
  const nameTokens = new Set(titleTokens(name || ''));
  if (nameTokens.size === 0) return 0;
  let best = 0;
  let bestKey: [number, number, number] = [0, 0, 0];
  for (const g of library) {
    const tt = [...new Set(titleTokens(g.title))];
    if (tt.length === 0) continue;
    // номер части — обязателен (год выпуска не считаем: в названии папки его часто нет)
    if (tt.some((t) => /^\d+$/.test(t) && !isYear(t) && !nameTokens.has(t))) continue;
    const matched = tt.filter((t) => nameTokens.has(t)).length;
    const coverage = matched / tt.length;
    if (coverage < 0.75) continue;
    const key: [number, number, number] = [matched, coverage, -tt.length];
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
      best = g.id;
      bestKey = key;
    }
  }
  return best;
}
