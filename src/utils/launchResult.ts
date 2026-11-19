// Результат запуска игры (launch-game): раньше ошибки только писались в консоль, и игрок видел
// системное окно Windows вроде «не обнаружила steam_api.dll» без объяснений. Здесь — понятные окна.

type Dialogs = {
  confirm: (opts: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
  alert: (opts: { title?: string; message: string }) => Promise<void>;
};

export type DefenderRemoval = { file: string; threat: string; at: string };
export type LaunchResult = { ok?: boolean; error?: string; defenderRemoved?: DefenderRemoval[]; gameName?: string } | null | undefined;

const electron = () => (window as any).electron;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/**
 * Разобрать ответ запуска. true — игра запущена.
 * Если Защитник убрал файлы игры — объясняем и предлагаем открыть журнал защиты или запустить как есть.
 */
export async function handleLaunchResult(id: string, res: LaunchResult, dlg: Dialogs): Promise<boolean> {
  if (res?.defenderRemoved?.length) {
    const list = res.defenderRemoved
      .slice(0, 5)
      .map((r) => `• ${r.file}${r.threat ? ` — ${r.threat}` : ''}${r.at ? ` (${when(r.at)})` : ''}`)
      .join('\n');
    const crack = res.defenderRemoved.some((r) => /steam_api|hacktool|crack/i.test(`${r.file} ${r.threat}`));
    const open = await dlg.confirm({
      title: 'Защитник Windows удалил файлы игры',
      message:
        `Из папки «${res.gameName || 'игры'}» Защитник Windows убрал в карантин:\n${list}\n\n` +
        (crack
          ? 'Обычно это кряк (HackTool — «инструмент взлома»): без него игра не запустится и покажет ошибку о пропавшем файле. '
          : 'Без этих файлов игра, скорее всего, не запустится. ') +
        'Если вы доверяете раздаче, откройте «Журнал защиты», найдите эти файлы и выберите «Действия → Восстановить» — ' +
        'Защитник запомнит их, остальная защита продолжит работать. Если не доверяете — удалите игру и выберите другой источник.',
      confirmText: 'Открыть журнал защиты',
      cancelText: 'Закрыть',
    });
    if (open) {
      await electron()?.openDefenderHistory?.();
      // после восстановления игрок нажмёт «Играть» снова — проверка пройдёт сама
    }
    return false;
  }
  if (res?.error) {
    await dlg.alert({ title: 'Не удалось запустить игру', message: res.error });
    return false;
  }
  return !!res?.ok || !res;
}

/** Запустить игру и показать понятное окно, если не вышло. true — запущена. */
export async function launchGameWithChecks(id: string, dlg: Dialogs): Promise<boolean> {
  const res = (await electron()?.launchGame?.(id)) as LaunchResult;
  return handleLaunchResult(id, res, dlg);
}
