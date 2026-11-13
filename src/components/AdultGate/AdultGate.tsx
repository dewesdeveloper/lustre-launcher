import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

/* ============================================================
   AdultGate — подтверждение 18+ при входе на страницы со взрослым
   контентом (игры is_adult, сообщества с adult-игрой). В каталоге окно само не
   всплывает: игры 18+ скрыты, пока пользователь не подтвердит возраст (useAdultConsent).

   Флаги хранения:
   - чекбокс «Больше не показывать» → localStorage (навсегда, для этого браузера);
   - без чекбокса → sessionStorage (один раз за сессию).
   ============================================================ */

const ALWAYS_KEY = 'lustre_adult_always';
const SESSION_KEY = 'lustre_adult_session';

// Вопрос при первом входе задаём один раз: ответ можно изменить в каталоге и настройках
const OFFERED_KEY = 'lustre_adult_offered';

export const isConfirmed = () =>
  localStorage.getItem(ALWAYS_KEY) === '1' || sessionStorage.getItem(SESSION_KEY) === '1';

interface AdultGateCtx {
  /** Показать модалку, если подтверждение ещё не давали.
   *  stay — «Отмена» просто закрывает окно, а не уводит со страницы. */
  request: (opts?: { stay?: boolean }) => void;
  /** Первый вход: один раз предложить показывать игры 18+ */
  offer: () => void;
  /** Возраст уже подтверждён */
  confirmed: boolean;
}

const Ctx = createContext<AdultGateCtx>({ request: () => {}, offer: () => {}, confirmed: false });

/**
 * Вешать на страницу: useAdultGate(естьЛиВзрослыйКонтент).
 * Пока подтверждение не выдано (localStorage/sessionStorage), покажет модалку.
 */
export function useAdultGate(active: boolean) {
  const { request } = useContext(Ctx);
  useEffect(() => {
    if (active && !isConfirmed()) request();
  }, [active, request]);
}

/** Для страниц, которые сами скрывают взрослый контент до подтверждения (каталог) */
export function useAdultConsent() {
  return useContext(Ctx);
}

export function AdultGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [offering, setOffering] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const [confirmed, setConfirmed] = useState(isConfirmed);
  const stayOnDecline = useRef(false);
  const navigate = useNavigate();

  const request = useCallback((opts?: { stay?: boolean }) => {
    if (isConfirmed()) { setConfirmed(true); return; }
    stayOnDecline.current = !!opts?.stay;
    setOpen(true);
  }, []);

  const offer = useCallback(() => {
    try {
      if (isConfirmed() || localStorage.getItem(OFFERED_KEY) === '1') return;
    } catch { return; }
    setOffering(true);
  }, []);

  const answerOffer = (show: boolean) => {
    try {
      localStorage.setItem(OFFERED_KEY, '1');
      if (show) localStorage.setItem(ALWAYS_KEY, '1');
    } catch { /* ignore */ }
    if (show) setConfirmed(true);
    setOffering(false);
  };

  const confirm = () => {
    if (dontShow) localStorage.setItem(ALWAYS_KEY, '1');
    else sessionStorage.setItem(SESSION_KEY, '1');
    setConfirmed(true);
    setOpen(false);
  };

  const decline = () => {
    setOpen(false);
    if (stayOnDecline.current) return;
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  return (
    <Ctx.Provider value={{ request, offer, confirmed }}>
      {children}
      {offering && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 px-4" role="dialog" aria-modal="true" aria-label="Показывать игры 18+">
          <div className="w-full max-w-[440px] bg-[#0f0a17] border border-[var(--pink)] shadow-[0_0_40px_rgba(255,45,143,.35)]">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--line)] bg-[rgba(255,45,143,.1)]">
              <span className="tl-head text-[11px] font-black tracking-[0.2em] text-[var(--pink)]">18+</span>
              <span className="tl-head text-[10px] font-bold uppercase tracking-[0.18em] text-white">Игры для взрослых</span>
            </div>
            <div className="px-5 py-5 flex flex-col gap-4">
              <p className="tl-term text-[16px] leading-relaxed text-[var(--muted)]">
                В каталоге есть игры с пометкой <b className="text-[var(--pink)]">18+</b>. Сейчас они скрыты.
                Показывать их? Для этого подтвердите, что вам есть 18 лет. Передумать можно в любой момент в каталоге.
              </p>
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => answerOffer(true)}
                  className="flex-1 tl-head font-black uppercase tracking-[0.14em] text-[#0b0210] bg-[var(--pink)] hover:brightness-110 px-4 py-3 transition-all cursor-pointer"
                >
                  Мне есть 18, показывать
                </button>
                <button
                  type="button"
                  onClick={() => answerOffer(false)}
                  autoFocus
                  className="flex-1 tl-head font-bold uppercase tracking-[0.14em] text-[var(--muted)] border border-[var(--line-2)] hover:text-white hover:bg-[rgba(255,45,143,.14)] px-4 py-3 transition-colors cursor-pointer"
                >
                  Не показывать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {open && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Подтверждение возраста"
        >
          <div className="w-full max-w-[440px] bg-[#0f0a17] border border-[var(--pink)] shadow-[0_0_40px_rgba(255,45,143,.35)]">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--line)] bg-[rgba(255,45,143,.1)]">
              <span className="tl-head text-[11px] font-black tracking-[0.2em] text-[var(--pink)]">18+</span>
              <span className="tl-head text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                Взрослое содержимое
              </span>
            </div>

            <div className="px-5 py-5 flex flex-col gap-4">
              <p className="tl-term text-[16px] leading-relaxed text-[var(--muted)]">
                Эта страница содержит игру или сообщество, помеченные как <b className="text-[var(--pink)]">18+</b>.
                Подтвердите, что вам есть 18 лет и вы допускаете просмотр взрослого контента.
              </p>

              <label className="flex items-start gap-3 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => setDontShow(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--pink)] cursor-pointer"
                />
                <span className="tl-head text-[10px] leading-[1.6] uppercase tracking-[0.1em] text-pearl/70 group-hover:text-white transition-colors">
                  Больше не показывать
                </span>
              </label>

              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={confirm}
                  autoFocus
                  className="flex-1 tl-head font-black uppercase tracking-[0.14em] text-[#0b0210] bg-[var(--pink)] hover:brightness-110 px-4 py-3 transition-all cursor-pointer"
                >
                  Мне есть 18
                </button>
                <button
                  type="button"
                  onClick={decline}
                  className="flex-1 tl-head font-bold uppercase tracking-[0.14em] text-[var(--muted)] border border-[var(--line-2)] hover:text-white hover:bg-[rgba(255,45,143,.14)] px-4 py-3 transition-colors cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export default AdultGateProvider;
