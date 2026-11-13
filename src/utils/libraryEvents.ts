// Событие об изменении библиотеки — боковая панель и другие экраны обновляются динамически.
export const LIBRARY_CHANGED_EVENT = 'library:changed';

export function notifyLibraryChanged() {
  try {
    window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
