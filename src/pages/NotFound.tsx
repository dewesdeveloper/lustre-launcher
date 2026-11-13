import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconRefresh, IconCoffee, IconHeart, IconAlertTriangle, IconHome } from '@tabler/icons-react';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState('Поиск мотивации…');
  const stall = useRef(0);
  const value = useRef(0);

  const searching = ['Поиск мотивации…', 'Сканирую сектор 7…', 'Проверяю кофейню…', 'Опрашиваю синдикат…'];
  const almost = ['Почти нашёл…', 'Ещё чуть-чуть…', 'Уже близко…'];

  useEffect(() => {
    let timer: number;
    const tick = () => {
      if (stall.current > 0) {
        stall.current--;
      } else if (Math.random() < 0.22) {
        stall.current = 2 + Math.floor(Math.random() * 5);
      } else {
        value.current += 0.4 + Math.random() * 2.6;
      }

      if (value.current >= 100) {
        value.current = 0;
        setStatus('Мотивация не найдена — начинаю заново…');
      } else if (value.current > 78 && Math.random() < 0.15) {
        setStatus(almost[Math.floor(Math.random() * almost.length)]);
      } else if (Math.random() < 0.06) {
        setStatus(searching[Math.floor(Math.random() * searching.length)]);
      }

      setPct(Math.min(100, value.current));
      timer = window.setTimeout(tick, 170 + Math.random() * 430);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  const restart = () => {
    value.current = 0;
    stall.current = 0;
    setStatus('Перезапуск поиска мотивации…');
  };

  return (
    <div className="min-h-screen w-full bg-[#060309] flex flex-col items-center justify-center text-center p-6 relative overflow-hidden tl-term">

      <div className="tl-grid-bg" />
      <div className="tl-scanlines" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-[820px]">
        <div className="tl-ticker justify-center">
          <span className="live">// ERROR 404</span>
          <span>page not found</span>
          <span>· exit protocol</span>
        </div>

        <div className="center mt-6">
          <div className="tl-file">
            <div className="face">
              <span className="eye" />
              <span className="eye" />
            </div>
            <span className="mouth" />
          </div>

          <div className="tl-err-word">ОШИБКА <span className="sq">×</span></div>
          <div className="tl-big404" data-text="404">404</div>
          <div className="tl-sub404">МОТИВАЦИЯ<br /><span className="ne">НЕ НАЙДЕНА</span></div>

          <div className="grid gap-4 md:grid-cols-[1fr_260px] max-w-[780px] mx-auto mt-8 text-left">
            <div className="tl-panel p-5">
              <h3 className="tl-head text-[11px] font-bold tracking-[0.16em] text-white uppercase flex items-center justify-between">
                Что можно сделать? <span className="text-[var(--muted-2)] border border-[var(--line)] px-1.5 text-[11px]">×</span>
              </h3>
              <div className="tl-todo-item flex items-center gap-4 mt-5 text-[#d9c4d3] text-sm">
                <span className="ic"><IconRefresh size={24} /></span>
                <div><b className="block text-white font-bold">Попробовать ещё раз</b><span className="text-[var(--muted)] text-xs">(F5)</span></div>
              </div>
              <div className="tl-todo-item flex items-center gap-4 mt-5 text-[#d9c4d3] text-sm">
                <span className="ic"><IconCoffee size={24} /></span>
                <div><b className="block text-white font-bold">Сделать перерыв</b><span className="text-[var(--muted)] text-xs">(рекомендуется)</span></div>
              </div>
              <div className="tl-todo-item flex items-center gap-4 mt-5 text-[#d9c4d3] text-sm">
                <span className="ic"><IconHeart size={24} /></span>
                <div><b className="block text-white font-bold">Напомнить себе, зачем ты начал</b></div>
              </div>
            </div>

            <div className="tl-panel p-5 flex flex-col items-center gap-3 text-center relative">
              <span className="self-end text-[var(--muted-2)] border border-[var(--line)] px-1.5 text-[11px]">×</span>
              <IconAlertTriangle size={52} className="text-accent drop-shadow-[0_0_12px_rgb(var(--accent-rgb)/0.85)]" />
              <p className="text-[#d9c4d3] text-[13px] leading-relaxed">
                СЕРЬЁЗНО?<br /><b className="text-white">ТЫ ЖЕ СИЛЬНЕЕ, ЧЕМ ДУМАЕШЬ</b>
              </p>
              <button onClick={restart} className="tl-btn solid block">OK</button>
            </div>
          </div>

          <div className="max-w-[780px] mx-auto mt-6">
            <div className="flex justify-between text-[var(--muted)] text-[14px] tracking-[0.18em] uppercase mb-2">
              <span>{status}</span>
              <span className="text-accent">{Math.floor(pct)}%</span>
            </div>
            <div className="tl-sbar"><div className="f" style={{ width: `${pct}%` }} /></div>
          </div>

          <div className="flex items-center justify-center gap-6 flex-wrap mt-10 text-[13px] tracking-[0.14em] text-[var(--muted)] uppercase">
            <div>SYSTEM STATUS: <span className="tl-pink">UNSTABLE</span><br />BUT YOU GOT THIS <IconHeart size={12} className="inline" /></div>
            <div>RECONNECT<br />WITH YOUR WHY</div>
          </div>

          <button
            onClick={() => navigate('/store')}
            className="tl-btn solid mx-auto mt-8"
          >
            <IconHome size={16} /> Вернуться в магазин
          </button>
        </div>

        <div className="tl-footer">
          <div className="status">ERROR TRACE: <b>MODULE_NOT_FOUND</b><br />STACK: motivation.exe</div>
          <div className="left">
            <span className="keep">KEEP GOING.EXE</span>
            <div className="tl-barcode">
              {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
