// Тест гонки кэша: чтение, пока висит предыдущий запрос, не должно отдавать устаревшие данные
import { readResource, invalidate, refreshResource, subscribe, peek, mutateResource } from '../../src/utils/resourceCache';

type Row = { n: number };

const KEY = 'shop:user:42';
const OPTS = { ttl: 30_000, cooldown: 15_000, persist: false };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let version = 1;          // «версия» данных на сервере
let inflight = 0;         // счётчик одновременных запросов

const fetcher = async () => {
  inflight += 1;
  const mine = inflight;
  await sleep(60);        // имитация сети
  inflight -= 1;
  return { data: { n: version } as Row, etag: 'e' + version, notModified: false };
};

async function readLikeShopApi() {
  const first = readResource<Row>(KEY, fetcher, OPTS);
  if (first.promise) await first.promise;
  return readResource<Row>(KEY, fetcher, OPTS).data as Row;
}

const fail = (msg: string) => { console.log('ПРОВАЛ: ' + msg); process.exitCode = 1; };
const ok = (msg: string) => console.log('  ок: ' + msg);

// --- Сценарий 1: покупка прямо во время первого запроса витрины ---
console.log('Сценарий 1: invalidate во время активного запроса');
const p1 = readLikeShopApi();            // запрос витрины ушёл в сеть
await sleep(10);
version = 2;                             // на сервере баланс/инвентарь изменились (покупка)
invalidate(KEY);
const afterFirst = await p1;             // первый вызов завершился
if (afterFirst.n !== 2) fail(`первый вызов вернул устаревшие данные (n=${afterFirst.n}, ожидалось 2)`);
else ok('первый вызов дождался актуальных данных');

const afterSecond = await readLikeShopApi(); // покупка → перечитываем витрину
if (afterSecond.n !== 2) fail(`повторное чтение вернуло устаревшие данные (n=${afterSecond.n})`);
else ok('повторное чтение вернуло n=2');

// --- Сценарий 2: два параллельных чтения не отдают устаревшее ---
console.log('Сценарий 2: параллельные чтения');
invalidate(KEY);
version = 3;
const [a, b] = await Promise.all([readLikeShopApi(), readLikeShopApi()]);
if (a.n !== 3 || b.n !== 3) fail(`параллельные чтения: a=${a.n}, b=${b.n}, ожидалось 3/3`);
else ok('оба чтения получили n=3');

// --- Сценарий 3: invalidate сбрасывает ETag ---
console.log('Сценарий 3: ETag сбрасывается при invalidate');
let sentEtag: string | null = null;
const etagFetcher = async (opts: { etag: string | null }) => {
  sentEtag = opts.etag;
  await sleep(10);
  return { data: { n: version } as Row, etag: 'e' + version, notModified: false };
};
invalidate(KEY);
await readResource(KEY, etagFetcher, OPTS).promise;
if (sentEtag !== null) fail(`после invalidate клиент отправил старый ETag: ${sentEtag}`);
else ok('старый ETag не отправляется');

// --- Сценарий 4: сценарий покупки для подписчика (как страница магазина) ---
console.log('Сценарий 4: покупка — подписчик видит статус «куплен» и не откатывается');
type ShopRow = { owned: number[]; balance: number };
const SHOP = 'shop:user:7';
let serverOwned: number[] = [];
let serverBalance = 1000;
const shopFetcher = async () => {
  await sleep(20);
  return { data: { owned: [...serverOwned], balance: serverBalance } as ShopRow, etag: 's' + serverOwned.length, notModified: false };
};

let notified: ShopRow | null = null;
const unsub = subscribe(SHOP, () => { notified = peek<ShopRow>(SHOP); });

// 1) витрина загрузилась
await readResource(SHOP, shopFetcher, { ...OPTS, persist: false }).promise;
let view = peek<ShopRow>(SHOP)!;
if (view.owned.includes(50)) fail('до покупки товар уже отмечен как купленный');
else ok('до покупки товар не куплен');

