# Lustre — игровой лаунчер

Lustre — лаунчер для Windows и веб-клиент: каталог игр, библиотека и загрузки, друзья,
чаты и звонки, сообщества с голосовыми каналами, магазин кастомизации профиля и
офлайн-автоперевод игр на русский.

Этот репозиторий — **клиент** (Electron + React). Сервер (API) — отдельный закрытый проект;
клиент работает с ним по адресу из `VITE_API_URL`.

## Структура

| Путь | Что там |
| --- | --- |
| `src/` | интерфейс: React 19 + TypeScript + Vite, Tailwind CSS |
| `electron/` | главный процесс Electron: окна, установка игр, загрузки (qBittorrent), автообновление, автоперевод (`electron/translator/`) |
| `scripts/` | сборка, релиз, выкатка веб-версии, SEO-страницы |
| `scripts/dev/` | тестовые стенды для разработки (`npm run test:cache` и др.) |
| `build/` | иконки и скрипт установщика NSIS |
| `vendor/` | сторонние программы, которые кладутся рядом с приложением (в git не хранятся, см. [vendor/README.md](vendor/README.md)) |

### Админ-панель

Админка (управление каталогом, новостями и магазином) — закрытый модуль, в открытый код
не входит. Открытый код подключает её через [src/admin.ts](src/admin.ts) только если файлы
модуля есть в проекте; без них лаунчер собирается и работает — просто без админ-панели.
Официальная сборка подтягивает модуль из приватного репозитория: `npm run admin:pull`
(путь — `LUSTRE_ADMIN_DIR`, по умолчанию `../LustreAdmin`).

## Сборка

Нужны Node.js 20+ и Windows (лаунчер собирается под Windows x64).

```bash
npm install
npm run dev        # лаунчер в режиме разработки (Vite + Electron)
npm run dev:web    # только веб-версия в браузере
npm run lint
npm run dist       # установщик в папку из build.directories.output
```

Перед `npm run dist` положите в `vendor/` 7-Zip, qBittorrent и bergamot — откуда их взять,
описано в [vendor/README.md](vendor/README.md).

### Адрес сервера

`VITE_API_URL` подставляется на этапе сборки:

- `.env` — для разработки;
- `.env.production` — для боевой сборки (сейчас — сервер проекта `https://api.lustrehub.pro`).

Для своего сервера поменяйте адрес в этих файлах.

## Лицензия

Copyright © 2026 DewesDeveloper.

Lustre распространяется на условиях **GNU General Public License v3.0 или более поздней
версии** — см. [LICENSE](LICENSE). Вы можете использовать, изменять и распространять код,
если производные работы тоже распространяются под GPL с исходным кодом.

Сторонние компоненты (qBittorrent, 7-Zip, bergamot-translator, шрифты и др.) идут под своими
лицензиями — см. [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) и [vendor/README.md](vendor/README.md).

### Исходный код встроенных программ

Установщик Lustre содержит программы под GPL и LGPL без изменений. Их исходный код:

- qBittorrent 5.1.4 (GPL, см. COPYING в дистрибутиве) — https://github.com/qbittorrent/qBittorrent/tree/release-5.1.4
- 7-Zip 26.04 (LGPL-2.1 + unRAR restriction) — https://www.7-zip.org/download.html
- bergamot-translator 0.4.9 (MPL-2.0) — https://github.com/browsermt/bergamot-translator

Названия и логотипы Lustre — не часть лицензии GPL.
