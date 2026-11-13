# vendor — бинарники, которые кладутся рядом с приложением (resources/vendor)

Файлы из этой папки попадают в дистрибутив через `extraResources` в `package.json`
(см. `build.extraResources`) как **настоящие файлы** рядом с `app.asar`, поэтому их
можно запускать через `child_process.spawn` — в отличие от бинарников внутри `node_modules`
(там `app.asar` — архив, `spawn` вернёт ENOENT).

## 7z/ — полный7-Zip (консольная версия)

- `7z.exe` + `7z.dll` — официальный дистрибутив с https://www.7-zip.org (x64, 26.04),
  извлечённый из официального установщика 7-Zip 26.04 x64; `License.txt` — лицензия7-Zip (LGPL).
- Зачем: в `node_modules/7zip-bin` лежит `7za.exe` («alone»), он **не умеет распаковывать RAR**
  (проверено: форматы 7za — 7z/Cab/ZIP/tar/lzma, rar падает). Этот полный `7z.exe`
  умеет и RAR4, и RAR5 — им распаковываются rar-репаки у пользователей без WinRAR/7-Zip.
- Путь в сборке: `process.resourcesPath + '/vendor/7z/7z.exe'`;
  в dev — `<проект>/vendor/7z/7z.exe` (см. `electron/installer.cjs`, `get7z()`).

Дистрибутив7-Zip можно распространять в неизменённом виде (лицензия7-Zip, LGPL);
оригинальный `License.txt` сохранён рядом.

## qbittorrent/ — встроенный торрент-клиент

- qBittorrent 5.1.4 x64 без изменений: `qbittorrent.exe` переименован в `lustre-torrent.exe`
  (установщик закрывает процесс по имени и не затрагивает клиент пользователя, см. `build/installer.nsh`),
  рядом `qt.conf` и `translations/qtbase_ru.qm` из официального дистрибутива.
- Как собрать папку: установить qBittorrent с https://www.qbittorrent.org/download и скопировать эти файлы.
- Лицензия: GPLv3+ (`COPYING*`). Исходный код версии:
  https://github.com/qbittorrent/qBittorrent/tree/release-5.1.4
- Настройка и запуск: `electron/qbManaged.cjs`.

## bergamot/ — офлайн-движок машинного перевода (автоперевод игр)

- `bergamot-translator-worker.wasm` + `bergamot-translator-worker.js` — без изменений из npm-пакета
  `@browsermt/bergamot-translator@0.4.9` (папка `worker/`). Лицензия MPL-2.0,
  исходники: https://github.com/browsermt/bergamot-translator
- Как обновить: `npm pack @browsermt/bergamot-translator@<версия>`, распаковать и скопировать эти два файла.
- Запускается в `worker_threads` главного процесса (`electron/translator/mt-worker.cjs`);
  обёртку из пакета (`translator.js`) не используем: она не работает в Node без доработок.
- Модель en→ru (~21 МБ) в установщик не входит: скачивается при первом переводе в
  `%APPDATA%/LustreHub/translator/models/en-ru` и проверяется по SHA-256 (см. `electron/translator/mt.cjs`).
