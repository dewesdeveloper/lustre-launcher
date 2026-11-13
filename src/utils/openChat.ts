// Открытие окна чата: в Electron — отдельное BrowserWindow, в браузере — popup-окно
export function openChatWindow(targetUserId?: number) {
  const electron = (window as any).electron;
  if (electron?.openChatWindow) {
    electron.openChatWindow(targetUserId);
    return;
  }
  const hash = targetUserId ? `/chat-window?user=${targetUserId}` : '/chat-window';
  window.open(
    `${window.location.origin}/#${hash}`,
    'Чат LustreHub',
    'width=920,height=640,menubar=no,toolbar=no,location=no,status=no'
  );
}
