import { API_URL } from '../api/config';

/** Прямые ссылки на установочные файлы: сервер отвечает редиректом на свежий файл релиза,
 *  браузер сразу начинает загрузку и остаётся на текущей странице. */
export const DOWNLOAD_WINDOWS_URL = `${API_URL}/download/windows`;
export const DOWNLOAD_ANDROID_URL = `${API_URL}/download/android`;
