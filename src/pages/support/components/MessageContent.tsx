// Текст сообщения поддержки: ссылки кликабельны, картинки из нашего хранилища показываются
// картинкой. Мобильное приложение прикладывает файл строкой «Вложение: <ссылка>», и раньше
// в диалоге была видна только ссылка на бакет.
// Картинки с чужих адресов встраивать нельзя: открытие обращения сотрудником выдавало бы его IP.

import { useState } from 'react';
import ImageLightbox from '../../../components/ImageLightbox';

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const TRUSTED_IMAGE_HOSTS = [/^storage\.yandexcloud\.net$/i, /(^|\.)lustrehub\.pro$/i];

function isTrustedImage(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && TRUSTED_IMAGE_HOSTS.some((re) => re.test(u.hostname)) && IMAGE_RE.test(u.pathname);
  } catch {
    return false;
  }
}

export function MessageContent({ text }: { text: string }) {
  // картинка разворачивается поверх экрана, а не открывается ссылкой в новом окне
  const [open, setOpen] = useState<string | null>(null);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)]+$/, ''); // знак препинания после ссылки — не её часть
    const start = m.index ?? 0;
    let before = text.slice(last, start);
    if (isTrustedImage(url)) {
      // подпись «Вложение:» перед картинкой не нужна
      before = before.replace(/Вложение:\s*$/, '');
      parts.push(before);
      parts.push(
        <button key={start} type="button" onClick={() => setOpen(url)} className="my-1.5 block w-fit cursor-zoom-in" title="Открыть в полном размере">
          <img src={url} alt="Вложение" loading="lazy" className="max-h-72 max-w-full border border-[var(--line-2)] object-contain" />
        </button>,
      );
    } else {
      parts.push(before);
      parts.push(
        <a key={start} href={url} target="_blank" rel="noreferrer" className="break-all text-accent underline-offset-2 hover:underline">{url}</a>,
      );
    }
    last = start + url.length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts}
      {open && <ImageLightbox images={[open]} index={0} onIndex={() => {}} onClose={() => setOpen(null)} />}
    </>
  );
}
