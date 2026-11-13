const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  openFriends: () => ipcRenderer.send('open-friends-window'),
  openSettings: () => ipcRenderer.send('open-settings-window'),
  closeSettingsWindow: () => ipcRenderer.invoke('close-settings-window'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  quitApp: () => ipcRenderer.send('quit-app'),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  toggleGameOverlay: () => ipcRenderer.invoke('toggle-game-overlay'),
  hideGameOverlay: () => ipcRenderer.send('hide-game-overlay'),
  // Игровой оверлей: состояние (игра, настройки), скриншоты, тосты
  overlayGetState: () => ipcRenderer.invoke('overlay-get-state'),
  overlaySetPrefs: (patch) => ipcRenderer.invoke('overlay-set-prefs', patch),
  onOverlayState: (callback) => {
    const handler = (_e, state) => callback(state);
    ipcRenderer.on('overlay-state', handler);
    return () => ipcRenderer.removeListener('overlay-state', handler);
  },
  onOverlayOpen: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('overlay-open', handler);
    return () => ipcRenderer.removeListener('overlay-open', handler);
  },
  onOverlayToast: (callback) => {
    const handler = (_e, toast) => callback(toast);
    ipcRenderer.on('overlay-toast', handler);
    return () => ipcRenderer.removeListener('overlay-toast', handler);
  },
  overlayToastsEmpty: () => ipcRenderer.send('overlay-toasts-empty'),
  overlayScreenshot: () => ipcRenderer.invoke('overlay-screenshot'),
  overlayListScreenshots: () => ipcRenderer.invoke('overlay-list-screenshots'),
  overlayOpenScreenshot: (file) => ipcRenderer.send('overlay-open-screenshot', file),
  overlayOpenScreenshotsFolder: () => ipcRenderer.send('overlay-open-screenshots-folder'),
  overlayOpenInLauncher: (route) => ipcRenderer.send('overlay-open-in-launcher', route),
  openAccountPicker: (hideMain) => ipcRenderer.invoke('open-account-picker', hideMain),
  openChatWindow: (targetUserId) => ipcRenderer.send('open-chat-window', targetUserId),
  oauthOpen: (payload) => ipcRenderer.send('oauth-open', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onOAuthDone: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('oauth-done', handler);
    return () => ipcRenderer.removeListener('oauth-done', handler);
  },
  startGroupCall: (payload) => ipcRenderer.send('start-group-call', payload),
  onStartGroupCall: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('start-group-call', handler);
    return () => ipcRenderer.removeListener('start-group-call', handler);
  },
  startCall: (peer) => ipcRenderer.send('start-call', peer),
  onStartCall: (callback) => {
    const handler = (_event, peer) => callback(peer);
    ipcRenderer.on('start-call', handler);
    return () => ipcRenderer.removeListener('start-call', handler);
  },
  showMainWindow: () => ipcRenderer.send('show-main-window'),
  onChatTarget: (callback) => {
    const handler = (_event, targetUserId) => callback(targetUserId);
    ipcRenderer.on('chat-window-target', handler);
    return () => ipcRenderer.removeListener('chat-window-target', handler);
  },
  closeAccountPicker: (payload) => ipcRenderer.send('close-account-picker', payload),
  onForceLogout: (callback) => ipcRenderer.on('force-logout', (event, username) => callback(username)),
  onGameState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('game-state', handler);
    return () => ipcRenderer.removeListener('game-state', handler);
  },
  // Нативные уведомления Windows (системные тосты)
  showNotification: (opts) => ipcRenderer.invoke('notify-show', opts),
  onNotifyClick: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('notify-click', handler);
    return () => ipcRenderer.removeListener('notify-click', handler);
  },
  // Рация: главный процесс слушает только выбранную клавишу, даже когда фокус у игры
  pttSetKey: (code) => ipcRenderer.invoke('ptt-set-key', code),
  onPtt: (callback) => {
    const handler = (_event, down) => callback(down);
    ipcRenderer.on('ptt', handler);
    return () => ipcRenderer.removeListener('ptt', handler);
  },
  // Защищённое хранилище (системное шифрование): токены доверенных устройств
  secureStore: {
    get: (key) => ipcRenderer.sendSync('secure-store:get', key),
    set: (key, value) => ipcRenderer.sendSync('secure-store:set', key, value),
    remove: (key) => ipcRenderer.sendSync('secure-store:remove', key),
  },
  updateTrayGames: (games) => ipcRenderer.send('update-tray-games', games),
  onNavigate: (callback) => ipcRenderer.on('navigate', (event, route) => callback(route)),
  // Демонстрация экрана: список источников + выбор конкретного
  getDesktopSources: () => ipcRenderer.invoke('desktop-sources'),
  setShareSource: (sourceId) => ipcRenderer.send('set-share-source', sourceId),
  openInMain: (route) => ipcRenderer.send('open-in-main', route),
  setZoomFactor: (factor) => ipcRenderer.invoke('set-zoom-factor', factor),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
  // Окно обязательного обновления: статус/прогресс и повтор после ошибки
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  retryUpdate: () => ipcRenderer.invoke('update:retry'),
  onUpdateState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('update-state', handler);
    return () => ipcRenderer.removeListener('update-state', handler);
  },
  // Автозапуск лаунчера вместе с Windows
  loginItemGet: () => ipcRenderer.invoke('login-item:get'),
  loginItemSet: (enabled) => ipcRenderer.invoke('login-item:set', enabled),
  // Torrent
  torrentAdd: (opts) => ipcRenderer.invoke('torrent-add', opts),
  torrentPause: (id) => ipcRenderer.invoke('torrent-pause', id),
  torrentResume: (id) => ipcRenderer.invoke('torrent-resume', id),
  torrentRemove: (opts) => ipcRenderer.invoke('torrent-remove', opts),
  torrentList: () => ipcRenderer.invoke('torrent-list'),
  torrentPeers: (magnets) => ipcRenderer.invoke('torrent-peers', magnets),
  // Порт веб-интерфейса qBittorrent (настройки → Хранилище): лаунчер
  // подключается к Web API по этому порту, менять можно отсюда
  qbWebPortGet: () => ipcRenderer.invoke('qb-webport-get'),
  qbWebPortSet: (port) => ipcRenderer.invoke('qb-webport-set', port),
  qbModeGet: () => ipcRenderer.invoke('qb-mode-get'),
  qbModeSet: (mode) => ipcRenderer.invoke('qb-mode-set', mode),
  // Подключение и автонастройка Web UI без ручной возни в qBittorrent
  qbWebConnect: () => ipcRenderer.invoke('qb-webconnect'),
  qbAutoSetup: (port) => ipcRenderer.invoke('qb-autosetup', port),
  qbWebCredsGet: () => ipcRenderer.invoke('qb-webcreds-get'),
  qbWebCredsSet: (user, pass) => ipcRenderer.invoke('qb-webcreds-set', { user, pass }),
  httpDownload: (opts) => ipcRenderer.invoke('http-download-start', opts),
  httpRelink: (id, url) => ipcRenderer.send('http-relink', { id, url }),
  onHttpLinkExpired: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('http-link-expired', handler);
    return () => ipcRenderer.removeListener('http-link-expired', handler);
  },
  // Подписки возвращают функцию отписки — иначе каждое открытие страницы добавляло обработчик
  onTorrentUpdate: (callback) => {
    const handler = (_event, downloads) => callback(downloads);
    ipcRenderer.on('torrent-updates', handler);
    return () => ipcRenderer.removeListener('torrent-updates', handler);
  },
  // Installation
  installGame: (id) => ipcRenderer.invoke('install-game', id),
  installedGames: () => ipcRenderer.invoke('installed-games'),
  launchGame: (id) => ipcRenderer.invoke('launch-game', id),
  pickGameExe: () => ipcRenderer.invoke('pick-exe'),
  setGameExe: (id, exePath) => ipcRenderer.invoke('set-game-exe', id, exePath),
  // Пути скачивания/установки (машинные настройки, Настройки → Хранилище)
  appPathsGet: () => ipcRenderer.invoke('paths:get'),
  appPathsSet: (patch) => ipcRenderer.invoke('paths:set', patch),
  uninstallGame: (id) => ipcRenderer.invoke('uninstall-game', id),
  revealGame: (id) => ipcRenderer.invoke('reveal-game', id),
  storageScan: (force) => ipcRenderer.invoke('storage-scan', force),
  diskSpace: () => ipcRenderer.invoke('disk-space'),
  createShortcut: (id) => ipcRenderer.invoke('create-shortcut', id),
  // Автоперевод игры на русский (офлайн): статус, запуск, отмена, откат, прогресс
  translatorStatus: (id) => ipcRenderer.invoke('translator:status', id),
  translatorRun: (id) => ipcRenderer.invoke('translator:run', id),
  translatorCancel: () => ipcRenderer.invoke('translator:cancel'),
  translatorRevert: (id) => ipcRenderer.invoke('translator:revert', id),
  onTranslatorProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('translator-progress', handler);
    return () => ipcRenderer.removeListener('translator-progress', handler);
  },
  onInstallProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('install-progress', handler);
    return () => ipcRenderer.removeListener('install-progress', handler);
  },
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
})
