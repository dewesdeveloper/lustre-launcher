import api from './index';
import { nativeNotify } from '../utils/nativeNotify';

// Достижения игр Steam. Список и редкость — с сервера (он берёт их из Steam), открытые —
// из файлов эмулятора Steam в репаке: их читает лаунчер (electron/achievements.cjs)
// и отправляет на сервер. Во время игры лаунчер следит за файлом и показывает уведомление.

export type Achievement = {
  name: string;
  display_name: string;
  description: string;
  icon: string;
  icon_gray: string;
  hidden: boolean;
  /** доля игроков Steam, открывших достижение, % */
  global_percent: number;
  unlocked_at: string | null;
};

export type GameAchievements = {
  app_id: number;
  total: number;
  unlocked_count: number;
  achievements: Achievement[];
};

export type UserAchievementsSummary = {
  total: number;
  games_perfect: number;
  games: { app_id: number; game_id: number; title: string; cover: string; unlocked: number; total: number; last_at: string }[];
  recent: { game_id: number; title: string; name: string; display_name: string; description: string; icon: string; global_percent: number; unlocked_at: string }[];
};

type LocalUnlock = { name: string; unlocked_at: number };

export async function getGameAchievements(gameId: number): Promise<GameAchievements> {
  return (await api.get(`/games/${gameId}/achievements`)).data;
}

export async function getUserAchievements(userId: number): Promise<UserAchievementsSummary> {
  return (await api.get(`/users/${userId}/achievements`)).data;
}

/** Отправить открытые достижения; ответ — новые (их ещё не было на сервере) */
export async function syncAchievements(gameId: number, unlocked: LocalUnlock[]): Promise<{ new: Achievement[]; unlocked_count: number; total: number }> {
  return (await api.post('/achievements/sync', { game_id: gameId, unlocked })).data;
}

const electron = () => (window as any).electron;

/** Уведомление об открытых достижениях (в игре — в оверлее поверх игры) */
export function notifyAchievements(list: Achievement[], gameTitle = '') {
  const shown = list.slice(0, 3);
  for (const a of shown) {
    nativeNotify({
      title: `Достижение: ${a.display_name || a.name}`,
      body: a.description || gameTitle,
      icon: a.icon,
      kind: 'achievement',
      category: 'achievements',
      tag: `ach-${a.name}`,
    });
  }
  if (list.length > shown.length) {
    nativeNotify({ title: `И ещё ${list.length - shown.length} достиж.`, body: gameTitle, kind: 'achievement', category: 'achievements' });
  }
}

/**
 * Прочитать открытые достижения установленной игры с диска и отправить на сервер.
 * installedId — id игры в реестре лаунчера: к нему привязывается appid, чтобы следить во время игры.
 */
export async function syncLocalAchievements(gameId: number, appId: number, installedId?: string | number | null) {
  const bridge = electron()?.achievements;
  if (!bridge || !appId) return null;
  if (installedId != null) await bridge.bind({ id: installedId, appId, catalogId: gameId }).catch(() => false);
  const local = await bridge.read({ id: installedId ?? null, appId }).catch(() => null);
  if (!local?.unlocked?.length) return null;
  return syncAchievements(gameId, local.unlocked);
}

/** Слушать достижения, открытые во время игры: на сервер и уведомление. Возвращает отписку. */
export function listenAchievementUnlocks(): () => void {
  const bridge = electron()?.achievements;
  if (!bridge?.onUnlocked) return () => {};
  return bridge.onUnlocked(async (e: { catalogId: number; name?: string; unlocked: LocalUnlock[] }) => {
    if (!e?.catalogId || !e.unlocked?.length) return;
    try {
      const res = await syncAchievements(e.catalogId, e.unlocked);
      if (res.new?.length) notifyAchievements(res.new, e.name || '');
    } catch {
      // нет сети или не вошли — покажем хотя бы техническое имя, на сервер уйдёт при следующем заходе
      notifyAchievements(e.unlocked.map((u) => ({ name: u.name, display_name: '', description: '', icon: '', icon_gray: '', hidden: false, global_percent: 0, unlocked_at: null })), e.name || '');
    }
  });
}
