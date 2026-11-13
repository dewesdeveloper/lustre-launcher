import { useEffect, useRef, useState } from 'react';
import { Gamepad2, Heart, Maximize2, Minimize2, RotateCcw, Trophy, Volume2, VolumeX } from 'lucide-react';
import SnakeGame from './SnakeGame';
import FruitGame from './FruitGame';
import { FIELD_H, FIELD_W, getBest, saveBest, type ArcadeGame, type GameStatus } from './arcade';
import { isMuted, playSound, setMuted } from './sound';

const GAMES: { id: ArcadeGame; title: string; hint: string }[] = [
  { id: 'snake', title: 'Змейка', hint: 'Стрелки или WASD. Не врезайтесь в стены и в себя' },
  { id: 'fruit', title: 'Фрукт-ниндзя', hint: 'Зажмите кнопку мыши и режьте фрукты. Бомбы не трогать, три упущенных фрукта — конец' },
];

/** Мини-игры, пока нет связи с сервером или включён автономный режим. Рекорды хранятся на этом компьютере. */
export default function OfflineArcade() {
  const [game, setGame] = useState<ArcadeGame>(() => {
    try { return (localStorage.getItem('lh_arcade_game') as ArcadeGame) === 'fruit' ? 'fruit' : 'snake'; } catch { return 'snake'; }
  });
  const [status, setStatus] = useState<GameStatus>('ready');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [best, setBest] = useState(() => getBest(game));
  const [newRecord, setNewRecord] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen().catch(() => {});
  };

  const choose = (id: ArcadeGame) => {
    if (id === game) return;
    setGame(id);
    setStatus('ready');
    setScore(0);
    setNewRecord(false);
    setBest(getBest(id));
    try { localStorage.setItem('lh_arcade_game', id); } catch { /* ignore */ }
  };

  const onStatus = (s: GameStatus) => {
    setStatus(s);
    if (s === 'playing') { setNewRecord(false); playSound('start'); }
  };

  // Конец игры — сохраняем рекорд
  useEffect(() => {
    if (status !== 'over') return;
    const prev = getBest(game);
    setBest(saveBest(game, score));
    const record = score > prev && score > 0;
    setNewRecord(record);
    playSound('over');
    if (record) playSound('record');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const meta = GAMES.find((g) => g.id === game)!;

  return (
    <section
      ref={rootRef}
      className={`tl-panel p-4 text-left ${fullscreen ? 'w-screen h-screen max-w-none flex flex-col items-center justify-center !bg-[var(--bg)]' : 'w-full max-w-[600px]'}`}
      aria-label="Мини-игры"
    >
      <div className={fullscreen ? 'w-full' : ''} style={fullscreen ? { maxWidth: PLAY_WIDTH_FULLSCREEN } : undefined}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Gamepad2 size={15} className="text-accent shrink-0" />
        <span className="tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white mr-auto">Пока нет связи</span>
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => choose(g.id)}
            aria-pressed={g.id === game}
            className={`tl-btn !py-1.5 ${g.id === game ? 'solid' : 'ghost'}`}
          >
            {g.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setMuted(!muted); setMutedState(!muted); }}
          title={muted ? 'Включить звук' : 'Выключить звук'}
          aria-label={muted ? 'Включить звук' : 'Выключить звук'}
          aria-pressed={muted}
          className="tl-btn ghost !p-2"
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          title={fullscreen ? 'Свернуть (Esc)' : 'На весь экран'}
          aria-label={fullscreen ? 'Свернуть' : 'На весь экран'}
          className="tl-btn ghost !p-2"
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      <div className="flex items-center gap-4 mb-2 tl-term text-[15px]">
        <span className="text-white">Очки: <b className="tl-num text-[13px] text-accent">{score}</b></span>
        <span className="flex items-center gap-1 tl-muted"><Trophy size={13} /> Рекорд: <b className="tl-num text-[13px] text-white">{Math.max(best, status === 'playing' ? score : 0)}</b></span>
        {game === 'fruit' && (
          <span className="flex items-center gap-0.5 ml-auto" aria-label={`Жизни: ${lives}`}>
            {[0, 1, 2].map((i) => <Heart key={i} size={14} className={i < lives ? 'text-accent fill-current' : 'text-pearl/20'} />)}
          </span>
        )}
      </div>

      <div className="relative w-full">
        {game === 'snake'
          ? <SnakeGame key="snake" active onScore={setScore} onStatus={onStatus} status={status} />
          : <FruitGame key="fruit" active onScore={setScore} onStatus={onStatus} onLives={setLives} status={status} />}

        {status !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 pointer-events-none text-center px-4">
            {status === 'over' ? (
              <>
                <p className={`tl-pixel ${fullscreen ? 'text-[34px]' : 'text-[20px]'} text-white`} style={{ textShadow: 'var(--glow-sm)' }}>Игра окончена</p>
                <p className="tl-term text-[16px] text-pearl/85">
                  Очки: {score}{newRecord ? ' — новый рекорд!' : ''}
                </p>
                <p className="tl-head text-[10px] uppercase tracking-[0.14em] text-accent flex items-center gap-1.5">
                  <RotateCcw size={11} /> Пробел или клик — ещё раз
                </p>
              </>
            ) : (
              <>
                <p className="tl-pixel text-[18px] text-white">{meta.title}</p>
                <p className="tl-term text-[15px] text-pearl/80 max-w-[380px]">{meta.hint}</p>
                <p className="tl-head text-[10px] uppercase tracking-[0.14em] text-accent">Пробел или клик — начать</p>
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </section>
  );
}

// На весь экран поле растёт, пока помещается по ширине и по высоте (над ним — строка с кнопками и счётом)
const PLAY_WIDTH_FULLSCREEN = `min(calc(100vw - 48px), calc((100vh - 130px) * ${FIELD_W / FIELD_H}))`;
