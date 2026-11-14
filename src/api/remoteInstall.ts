import api from '.';
import { onChatEvent, sendWS } from './chat';
import { notifyLibraryChanged } from '../utils/libraryEvents';

// Удалённая установка с телефона: лаунчер сообщает серверу, на каком он компьютере
// (device.hello при каждом подключении WS), и получает команды remote.install —
// «поставь игру на загрузку». Статус (началась / не удалась) уходит обратно на телефон.

export type RemoteInstallCommand = {
  install_id: number;
  game_id: number;
  source_index: number; // -1 — старый magnet игры
  game_title?: string;
};

/** Состояние перехода на страницу игры: страница сама запустит загрузку */
export type RemoteInstallState = { remoteInstall: RemoteInstallCommand };

export function reportRemoteInstall(installId: number, status: 'started' | 'failed', error = '') {
  sendWS({ type: 'remote.install.status', install_id: installId, status, error: error.slice(0, 300) }, { queue: true });
}

/** Подписка (только в Electron): onCommand открывает страницу игры с командой */
export function initRemoteInstall(onCommand: (cmd: RemoteInstallCommand) => void): () => void {
  const electron = (window as any).electron;
  if (!electron?.getDeviceInfo) return () => {};

  return onChatEvent((ev: any) => {
    if (ev?.type === '__open') {
      void electron.getDeviceInfo().then((info: any) => {
        if (!info?.id) return;
        sendWS({
          type: 'device.hello',
          device_id: String(info.id),
          device_name: String(info.name || ''),
          platform: String(info.platform || ''),
          app_version: String(info.version || ''),
        });
      }).catch(() => {});
      return;
    }
    if (ev?.type !== 'remote.install' || !ev.install_id || !ev.game_id) return;
    const cmd: RemoteInstallCommand = {
      install_id: Number(ev.install_id),
      game_id: Number(ev.game_id),
      source_index: Number(ev.source_index ?? 0),
      game_title: ev.game_title ? String(ev.game_title) : undefined,
    };
    // игра должна быть в библиотеке — иначе страница библиотеки её не покажет
    api.post('/library/add', { game_id: cmd.game_id })
      .catch(() => { /* уже в библиотеке */ })
      .finally(() => {
        notifyLibraryChanged();
        void electron.showNotification?.({
          title: 'Загрузка с телефона',
          body: cmd.game_title ? `«${cmd.game_title}» поставлена на загрузку` : 'Игра поставлена на загрузку',
        });
        onCommand(cmd);
      });
  });
}
