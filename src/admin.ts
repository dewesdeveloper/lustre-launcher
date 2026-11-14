// Админка Lustre — закрытый модуль (src/pages/admin/, src/api/admin.ts), в открытый код не входит.
// Официальные сборки подключают его скриптом `npm run admin:pull` (см. README); в сборке из
// открытого кода его нет — тогда маршрутов, кнопок и пунктов меню админки нет.
import type { FC, ReactNode } from 'react';
import type { useDialog } from './components/Dialogs';

export interface AdminModule {
  /** Маршруты админки (<Route> внутри общего <Routes>) */
  adminRoutes: ReactNode;
  /** Кнопка «Админ» в шапке */
  AdminNavButton: FC<{ compact?: boolean }>;
  /** Удаление игры из каталога с подтверждением (true — удалена) */
  deleteGame: (id: number | string, dlg: ReturnType<typeof useDialog>) => Promise<boolean>;
  /** Выдача/отзыв Pro и изменение баланса пользователя (на странице подписок) */
  ProGrantPanel: FC<{ onGranted: () => void }>;
  /** Счётчик для колокольчика (персоналу: например, новые версии игр каталога) */
  useBellCount?: () => number;
  /** Раздел колокольчика для персонала; count — значение useBellCount */
  BellSection?: FC<{ count: number; onClose: () => void }>;
}

// Vite подставляет модуль, только если файл есть в проекте (пустой объект — если нет)
const found = import.meta.glob<{ default: AdminModule }>('./pages/admin/module.tsx', { eager: true });

export const admin: AdminModule | null = Object.values(found)[0]?.default ?? null;
/** Есть ли в этой сборке админка */
export const hasAdmin = admin !== null;
