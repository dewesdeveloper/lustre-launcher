import { useEffect, useState } from 'react';
import { Monitor, X, AppWindow, Loader2, Crown } from 'lucide-react';
import { QUALITY_PRESETS, canUseHd, getQuality, setQuality, type MediaQuality } from '../api/mediaQuality';

export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string;
  isScreen: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (source: DesktopSource) => void;
}

/** Пикер источника демонстрации экрана (экраны + окна), как в Discord. */
export default function ScreenSourcePicker({ open, onClose, onPick }: Props) {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  // качество стрима выбирается до старта: SD — всем, HD (1080p/60) — с Lustre Pro
  const [quality, setQualityState] = useState<MediaQuality>(getQuality);
  const [hdHint, setHdHint] = useState(false);
  const hdAllowed = canUseHd();
  const pickQuality = (q: MediaQuality) => {
    if (q === 'hd' && !hdAllowed) { setHdHint(true); return; }
    setHdHint(false);
    setQualityState(setQuality(q));
  };

  useEffect(() => {
    if (!open) return;
    setQualityState(getQuality());
    setHdHint(false);
    const electron = (window as any).electron;
    if (!electron?.getDesktopSources) {
      setLoading(false);
      return;
    }
    setLoading(true);
    electron.getDesktopSources()
      .then((list: DesktopSource[]) => setSources(list || []))
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const filtered = sources.filter((s) => (tab === 'screen' ? s.isScreen : !s.isScreen));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[680px] max-w-[92vw] max-h-[80vh] rounded-2xl bg-[#101322] border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
          <Monitor size={16} className="text-accent" />
          <span className="text-sm font-black uppercase tracking-widest text-pearl/70">Демонстрация экрана</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-pearl/70 hover:text-pearl hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          <button
            onClick={() => setTab('screen')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${tab === 'screen' ? 'bg-accent/15 text-accent' : 'text-pearl/70 hover:text-pearl'}`}
          >
            <Monitor size={13} /> Экраны
          </button>
          <button
            onClick={() => setTab('window')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${tab === 'window' ? 'bg-accent/15 text-accent' : 'text-pearl/70 hover:text-pearl'}`}
          >
            <AppWindow size={13} /> Окна
          </button>
          <div className="ml-auto flex items-center gap-1" title="Качество стрима">
            {(['sd', 'hd'] as MediaQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => pickQuality(q)}
                title={QUALITY_PRESETS[q].label}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${quality === q ? 'bg-accent/15 text-accent' : 'text-pearl/70 hover:text-pearl'}`}
              >
                {q === 'hd' && !hdAllowed && <Crown size={12} className="text-amber-300" />}
                {QUALITY_PRESETS[q].short}
                <span className="font-normal normal-case tracking-normal text-pearl/50 max-sm:hidden">{q === 'hd' ? '1080p·60' : '720p·30'}</span>
              </button>
            ))}
          </div>
        </div>
        {hdHint && (
          <p className="px-5 pt-2 text-[12px] text-amber-300">Стрим в HD (1080p, 60 к/с) доступен с подпиской Lustre Pro.</p>
        )}

        <div className="p-5 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-pearl/60"><Loader2 className="animate-spin" size={22} /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-pearl/60 text-xs py-16">Источники не найдены</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onPick(s)}
                  className="group text-left rounded-xl overflow-hidden border border-white/10 hover:border-accent/50 bg-black/30 transition-colors"
                >
                  <div className="relative aspect-video bg-black/50">
                    {s.thumbnail ? (
                      <img src={s.thumbnail} alt="" className="w-full h-full object-cover" draggable={false} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-pearl/55"><Monitor size={28} /></div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2">
                    {s.appIcon ? (
                      <img src={s.appIcon} alt="" className="w-4 h-4 shrink-0" />
                    ) : s.isScreen ? (
                      <Monitor size={13} className="text-violet shrink-0" />
                    ) : (
                      <AppWindow size={13} className="text-violet shrink-0" />
                    )}
                    <span className="text-[11px] text-pearl/70 truncate">{s.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