// 2) «покупка»: на сервере появился товар, клиент сбросил кэш и обновился
serverOwned.push(50);
serverBalance -= 500;
invalidate(SHOP);                                    // touchShop() после buyItem
await refreshResource(SHOP, shopFetcher, { ...OPTS, persist: false }); // load(true)
view = peek<ShopRow>(SHOP)!;
if (!view.owned.includes(50)) fail('после покупки в кэше нет товара');
else ok('после покупки в кэше товар помечен как купленный');
if (!notified || !notified.owned.includes(50)) fail('подписчик не получил уведомление о покупке');
else ok('подписчик получил уведомление с owned=true');

// 3) «перезапуск страницы»: чтение из кэша не должно откатывать статус
const reread = readResource<ShopRow>(SHOP, shopFetcher, { ...OPTS, persist: false });
if (reread.promise) await reread.promise;
if (!(reread.data?.owned || []).includes(50)) fail('повторное чтение откатило статус «куплен»');
else ok('повторное чтение сохраняет статус');

// 4) «опрос из навбара» через 1 с не должен вернуть старое состояние
await sleep(1100);
const poll = readResource<ShopRow>(SHOP, shopFetcher, { ...OPTS, ttl: 500, cooldown: 0, persist: false });
if (poll.promise) await poll.promise;
if (!(peek<ShopRow>(SHOP)?.owned || []).includes(50)) fail('опрос с истёкшим TTL вернул устаревшее состояние');
else ok('опрос с истёкшим TTL вернул актуальное состояние');

unsub();

// --- Сценарий 5: «забрать бонус», пока висит запрос витрины, начатый ДО нажатия ---
// Сервер отвечает состоянием на момент начала запроса (как в жизни), поэтому старый
// запрос несёт bonus_ready: true. Раньше он записывался в кэш как свежий, и кнопка
// «Забрать бонус» оставалась активной до конца TTL.
console.log('Сценарий 5: бонус — кнопка гаснет сразу и не «воскресает» от старого запроса');
type BonusRow = { bonus_ready: boolean; coins: number };
const BONUS = 'shop:user:9';
let serverBonusReady = true;
let serverCoins = 100;
const bonusFetcher = async () => {
  const snapshot = { bonus_ready: serverBonusReady, coins: serverCoins }; // состояние на старте запроса
  await sleep(60);
  return { data: snapshot as BonusRow, etag: null, notModified: false };
};
const BOPTS = { ttl: 30_000, cooldown: 15_000, persist: false };

await readResource(BONUS, bonusFetcher, BOPTS).promise;               // витрина загружена
invalidate(BONUS);
const slow = readResource(BONUS, bonusFetcher, BOPTS).promise;        // фоновая ревалидация ушла в сеть
await sleep(10);
// нажатие: сервер начислил бонус, клиент сразу правит кэш и инвалидирует его (claimDailyBonus)
serverBonusReady = false;
serverCoins = 350;
mutateResource<BonusRow>(BONUS, (prev) => prev && { ...prev, bonus_ready: false, coins: 350 });
if (peek<BonusRow>(BONUS)?.bonus_ready !== false) fail('кнопка не погасла сразу после ответа сервера');
else ok('кнопка гаснет сразу (оптимистичное обновление)');
invalidate(BONUS);
await slow;
const afterSlow = peek<BonusRow>(BONUS);
if (afterSlow?.bonus_ready !== false || afterSlow.coins !== 350) {
  fail(`запрос, начатый до нажатия, вернул старое состояние: ${JSON.stringify(afterSlow)}`);
} else ok('старый запрос не откатил состояние — данные перезапрошены');
const viaRefresh = await refreshResource(BONUS, bonusFetcher, BOPTS);
void viaRefresh;
if (peek<BonusRow>(BONUS)?.bonus_ready !== false) fail('принудительное обновление вернуло bonus_ready: true');
else ok('принудительное обновление подтверждает: бонус получен');

console.log(process.exitCode ? 'ТЕСТЫ ПРОВАЛЕНЫ' : 'ВСЕ ТЕСТЫ ПРОШЛИ');
