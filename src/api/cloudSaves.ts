// Облачные сохранения игр (Lustre Pro). Файловые операции делает Electron
// (electron/cloudSaves.cjs: поиск папки, zip, загрузка/восстановление), здесь — решения:
//   - после закрытия игры: сохранения изменились → загрузить новую версию;
//   - перед запуском: в облаке версия новее (играли на другом ПК) → спросить, скачать ли её.
// Локально на каждую игру хранится: своя папка (если выбрана), автосинхронизация вкл/выкл и
// «отпечаток» папки на момент последней синхронизации — по нему видно, менялись ли файлы.
import api from './index';
import { nativeNotify } from '../utils/nativeNotify';

export type CloudSaveVersion = {
  id: number;
  game_id: number;
  size: number;
  sha256: string;
  fingerprint: string;
  files: number;
  device_id: string;
  device_name: string;
  saved_at: string;
  created_at: string;
};

export type CloudSavesInfo = { enabled: boolean; used: number; quota: number; max_size: number; versions: CloudSaveVersion[] };

export type CloudSavesSummary = {
  enabled: boolean;
  used: number;
  quota: number;
  max_size: number;
  versions_per_game: number;
  games: { game_id: number; title: string; cover: string; versions: number; size: number; last_saved: string }[];
};

/** dirs — все папки игры, которые идут в один архив (например, AppData\Local и AppData\Roaming) */
export type SaveFolder = { dir: string; dirs: string[]; source: 'user' | 'catalog' | 'emulator' | 'guess'; files: number; size: number; newest: number; fingerprint: string };

type LocalState = { override?: string; auto?: boolean; fingerprint?: string; versionId?: number; syncedAt?: number };

/** Сведения об игре, нужные для поиска папки: пути из каталога и id в Steam (для эмуляторов) */
export type SaveGameMeta = { savePaths: string[]; appId: string; gameDir: string; title: string; developer: string };

const electronCS = () => (window as any).electron?.cloudSaves;
export const cloudSavesAvailable = () => !!electronCS();

const key = (gameId: number) => `lustre_cloud_save_${gameId}`;
export function localState(gameId: number): LocalState {
  try { return JSON.parse(localStorage.getItem(key(gameId)) || '{}') || {}; } catch { return {}; }
}
export function setLocalState(gameId: number, patch: Partial<LocalState>) {
  const next = { ...localState(gameId), ...patch };
  try { localStorage.setItem(key(gameId), JSON.stringify(next)); } catch { /* приватный режим */ }
  return next;
}

