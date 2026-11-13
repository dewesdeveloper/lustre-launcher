import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import api from '../../api';
import { PROFILE_IMAGE_ACCEPT, type EditProfileForm, type ImageKind } from './constants';

/**
 * Аватар и баннер профиля: выбор файла → кадрирование → загрузка в users/<id>/…
 *
 * Файлы в хранилище меняются только по факту сохранения профиля:
 *  - загруженные, но не сохранённые («черновые») — удаляются при сбросе, уходе со страницы
 *    и при повторной загрузке того же поля;
 *  - прежний свой файл удаляется только после успешного сохранения и только из своей папки
 *    (купленные в магазине аватары/фоны — общие файлы, их не трогаем).
 * Раньше старый файл удалялся сразу после загрузки нового — «Отмена» оставляла профиль
 * со ссылкой на удалённую картинку, а надетый товар магазина стирался у всех.
 */
const FIELD: Record<ImageKind, 'avatar_url' | 'banner_url'> = { avatar: 'avatar_url', banner: 'banner_url' };
const FOLDER: Record<ImageKind, string> = { avatar: 'avatars', banner: 'backgrounds' };
const ALLOWED = new Set(PROFILE_IMAGE_ACCEPT.split(','));

const keyFromUrl = (url: string): string | null => url.match(/\/lustrehub\/(.+)$/)?.[1] ?? null;

type Cropping = { kind: ImageKind; src: string; revoke: boolean };

export function useProfileImages(
  userId: number,
  saved: { avatar_url: string; banner_url: string },
  current: { avatar_url: string; banner_url: string },
  setFormData: Dispatch<SetStateAction<EditProfileForm>>,
  uploadLimitMB: number,
) {
  const [cropping, setCropping] = useState<Cropping | null>(null);
  const [uploading, setUploading] = useState<Record<ImageKind, boolean>>({ avatar: false, banner: false });
  const [errors, setErrors] = useState<Record<ImageKind, string>>({ avatar: '', banner: '' });

  // черновые загрузки: url → key (только наши свежие файлы)
  const drafts = useRef(new Map<string, string>());
  // исходник последней загрузки поля — чтобы «Изменить кадр» резал оригинал, а не уже обрезанное
  const originals = useRef<Record<ImageKind, { file: File; url: string } | null>>({ avatar: null, banner: null });
  const currentRef = useRef(current);
  currentRef.current = current;
  const ownPrefix = `users/${userId}/`;

  const deleteKey = (key: string) => api.delete(`/upload/?key=${encodeURIComponent(key)}`).catch(() => {});

  const setError = (kind: ImageKind, msg: string) => setErrors((e) => ({ ...e, [kind]: msg }));

  const uploadFile = useCallback(async (kind: ImageKind, file: File) => {
    setUploading((u) => ({ ...u, [kind]: true }));
    setError(kind, '');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/upload/${FOLDER[kind]}?user_id=${userId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url: string = res.data.url;
      drafts.current.set(url, res.data.key);
      const previousDraft = currentRef.current[FIELD[kind]];
      setFormData((prev) => ({ ...prev, [FIELD[kind]]: url }));
      // прошлая черновая загрузка этого поля больше не нужна
      if (previousDraft && drafts.current.has(previousDraft)) {
        deleteKey(drafts.current.get(previousDraft)!);
        drafts.current.delete(previousDraft);
      }
      return url;
    } catch (err: any) {
      setError(kind, err?.response?.data?.error || 'Не удалось загрузить файл');
      return null;
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  }, [userId, setFormData]);

  /** Выбран файл (диалог или перетаскивание) */
  const handleFile = useCallback((kind: ImageKind, file: File) => {
    if (!ALLOWED.has(file.type)) {
      setError(kind, 'Поддерживаются PNG, JPG, WEBP и GIF');
      return;
    }
    if (file.size > uploadLimitMB * 1024 * 1024) {
      setError(kind, `Файл больше ${uploadLimitMB} МБ`);
      return;
    }
    setError(kind, '');
    if (file.type === 'image/gif') {
      // canvas сохранил бы только первый кадр — GIF загружаем как есть, анимация сохраняется
      originals.current[kind] = null;
      void uploadFile(kind, file);
      return;
    }
    originals.current[kind] = { file, url: '' };
    setCropping({ kind, src: URL.createObjectURL(file), revoke: true });
  }, [uploadFile, uploadLimitMB]);

  /** «Изменить кадр» у текущего изображения */
  const recrop = useCallback((kind: ImageKind, currentUrl: string) => {
    if (!currentUrl) return;
    const orig = originals.current[kind];
    if (orig && orig.url === currentUrl) {
      setCropping({ kind, src: URL.createObjectURL(orig.file), revoke: true });
    } else {
      // сохранённый ранее файл: исходника нет — режем то, что лежит в хранилище
      originals.current[kind] = null;
      setCropping({ kind, src: currentUrl, revoke: false });
    }
  }, []);

  const closeCropper = useCallback(() => {
    setCropping((c) => {
      if (c?.revoke) URL.revokeObjectURL(c.src);
      return null;
    });
  }, []);

  const confirmCrop = useCallback(async (blob: Blob) => {
    const c = cropping;
    if (!c) return;
    closeCropper();
    const ext = blob.type === 'image/png' ? 'png' : 'webp';
    const url = await uploadFile(c.kind, new File([blob], `${c.kind}.${ext}`, { type: blob.type }));
    const orig = originals.current[c.kind];
    if (url && orig) orig.url = url;
  }, [cropping, closeCropper, uploadFile]);

  /** Удаляет черновые загрузки, кроме оставленных в профиле (keep) */
  const discardDrafts = useCallback((keep: string[] = []) => {
    for (const [url, key] of drafts.current) {
      if (!keep.includes(url)) deleteKey(key);
    }
    drafts.current.clear();
  }, []);

  /** После успешного сохранения: убрать заменённые свои файлы и лишние черновики */
  const commit = useCallback((next: { avatar_url: string; banner_url: string }) => {
    const keep = [next.avatar_url, next.banner_url];
    discardDrafts(keep);
    for (const kind of ['avatar', 'banner'] as const) {
      const before = saved[FIELD[kind]];
      const key = before && before !== next[FIELD[kind]] ? keyFromUrl(before) : null;
      if (key && key.startsWith(ownPrefix) && !keep.includes(before)) deleteKey(key);
    }
  }, [discardDrafts, saved, ownPrefix]);

  // ушли со страницы без сохранения — черновики не нужны
  const discardRef = useRef(discardDrafts);
  discardRef.current = discardDrafts;
  useEffect(() => () => discardRef.current(), []);

  return { cropping, uploading, errors, handleFile, recrop, closeCropper, confirmCrop, discardDrafts, commit };
}
