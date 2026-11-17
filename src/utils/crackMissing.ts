// Репак поставился без кряка (см. electron/crackCheck.cjs): в мастере установщика был выбор
// «Crack version / Steam version», а тихая установка взяла вариант для Steam. Игра в таком виде
// откроет магазин Steam. Предлагаем переустановить с мастером — установочные файлы лаунчер сохранил.

type Dialogs = {
  confirm: (opts: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
  alert: (opts: { title?: string; message: string }) => Promise<void>;
};

const electron = () => (window as any).electron;

export const CRACK_MISSING_TEXT =
  'В папке игры осталась оригинальная библиотека Steam, кряка нет — при запуске игра, скорее всего, откроет магазин Steam. ' +
  'Так бывает, когда в установщике репака есть выбор «Crack version / Steam version», а тихая установка выбрала версию для Steam.';

/** Переустановить с мастером репака. true — мастер запущен. */
export async function reinstallWithWizard(id: string, name: string, dlg: Dialogs): Promise<boolean> {
  const res = await electron()?.reinstallWithWizard?.(id);
  if (res?.error) {
    await dlg.alert({ title: 'Не удалось переустановить', message: res.error });
    return false;
  }
  await dlg.alert({
    title: 'Откроется установщик',
    message: `Установщик «${name}» запущен. В мастере выберите вариант с кряком (обычно «Crack version»). ` +
      `Лаунчер рекомендует ставить игры в свою папку games${res?.suggestedDir ? ` — она уже подставлена в мастер: «${res.suggestedDir}»` : ''}. ` +
      'Тогда лаунчер сам найдёт игру, а при удалении сотрёт её целиком. Не выбирайте папку Steam или Program Files. ' +
      'После установки укажите exe игры на её странице.',
  });
  return true;
}

/** Окно сразу после установки: переустановить с мастером или пока оставить. true — мастер запущен. */
export async function askCrackMissing(id: string, name: string, dlg: Dialogs): Promise<boolean> {
  const go = await dlg.confirm({
    title: 'Кряк не установлен',
    message: `«${name}»: ${CRACK_MISSING_TEXT}`,
    confirmText: 'Переустановить с мастером',
    cancelText: 'Позже',
  });
  return go ? reinstallWithWizard(id, name, dlg) : false;
}

/** Поставить кряк, выбранный игроком из нескольких найденных в раздаче. Ошибка — текстом. */
export async function applyChosenCrack(id: string, optionId: string): Promise<string | void> {
  const res = await electron()?.applyCrack?.(id, optionId);
  if (res?.error) return res.error;
}

/** Оставить установку как есть: сохранённый установщик удаляется */
export async function keepWithoutCrack(id: string, dlg: Dialogs): Promise<boolean> {
  const ok = await dlg.confirm({
    title: 'Оставить как есть',
    message: 'Предупреждение больше не появится, а сохранённые установочные файлы будут удалены. ' +
      'Переустановить с мастером потом можно будет только после нового скачивания.',
    confirmText: 'Оставить и удалить установщик',
    danger: true,
  });
  if (!ok) return false;
  await electron()?.crackDismiss?.(id);
  return true;
}
