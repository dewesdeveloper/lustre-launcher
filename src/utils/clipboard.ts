/**
 * Скопировать текст в буфер обмена. Если Clipboard API недоступен (старый WebView,
 * нет разрешения), — через временное скрытое поле. Возвращает, получилось ли.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      return document.execCommand('copy');
    } finally {
      field.remove();
    }
  }
}
