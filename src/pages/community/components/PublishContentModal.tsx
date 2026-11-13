import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconMessage2, IconPhoto, IconTools, IconX } from '@tabler/icons-react';
import { addCommunityImage, addWorkshopItem, createCommunityPost, type Community } from '../../../api/community';
import ImageUpload from '../../../components/ImageUpload';
import Select from '../../../components/ui/Select';
import CharCounter from '../../../components/CharCounter';

type Kind = 'image' | 'post' | 'workshop';

const KINDS: { id: Kind; label: string; icon: ReactNode }[] = [
  { id: 'image', label: 'Изображение', icon: <IconPhoto size={15} /> },
  { id: 'post', label: 'Обсуждение', icon: <IconMessage2 size={15} /> },
  { id: 'workshop', label: 'Мастерская', icon: <IconTools size={15} /> },
];

/** Ограничения длины — как на сервере */
const LIMIT = { postTitle: 200, postText: 10000, modTitle: 120, modText: 2000 };

const SELECT_BTN = 'rounded-none! bg-[#08050f]! border-[color:var(--line)]! px-3.5 py-2.5 text-[10px]';
const SELECT_PANEL = 'rounded-none! shadow-none! backdrop-blur-none! bg-[#0f0a17]! border-[color:var(--line)]!';

type Fields = { title: string; text: string; link: string; cover: string };
const EMPTY: Fields = { title: '', text: '', link: '', cover: '' };

/** Проверка полей перед публикацией обсуждения или мода; текст ошибки или null */
function validate(kind: Kind, f: Fields): string | null {
  if (kind === 'post' && !f.title.trim()) return 'Введите заголовок обсуждения';
  if (kind === 'workshop') {
    if (!f.title.trim()) return 'Введите название';
    if (!/^https?:\/\/\S+$/i.test(f.link.trim())) return 'Нужна ссылка на файл вида https://…';
  }
  return null;
}

type PublishContentModalProps = {
  communities: Community[];
  initialTab?: Kind;
  onClose: () => void;
};

/**
 * Публикация в одно из сообществ: изображение в галерею (отправляется сразу после
 * загрузки), обсуждение или мод в мастерскую. После публикации — переход в сообщество.
 */
export default function PublishContentModal({ communities, initialTab = 'image', onClose }: PublishContentModalProps) {
  const navigate = useNavigate();
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>(initialTab);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const target = communities.find((c) => c.ID === communityId);
  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));

  /** Общий путь публикации: проверка, запрос, переход в сообщество или ошибка */
  const publish = async (send: (id: number) => Promise<unknown>, failure: string) => {
    if (!communityId) {
      setError('Сначала выберите сообщество');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await send(communityId);
      onClose();
      navigate(`/community/${communityId}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || failure);
      setBusy(false);
    }
  };

  const submitText = () => {
    const problem = validate(kind, fields);
    if (problem) {
      setError(problem);
      return;
    }
    const title = fields.title.trim();
    const text = fields.text.trim();
    if (kind === 'post') void publish((id) => createCommunityPost(id, { title, content: text }), 'Не удалось опубликовать обсуждение');
    else void publish((id) => addWorkshopItem(id, { title, description: text, url: fields.link.trim(), image_url: fields.cover }), 'Не удалось опубликовать');
  };

  const pickKind = (k: Kind) => {
    setKind(k);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={onClose}>
      <div className="tl-panel custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className="flex items-start justify-between px-8 pb-2 pt-8">
          <div>
            <h2 className="text-[20px] text-white">Опубликовать <span className="text-accent">контент</span></h2>
            <p className="tl-head tl-muted mt-1.5 text-[10px] font-bold uppercase tracking-[.2em]">Изображение, обсуждение или мод в вашем сообществе</p>
          </div>
          <button type="button" onClick={onClose} className="tl-btn ghost" aria-label="Закрыть"><IconX size={16} /></button>
        </header>

        <div className="space-y-5 p-8 pt-4">
          {communities.length === 0 ? (
            <div className="tl-panel p-8 text-center">
              <p className="tl-term tl-muted mb-4 text-[16px]">Нет сообществ для публикации</p>
              <button type="button" className="tl-btn solid" onClick={() => { onClose(); navigate('/community/create'); }}>Создать сообщество</button>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-2 block tl-head text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">Сообщество *</span>
                <Select
                  value={communityId ?? ''}
                  onChange={(v) => { setCommunityId(v === '' ? null : Number(v)); setError(''); }}
                  className="w-full"
                  buttonClassName={SELECT_BTN}
                  panelClassName={SELECT_PANEL}
                  options={[
                    { value: '', label: 'Выберите сообщество...' },
                    ...communities.map((c) => ({ value: c.ID, label: `${c.name} — ${c.game?.title}` })),
                  ]}
                />
              </label>

              {target && (
                <>
                  <div className="tl-tabs">
                    {KINDS.map((k) => (
                      <button key={k.id} type="button" onClick={() => pickKind(k.id)} className={`tl-tab ${kind === k.id ? 'active' : ''}`}>
                        {k.icon} {k.label}
                      </button>
                    ))}
                  </div>

                  {kind === 'image' && (
                    <div>
                      <ImageUpload
                        folder="communities"
                        label="Загрузите изображение"
                        onUpload={(url) => void publish((id) => addCommunityImage(id, url), 'Не удалось опубликовать изображение')}
                      />
                      <p className="tl-head tl-muted mt-2 text-[10px] font-bold uppercase">После загрузки изображение сразу появится в галерее сообщества</p>
                    </div>
                  )}

                  {kind === 'post' && (
                    <div className="space-y-3">
                      <input value={fields.title} maxLength={LIMIT.postTitle} onChange={(e) => set({ title: e.target.value })} placeholder="Заголовок обсуждения *" className="tl-field" />
                      <CharCounter value={fields.title} max={LIMIT.postTitle} />
                      <textarea rows={4} value={fields.text} maxLength={LIMIT.postText} onChange={(e) => set({ text: e.target.value })} placeholder="Текст обсуждения..." className="tl-field resize-none" />
                      <CharCounter value={fields.text} max={LIMIT.postText} />
                    </div>
                  )}

                  {kind === 'workshop' && (
                    <div className="space-y-3">
                      <input value={fields.title} maxLength={LIMIT.modTitle} onChange={(e) => set({ title: e.target.value })} placeholder="Название мода *" className="tl-field" />
                      <CharCounter value={fields.title} max={LIMIT.modTitle} />
                      <input type="url" value={fields.link} onChange={(e) => set({ link: e.target.value })} placeholder="Ссылка на файл: https://… *" className="tl-field" />
                      <textarea rows={3} value={fields.text} maxLength={LIMIT.modText} onChange={(e) => set({ text: e.target.value })} placeholder="Что делает мод, как установить..." className="tl-field resize-none" />
                      <CharCounter value={fields.text} max={LIMIT.modText} />
                      <ImageUpload folder="communities" label="Обложка (необязательно)" onUpload={(cover) => set({ cover })} />
                    </div>
                  )}

                  {error && <div className="tl-warnrow"><span className="t">{error}</span></div>}

                  {kind !== 'image' && (
                    <button type="button" onClick={submitText} disabled={busy} className="tl-btn solid block">
                      {busy ? 'Публикуем...' : kind === 'post' ? 'Опубликовать обсуждение' : 'Опубликовать в мастерской'}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
