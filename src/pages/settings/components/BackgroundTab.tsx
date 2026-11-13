import { useCallback, useEffect, useState } from 'react';
import {
  IconPhoto, IconVideo, IconLock, IconCrown, IconCheck, IconRefresh,
} from '@tabler/icons-react';
import { useDialog } from '../../../components/Dialogs';
import ImageUpload from '../../../components/ImageUpload';
import { Loading, LoadingInline } from '../../../components/Loading';
import {
  getLauncherBackground, setLauncherBackground,
  type LauncherBackgroundState,
} from '../../../api/launcherBackground';
import { broadcastLauncherBackground, emitLauncherBackgroundChanged } from '../../../components/launcherBackground';
import { useAuth } from '../../../context/AuthContext';

const VIDEO_EXT = /\.(mp4|webm|mov|ogv)(\?.*)?$/i;
const BLUR_PRESETS = [0, 6, 12, 24];

export default function BackgroundTab() {
  const dialog = useDialog();
  const { updateProfile, user } = useAuth();
  const [state, setState] = useState<LauncherBackgroundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ url: string; isVideo: boolean } | null>(null);

  const load = useCallback(() => {
    getLauncherBackground()
      // owned_items может прийти null (старый бэкенд отдаёт nil-слайс как null) —
      // нормализуем, иначе .length роняет рендер в чёрный экран
      .then((s) => setState({ ...s, owned_items: s?.owned_items || [] }))
      .catch(() => setState(null));
  }, []);

  useEffect(load, [load]);

  if (!state) return <Loading label="Фон лаунчера" />;

  const applyProfile = (profile: any) => {
    if (!profile) return;
    updateProfile(profile);
    broadcastLauncherBackground({
      url: profile.launcher_background_url,
      isVideo: profile.launcher_background_is_video,
      scale: profile.launcher_background_scale,
      blur: profile.launcher_background_blur,
      opacity: profile.launcher_background_opacity,
      offsetX: profile.launcher_background_offset_x,
      offsetY: profile.launcher_background_offset_y,
    });
    emitLauncherBackgroundChanged();
  };

  const run = async (payload: any) => {
    setBusy(true);
    try {
      const profile = await setLauncherBackground(payload);
      applyProfile(profile);
      load();
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'pro_required') {
        dialog.alert({
          title: 'Нужен Lustre Pro',
          message: 'Свой фон лаунчера доступен только с подпиской. Фоны из магазина доступны всем.',
          tone: 'info',
        });
      } else {
        dialog.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось применить фон', danger: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const applyItem = (itemId: number) => run({ item_id: itemId });
  const useCustom = () => {
    if (!upload) return;
    run({ url: upload.url, is_video: upload.isVideo });
    setUpload(null);
  };
  const doReset = () => run({});

  const patch = (key: string, value: number) => run({ [key]: value });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="tl-head text-[12px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>ФОН ЛАУНЧЕРА</h3>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-1.5 leading-relaxed">
          Заменяет фоновую сетку лаунчера. Изображение или видео. Свой фон — только с Lustre Pro,
          фон из магазина доступен всем.
        </p>
      </div>

      <div className="tl-panel relative overflow-hidden">
        <div className="relative aspect-video">
          {state.url ? (
            state.is_video ? (
              <video src={state.url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: `scale(${state.scale})`, filter: state.blur ? `blur(${state.blur}px)` : undefined, opacity: state.opacity }} />
            ) : (
              <img src={state.url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: `scale(${state.scale})`, filter: state.blur ? `blur(${state.blur}px)` : undefined, opacity: state.opacity }} />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, #8338EC 1px, transparent 1px), linear-gradient(to bottom, #8338EC 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }} />
              <p className="relative tl-head text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">Стандартная сетка</p>
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(circle at center, transparent 0%, #050407 100%)' }} />

          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <LoadingInline label="Сохраняем" className="text-white" />
            </div>
          )}

          {state.url && (
            <button
              onClick={doReset}
              disabled={busy}
              className="tl-btn ghost absolute top-3 right-3"
            >
              <IconRefresh size={12} /> Сбросить на сетку
            </button>
          )}
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <label className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted flex items-center gap-2 mb-3">
          <IconPhoto size={13} /> Фоны из магазина
        </label>
        {state.owned_items.length === 0 ? (
          <p className="tl-term text-[15px] tl-muted">
            Купленных фонов пока нет. Загляни в магазин → раздел «Фоны лаунчера».
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {state.owned_items.map((it) => {
              const active = state.item_id === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => !active && applyItem(it.id)}
                  disabled={busy || active}
                  className={`relative overflow-hidden border text-left transition-all disabled:cursor-default ${
                    active ? 'border-accent bg-[rgb(var(--accent-rgb)/.06)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'
                  }`}
                >
                  <div className="relative aspect-video">
                    {it.is_video ? (
                      <video src={it.payload} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <img src={it.image_url || it.payload} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {it.is_video && (
                      <span className="absolute top-1.5 left-1.5 tl-chip flex items-center gap-1 bg-[rgba(0,0,0,.7)]">
                        <IconVideo size={9} /> Видео
                      </span>
                    )}
                    {active && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-accent flex items-center justify-center text-[#0b0210]">
                        <IconCheck size={12} />
                      </span>
                    )}
                  </div>
                  <p className={`px-3 py-2 tl-head text-[10px] font-bold uppercase tracking-[0.1em] truncate ${active ? 'text-accent' : 'tl-muted'}`}>
                    {it.name}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="tl-panel p-[22px]">
        <label className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted flex items-center gap-2 mb-3">
          {state.can_custom ? <IconCrown size={13} className="text-amber-400" /> : <IconLock size={13} />}
          Свой фон
        </label>

        {!state.can_custom ? (
          <>
            <p className="tl-term text-[15px] tl-muted leading-relaxed">
              Загрузить свой фон лаунчера (изображение или видео) могут только подписчики Lustre Pro.
              Без подписки доступны фоны из магазина.
            </p>
            <button
              onClick={() => dialog.alert({ title: 'Lustre Pro', message: 'Свой фон лаунчера доступен с подпиской Pro', tone: 'info' })}
              className="tl-btn ghost mt-4 border-amber-400/40 text-amber-300 hover:border-amber-400"
            >
              Подключить Pro
            </button>
          </>
        ) : (
          <>
            {upload ? (
              <div className="flex items-center gap-3">
                <div className="relative w-40 aspect-video overflow-hidden border border-[var(--line)] bg-black/40">
                  {upload.isVideo ? (
                    <video src={upload.url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <img src={upload.url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="tl-term text-[15px] tl-muted truncate">Файл загружен</p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={useCustom} disabled={busy} className="tl-btn solid">
                      Применить
                    </button>
                    <button onClick={() => setUpload(null)} className="tl-btn ghost">
                      Отмена
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <ImageUpload
                folder="backgrounds"
                userId={user?.id}
                currentUrl={state.item_id === 0 ? state.url : undefined}
                label="Загрузить свой фон"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                maxSizeMB={200}
                onUpload={(url) => setUpload({ url, isVideo: VIDEO_EXT.test(url) })}
                className="max-w-md"
              />
            )}
          </>
        )}
      </div>

      {state.url && (
        <div className="tl-panel p-[22px]">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>РАЗМЫТИЕ ФОНА</h3>
            {state.blur !== 0 && (
              <button
                onClick={() => patch('blur', 0)}
                disabled={busy}
                className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] tl-muted hover:text-white transition-colors disabled:opacity-40"
              >
                Сбросить
              </button>
            )}
          </div>
          <p className="tl-term text-[15px] text-[var(--muted-2)] mb-4">
            Смягчает картинку фона — если под интерфейсом слишком яркое или детализированное изображение
            и текст читается хуже.
          </p>
          <Slider label="Размытие" value={state.blur} min={0} max={24} step={1}
            format={(v) => `${v} px`} onChange={(v) => patch('blur', v)} disabled={busy} />
          <div className="tl-tabs mt-4 flex-wrap">
            {BLUR_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => patch('blur', v)}
                disabled={busy}
                className={`tl-tab ${state.blur === v ? 'active' : ''} disabled:opacity-40`}
              >
                {v === 0 ? 'Без размытия' : `${v} px`}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.url && (
        <div className="tl-panel p-[22px] flex flex-col gap-4">
          <label className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted">Настройка изображения</label>

          <Slider label="Масштаб" value={state.scale} min={1} max={2.5} step={0.05}
            format={(v) => `${v.toFixed(2)}×`} onChange={(v) => patch('scale', v)} disabled={busy} />
          <Slider label="Прозрачность" value={state.opacity} min={0.1} max={1} step={0.05}
            format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch('opacity', v)} disabled={busy} />
          <Slider label="Смещение по X" value={state.offset_x} min={-200} max={200} step={5}
            format={(v) => `${v} px`} onChange={(v) => patch('offset_x', v)} disabled={busy} />
          <Slider label="Смещение по Y" value={state.offset_y} min={-200} max={200} step={5}
            format={(v) => `${v} px`} onChange={(v) => patch('offset_y', v)} disabled={busy} />

          <button
            onClick={() => run({
              item_id: state.item_id > 0 ? state.item_id : undefined,
              url: state.item_id > 0 ? undefined : state.url,
              is_video: state.is_video,
              scale: 1, blur: 0, opacity: 1, offset_x: 0, offset_y: 0,
            })}
            disabled={busy}
            className="tl-btn ghost self-start"
          >
            <IconRefresh size={12} /> Сбросить настройки
          </button>
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void; disabled?: boolean;
}) {
  // Пока тянем — меняем только локальное значение; на сервер уходит одно значение при
  // отпускании (раньше — запрос на каждый шаг, и ползунок блокировался посреди движения).
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { if (draft !== value) onChange(draft); };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] tl-muted">{label}</span>
        <span className="tl-term text-[16px] tl-pink tabular-nums">{format(draft)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full accent-[color:var(--color-accent)] cursor-pointer disabled:opacity-50"
      />
    </div>
  );
}