export const formatBytes = (n: number) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} ГБ` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

// ---------- API ----------

export const getCloudSaves = async (gameId: number) => (await api.get<CloudSavesInfo>(`/cloud-saves/${gameId}`)).data;
export const getCloudSavesSummary = async () => (await api.get<CloudSavesSummary>('/cloud-saves')).data;
export const deleteCloudSave = (gameId: number, id: number) => api.delete(`/cloud-saves/${gameId}/${id}`);

// ---------- сведения об игре ----------

/** id игры в Steam из ссылок на магазины (нужен для папок эмуляторов в репаках) */
export function steamAppId(storeLinks: { url?: string; store?: string }[] | undefined): string {
  for (const l of storeLinks || []) {
    const m = /store\.steampowered\.com\/app\/(\d+)/i.exec(l.url || '');
    if (m) return m[1];
  }
  return '';
}

const metaCache = new Map<number, Omit<SaveGameMeta, 'gameDir'>>();

/** Пути сохранений и Steam id игры из каталога (кэшируется на сеанс) */
export async function gameMeta(gameId: number): Promise<Omit<SaveGameMeta, 'gameDir'>> {
  const hit = metaCache.get(gameId);
  if (hit) return hit;
  const { data } = await api.get(`/games/${gameId}`);
  const meta = {
    savePaths: String(data?.save_paths || '').split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean),
    appId: steamAppId(data?.store_links),
    title: String(data?.title || ''),
    developer: String(data?.developer || ''),
  };
  metaCache.set(gameId, meta);
  return meta;
}

/** Найти сохранения: своя папка (если выбрана) → пути из каталога → папки эмуляторов → по названию игры */
export async function findSaveFolder(gameId: number, meta: SaveGameMeta): Promise<{ best: SaveFolder | null; candidates: SaveFolder[] }> {
  const cs = electronCS();
  if (!cs) return { best: null, candidates: [] };
  return cs.locate({
    patterns: meta.savePaths, gameDir: meta.gameDir, appId: meta.appId, title: meta.title, developer: meta.developer,
    override: localState(gameId).override || '',
  });
}

// ---------- загрузка и восстановление ----------

/** Упаковать папки и загрузить новую версию в облако */
export async function uploadSaves(gameId: number, folder: SaveFolder, gameDir = ''): Promise<CloudSaveVersion> {
  const cs = electronCS();
  if (!cs) throw new Error('Облачные сохранения работают только в лаунчере');
  const packed = await cs.pack({ dirs: folder.dirs?.length ? folder.dirs : [folder.dir], gameDir });
  if (packed?.error) throw new Error(packed.error);
  try {
    const device = await (window as any).electron?.getDeviceInfo?.().catch(() => null);
    const { data: start } = await api.post(`/cloud-saves/${gameId}`, {
      size: packed.size, sha256: packed.sha256, fingerprint: packed.fingerprint, files: packed.files,
      saved_at: packed.savedAt, device_id: device?.id || '', device_name: device?.name || '',
    });
    const up = await cs.upload({ url: start.upload_url, file: packed.zip, contentType: start.content_type });
    if (up?.error) throw new Error(up.error);
    const { data: done } = await api.post(`/cloud-saves/${gameId}/${start.id}/commit`);
    setLocalState(gameId, { fingerprint: packed.fingerprint, versionId: done.save.id, syncedAt: Date.now() });
    return done.save as CloudSaveVersion;
  } catch (e) {
    void cs.removeTemp(packed.zip);
    throw e;
  }
}

/** Скачать версию из облака и разложить по папкам сохранений (текущие — в локальную копию) */
export async function restoreSaves(gameId: number, version: CloudSaveVersion, folder: SaveFolder | null, title: string, gameDir = '') {
  const cs = electronCS();
  if (!cs) throw new Error('Облачные сохранения работают только в лаунчере');
  const { data } = await api.get(`/cloud-saves/${gameId}/${version.id}/download`);
  const res = await cs.restore({ url: data.url, dirs: folder ? (folder.dirs?.length ? folder.dirs : [folder.dir]) : [], label: title, gameDir });
  if (res?.error) throw new Error(res.error);
  setLocalState(gameId, { fingerprint: res.fingerprint, versionId: version.id, syncedAt: Date.now() });
  return res as { backup: string; backups: string[]; dirs: string[]; fingerprint: string; files: number };
}

export const apiErrorText = (e: any, fallback: string) => e?.response?.data?.error || e?.message || fallback;

// ---------- автоматика ----------

type Confirm = (opts: { title: string; message: string; confirmText?: string; cancelText?: string }) => Promise<boolean>;

/**
 * Перед запуском игры: в облаке версия новее локальной (её загрузили с другого устройства
 * после нашей последней синхронизации) — предложить скачать. Ошибки не мешают запуску.
 */
export async function beforeLaunch(gameId: number, gameDir: string, confirm: Confirm): Promise<void> {
  if (!gameId || !cloudSavesAvailable()) return;
  const st = localState(gameId);
  if (st.auto === false) return;
  try {
    const info = await getCloudSaves(gameId);
    const latest = info.versions[0];
    if (!latest || latest.id === st.versionId) return;
    const meta = await gameMeta(gameId);
    const { best } = await findSaveFolder(gameId, { ...meta, gameDir });
    // локальные файлы не менялись с последней синхронизации и совпадают с облаком — нечего делать
    if (best && best.fingerprint === latest.fingerprint) {
      setLocalState(gameId, { fingerprint: best.fingerprint, versionId: latest.id });
      return;
    }
    if (!best) return; // папка неизвестна — восстанавливать некуда, это решит пользователь на странице игры
    const localChanged = !!st.fingerprint && best.fingerprint !== st.fingerprint;
    const when = new Date(latest.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const ok = await confirm({
      title: 'В облаке есть сохранения новее',
      message: `Сохранения «${meta.title}» загружены ${when}${latest.device_name ? ` с устройства «${latest.device_name}»` : ''}.` +
        (localChanged
          ? ' На этом компьютере сохранения тоже менялись с последней синхронизации — при скачивании они уйдут в локальную копию.'
          : ' Скачать их перед игрой? Текущие сохранения будут сохранены в локальную копию.'),
      confirmText: 'Скачать из облака',
      cancelText: 'Играть с локальными',
    });
    if (ok) await restoreSaves(gameId, latest, best, meta.title, gameDir);
  } catch (e) {
    console.warn('[cloud-saves] перед запуском:', e);
  }
}

/** После закрытия игры: сохранения изменились — загрузить новую версию (тихо, с уведомлением) */
export async function afterGameExit(gameId: number, gameDir: string): Promise<void> {
  if (!gameId || !cloudSavesAvailable()) return;
  const st = localState(gameId);
  if (st.auto === false) return;
  try {
    const meta = await gameMeta(gameId);
    const { best } = await findSaveFolder(gameId, { ...meta, gameDir });
    if (!best || best.files === 0 || best.fingerprint === st.fingerprint) return;
    const info = await getCloudSaves(gameId);
    if (!info.enabled) return; // без Pro загрузки нет
    await uploadSaves(gameId, best, gameDir);
    nativeNotify({ title: 'Сохранения в облаке', body: `«${meta.title}»: сохранения загружены в облако`, tag: `lh-cloud-${gameId}`, kind: 'notify' });
  } catch (e) {
    nativeNotify({ title: 'Облачные сохранения', body: apiErrorText(e, 'Не удалось загрузить сохранения в облако'), tag: `lh-cloud-${gameId}`, kind: 'notify' });
  }
}
