import { useRef, useState } from 'react';
import { IconUpload, IconCrop, IconTrash, IconLoader2 } from '@tabler/icons-react';
import { PROFILE_IMAGE_ACCEPT, type ImageKind } from '../constants';

type Props = {
  kind: ImageKind;
  url: string;
  fallbackUrl?: string;
  uploading: boolean;
  error: string;
  uploadLimitMB: number;
  onFile: (file: File) => void;
  onRecrop: () => void;
  onRemove: () => void;
};

const isGif = (url: string) => /\.gif(\?|$)/i.test(url);

/** Поле аватара/баннера: превью, загрузка (кнопка или перетаскивание), кадр, удаление. */
export default function ProfileImageField({ kind, url, fallbackUrl, uploading, error, uploadLimitMB, onFile, onRecrop, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const avatar = kind === 'avatar';
  const shown = url || fallbackUrl || '';

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !uploading) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`flex gap-5 ${avatar ? 'items-center flex-wrap' : 'flex-col'} p-3 -m-3 border border-dashed transition-colors ${dragOver ? 'border-[var(--pink)] bg-[rgb(var(--accent-rgb)/.06)]' : 'border-transparent'}`}
    >
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        title="Загрузить изображение"
        className={`relative shrink-0 overflow-hidden group ${avatar ? 'tl-avatar-frame' : 'w-full border border-[var(--line)]'}`}
        style={avatar ? undefined : { aspectRatio: '4 / 1' }}
      >
        {shown ? (
          <img src={shown} alt="" draggable={false} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{ background: 'linear-gradient(120deg, rgb(var(--accent-rgb)/.38), rgba(131,56,236,.34) 55%, rgba(34,211,238,.18))' }}
          />
        )}
        <span className={`absolute inset-0 flex items-center justify-center bg-black/55 transition-opacity ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {uploading ? <IconLoader2 size={20} className="text-white animate-spin" /> : <IconUpload size={18} className="text-white" />}
        </span>
      </button>

      <div className={avatar ? 'flex-1 min-w-[200px]' : ''}>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="tl-btn solid disabled:opacity-50">
            <IconUpload size={14} /> Загрузить
          </button>
          <button
            type="button"
            disabled={uploading || !url || isGif(url)}
            onClick={onRecrop}
            title={isGif(url) ? 'GIF не кадрируется — анимация сохранилась бы только первым кадром' : undefined}
            className="tl-btn ghost disabled:opacity-40"
          >
            <IconCrop size={14} /> Изменить кадр
          </button>
          <button type="button" disabled={uploading || !url} onClick={onRemove} className="tl-btn ghost disabled:opacity-40">
            <IconTrash size={14} /> Убрать
          </button>
        </div>
        <p className="tl-term text-[14px] text-[var(--muted-2)] mt-2.5">
          PNG, JPG, WEBP или GIF до <b className="tl-muted">{uploadLimitMB} МБ</b> · можно перетащить файл сюда.
          {' '}{avatar ? 'Итог — квадрат 512×512.' : 'Итог — 1920×480, в шапке профиля видна центральная полоса.'}
          {' '}GIF загружается без кадрирования, анимация сохраняется.
        </p>
        {error && <p className="tl-term text-[14px] text-red-400 mt-1.5">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
