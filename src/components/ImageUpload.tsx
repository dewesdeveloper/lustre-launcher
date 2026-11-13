import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from './../api';
import { Dropzone } from './upload/Dropzone';
import { UploadPreview } from './upload/UploadPreview';

interface Props {
  folder: string;
  userId?: number;
  gameId?: number;
  currentUrl?: string;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  className?: string;
  label?: string;
  accept?: string;
  /** Лимит размера файла в МБ (по умолчанию 10) */
  maxSizeMB?: number;
  // Обработка файла перед загрузкой (например, редактор): вернуть File или null для отмены
  onProcess?: (file: File) => Promise<File | null>;
}

const ImageUpload = ({ folder, userId, gameId, currentUrl, onUpload, onRemove, className = '', label, accept = 'image/*', maxSizeMB = 10, onProcess }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const limitBytes = maxSizeMB * 1024 * 1024;
    if (file.size > limitBytes) {
      setError(`Максимальный размер файла — ${maxSizeMB} МБ`);
      return;
    }

    setError('');
    setUploading(true);

    let finalFile = file;
    let localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    try {
      if (onProcess) {
        const processed = await onProcess(file);
        if (!processed) {
          URL.revokeObjectURL(localPreview);
          setPreview(currentUrl || null);
          return;
        }
        finalFile = processed;
        URL.revokeObjectURL(localPreview);
        localPreview = URL.createObjectURL(finalFile);
        setPreview(localPreview);
      }

      const formData = new FormData();
      formData.append('file', finalFile);

      const params = new URLSearchParams();
      if (userId) params.set('user_id', String(userId));
      if (gameId) params.set('game_id', String(gameId));
      const qs = params.toString();
      const res = await api.post(`/upload/${folder}${qs ? '?' + qs : ''}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      URL.revokeObjectURL(localPreview);
      setPreview(res.data.url);
      onUpload(res.data.url);
      // Прежний файл не удаляем: форма ещё не сохранена (отмена оставила бы ссылку на удалённый
      // файл), а прежней картинкой мог быть общий файл — товар магазина или обложка игры.
    } catch (err: any) {
      URL.revokeObjectURL(localPreview);
      setPreview(currentUrl || null);
      setError(err.response?.data?.error || 'Не удалось загрузить');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setPreview(null);
    if (onRemove) onRemove();
  };

  return (
    <div className={className}>
      {label && (
        <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-violet/60 mb-2">{label}</span>
      )}

      <div
        className="relative group rounded-xl border-2 border-dashed border-violet/15 hover:border-accent/40 transition-all overflow-hidden cursor-pointer"
        style={{ aspectRatio: '16/10' }}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        {preview ? (
          <UploadPreview preview={preview} onRemove={onRemove ? handleRemove : undefined} />
        ) : (
          <Dropzone uploading={uploading} />
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 size={32} className="text-accent animate-spin" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />

      {error && <p className="text-red-400 text-[10px] mt-1.5">{error}</p>}
    </div>
  );
};

export default ImageUpload;
