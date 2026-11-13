import { admin } from '../../../../admin';
import React from 'react';
import { Monitor, Play, Loader2, Download, Heart, Pencil, Trash2, LogIn } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import type { Game } from '../../types';
import SourcePickerModal, { type DownloadSource } from '../SourcePickerModal';
import ItchFilePickerModal from '../ItchFilePickerModal';
import PathPickerModal from '../PathPickerModal';
import { fetchItchFiles, type ItchFile } from '../../itchFiles';
import { getAppPaths } from '../../../../utils/appPaths';
import { useDialog } from '../../../../components/Dialogs';
import { useAuth } from '../../../../context/AuthContext';
import { DOWNLOAD_WINDOWS_URL } from '../../../../utils/downloads';

interface GameActionsProps {
  game: Game;
  navigate: NavigateFunction;
  installed: any | null;
  launching: boolean;
  inLibrary: boolean;
  favorite: boolean;
  /** Показывать «Редактировать игру» (admin и manager). */
  canEdit: boolean;
  /** Показывать удаление — только администратор. */
  isAdmin: boolean;
  onPlay: () => void;
  onToggleLibrary: () => void;
  onToggleFavorite: () => void;
}

const GameActions: React.FC<GameActionsProps> = ({
  game,
  navigate,
  installed,
  launching,
  inLibrary,
  favorite,
  canEdit,
  isAdmin,
  onPlay,
  onToggleLibrary,
  onToggleFavorite,
}) => {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [itchFiles, setItchFiles] = React.useState<ItchFile[]>([]);
  const [itchLoading, setItchLoading] = React.useState(false);
  const [itchPickerOpen, setItchPickerOpen] = React.useState(false);
  // Страница игры на itch.io: по ней лаунчер получит новую ссылку, если эта протухнет при обрыве
  const itchPage = React.useRef('');
  // Выбор пути скачивания: показывается при каждом действии, пока не отмечено
  // «Не показывать снова» (вернуть можно в Настройки → Хранилище)
  const [pathPrompt, setPathPrompt] = React.useState<{ source: DownloadSource; resolved: boolean; filename: string } | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const dlg = useDialog();
  const { user } = useAuth();

  const handleDelete = async () => {
    const ok = await dlg.confirm({
      title: 'Удалить игру',
      message: `Удалить «${game.title}» из каталога? Действие необратимо.`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      if (admin && await admin.deleteGame(game.ID, dlg)) navigate('/store');
      else setDeleting(false);
    } catch (err: any) {
      setDeleting(false);
      await dlg.alert({ title: 'Не удалось удалить игру', message: err?.response?.data?.error || 'Ошибка сервера', danger: true });
    }
  };
  const hasSources = (game.sources?.length || 0) > 0;
  const canDownload = hasSources || !!game.magnet_uri;

  // itch.io: список файлов резолвим через бэкенд (Windows-сборка идёт первой).
  // Если файлов несколько (несколько сборок Windows, apk, macOS…) —
  // показываем выбор, как для источников скачивания.
  const download = async (source: DownloadSource, resolved = false, filename = '', prompted = false) => {
    // Спрашиваем путь скачивания каждый раз, пока пользователь не нажал
    // «Не показывать снова» (в веб-режиме настроек путей нет — пропускаем).
    if (!prompted) {
      const paths = await getAppPaths();
      if (paths?.askDownloadDir) {
        setPathPrompt({ source, resolved, filename });
        return;
      }
    }

    const electron = (window as any).electron;
    let kind = source.kind || 'torrent';
    let locator = kind === 'torrent' ? source.magnet_uri : source.url;
    let downloadName = filename;
    if (!locator) return;

    // Web-версия: торренты недоступны в браузере — предлагаем десктоп-приложение.
    // Прямые HTTP-ссылки открываем как есть (скачивает сам браузер).
    if (!electron && kind === 'torrent') {
      const ok = await dlg.confirm({
        title: 'Установка в приложении',
        message: 'Игры скачиваются через торрент в десктоп-приложении Lustre для Windows. Скачать приложение?',
        confirmText: 'Скачать приложение',
      });
      if (ok) window.location.href = DOWNLOAD_WINDOWS_URL;
      return;
    }

    if (!resolved) itchPage.current = '';
    if (!resolved && (kind === 'itch' || (/itch\.io/i.test(locator) && kind !== 'torrent'))) {
      itchPage.current = locator;
      // Окно выбора файла открываем сразу с лоадером — между «Выбором
      // источника» и файлами не должно быть пустой паузы на резолве.
      setItchFiles([]);
      setItchLoading(true);
      setItchPickerOpen(true);
      try {
        const files = await fetchItchFiles(locator);
        setItchLoading(false);
        if (files.length === 0) throw new Error('empty');
        if (files.length > 1) {
          setItchFiles(files);
          return;
        }
        setItchPickerOpen(false);
        locator = files[0].url;
        downloadName = files[0].filename || '';
        kind = 'direct';
      } catch (e: any) {
        setItchLoading(false);
        setItchPickerOpen(false);
        await dlg.alert({
          title: 'itch.io',
          message:
            e?.response?.data?.error ||
            'Не удалось получить ссылку на файл itch.io. Проверьте ITCH_API_KEY на сервере или добавьте прямую ссылку.',
        });
        return;
      }
    }

    if (kind === 'torrent' && electron?.torrentAdd) {
      const res = await electron.torrentAdd({
        magnetURI: locator,
        gameId: game.ID,
        gameTitle: game.title,
      });
      // Обе ошибки (нет qB и нет встроенного движка) должны быть видны —
      // иначе пользователь попадает в пустые «Загрузки» без объяснений
      if (res?.error) {
        await dlg.alert({
          title: 'Скачивание недоступно',
          message: res.error,
          danger: true,
        });
        return;
      }
      navigate('/downloads');
    } else if (kind !== 'torrent' && electron?.httpDownload) {
      await electron.httpDownload({
        url: locator,
        kind,
        gameId: game.ID,
        gameTitle: game.title,
        filename: downloadName,
        refreshFrom: itchPage.current,
      });
      navigate('/downloads');
    } else {
      window.open(locator, '_blank');
    }
  };

  const handleDownload = async () => {
    if (hasSources) {
      setPickerOpen(true);
      return;
    }
    await download({ kind: 'torrent', magnet_uri: game.magnet_uri });
  };

  return (
    <div className="space-y-3">
      {installed && (
        <>
          <button
            onClick={onPlay}
            disabled={launching}
            className="tl-btn solid block"
          >
            {launching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="fill-current" />}
            {launching ? 'Запуск...' : 'Играть'}
          </button>
          <button
            onClick={() => navigate(`/library/games/${game.ID}`)}
            className="tl-btn ghost block"
          >
            <Monitor size={14} /> Управление
          </button>
        </>
      )}
      {!installed && canDownload && inLibrary && (
        <button
          onClick={handleDownload}
          className="tl-btn solid block"
        >
          <Download size={14} /> Скачать
        </button>
      )}
      {/* Гость: библиотека требует входа — вместо «Добавить» показываем кнопку входа */}
      {!user ? (
        <button
          onClick={() => navigate('/login')}
          className="tl-btn solid block"
        >
          <LogIn size={14} /> Войти, чтобы играть
        </button>
      ) : (
        <button
          onClick={onToggleLibrary}
          className={`tl-btn block ${inLibrary ? '' : 'ghost'}`}
        >
          <Heart size={14} className={favorite ? 'fill-accent' : ''} />
          {inLibrary ? 'В библиотеке' : 'Добавить в библиотеку'}
        </button>
      )}
      {user && inLibrary && (
        <button
          onClick={onToggleFavorite}
          className={`tl-btn block ${favorite ? '' : 'ghost'}`}
        >
          <Heart size={14} className={favorite ? 'fill-yellow-400 text-yellow-400' : ''} />
          {favorite ? 'В избранном' : 'В избранное'}
        </button>
      )}
      {canEdit && (
        <button
          onClick={() => navigate(`/edit-game/${game.ID}`)}
          className="tl-btn ghost block"
        >
          <Pencil size={14} /> Редактировать игру
        </button>
      )}
      {isAdmin && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="tl-btn danger block"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Удалить игру
        </button>
      )}

      {hasSources && (
        <SourcePickerModal
          open={pickerOpen}
          gameTitle={game.title}
          sources={game.sources}
          onClose={() => setPickerOpen(false)}
          onPick={(s) => {
            setPickerOpen(false);
            download(s);
          }}
        />
      )}

      <ItchFilePickerModal
        open={itchPickerOpen}
        gameTitle={game.title}
        files={itchFiles}
        loading={itchLoading}
        onClose={() => { setItchPickerOpen(false); setItchLoading(false); }}
        onPick={(f) => {
          setItchPickerOpen(false);
          // prompted=true: выбор пути уже подтверждён до резолва itch
          download({ kind: 'direct', url: f.url }, true, f.filename, true);
        }}
      />

      <PathPickerModal
        open={!!pathPrompt}
        kind="download"
        gameTitle={game.title}
        onClose={() => setPathPrompt(null)}
        onConfirm={() => {
          const p = pathPrompt;
          setPathPrompt(null);
          if (p) void download(p.source, p.resolved, p.filename, true);
        }}
      />
    </div>
  );
};

export default GameActions;
