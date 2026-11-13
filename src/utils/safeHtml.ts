// HTML из внешних источников (описания игр из Steam/itch.io, от менеджеров) перед выводом
// через dangerouslySetInnerHTML. Сервер тоже чистит описания, это второй рубеж: окно
// лаунчера умеет устанавливать и запускать файлы, поэтому скрипт в описании = выполнение
// кода на компьютере игрока.
import DOMPurify from 'dompurify';

// Ссылки из описаний — всегда в новое окно (лаунчер отправит их в системный браузер)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Встроенные видео — только YouTube и Vimeo (как в серверном фильтре импорта itch.io)
const VIDEO_EMBED_RE = /^https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\/(?:embed|video)\//i;
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const src = (node as Element).getAttribute?.('src') || '';
    if (!VIDEO_EMBED_RE.test(src)) node.parentNode?.removeChild(node);
  }
});

export function safeHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allowfullscreen', 'frameborder'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed'],
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
  });
}

/** Текст без тегов. DOMParser не загружает картинки и не выполняет обработчики событий
 *  (в отличие от innerHTML на временном элементе, где <img onerror> срабатывал). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}
