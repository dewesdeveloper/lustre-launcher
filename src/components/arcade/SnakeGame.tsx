import { useEffect, useRef } from 'react';
import { FIELD_H, FIELD_W, themeColors, watchCanvasSize, type GameStatus } from './arcade';
import { playSound } from './sound';

const COLS = 24;
const ROWS = 16;
const CELL = 22;
const W = FIELD_W;  // = COLS * CELL
const H = FIELD_H;  // = ROWS * CELL
const START_MS = 140;   // шаг змейки в начале
const MIN_MS = 60;      // и предельная скорость

type Point = { x: number; y: number };

const KEYS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
};

function freeCell(snake: Point[]): Point {
  for (;;) {
    const p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

/**
 * Змейка: стрелки или WASD, пробел — старт и новая игра. Яблоко — +1 очко, с каждым
 * скорость растёт. Проигрыш — удар о стену или о свой хвост.
 */
export default function SnakeGame({ onScore, onStatus, status, active }: {
  onScore: (score: number) => void;
  onStatus: (s: GameStatus) => void;
  status: GameStatus;
  /** игра на экране: управление с клавиатуры только тогда */
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    snake: [] as Point[],
    dir: { x: 1, y: 0 } as Point,
    queue: [] as Point[],
    food: { x: 0, y: 0 } as Point,
    score: 0,
    acc: 0,
    last: 0,
  });
  const statusRef = useRef(status);
  statusRef.current = status;

  const reset = () => {
    const s = state.current;
    const mid = Math.floor(ROWS / 2);
    s.snake = [{ x: 6, y: mid }, { x: 5, y: mid }, { x: 4, y: mid }];
    s.dir = { x: 1, y: 0 };
    s.queue = [];
    s.food = freeCell(s.snake);
    s.score = 0;
    s.acc = 0;
    onScore(0);
  };

  const start = () => {
    reset();
    onStatus('playing');
  };

  useEffect(() => { reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Управление
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (statusRef.current !== 'playing') start();
        return;
      }
      const d = KEYS[e.code];
      if (!d) return;
      e.preventDefault();
      if (statusRef.current !== 'playing') { start(); return; }
      const s = state.current;
      // разворот на 180° запрещён; очередь — чтобы быстрые нажатия не терялись между шагами
      const last = s.queue.at(-1) ?? s.dir;
      if (d.x === -last.x && d.y === -last.y) return;
      if (d.x === last.x && d.y === last.y) return;
      if (s.queue.length < 3) { s.queue.push(d); playSound('turn'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Игровой цикл и отрисовка
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx = canvas.getContext('2d')!;
    const stopWatch = watchCanvasSize(canvas, W, H, (next) => { ctx = next; });
    const c = themeColors();
    let raf = 0;

    const step = () => {
      const s = state.current;
      if (s.queue.length) s.dir = s.queue.shift()!;
      const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
      const hitWall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
      const eating = head.x === s.food.x && head.y === s.food.y;
      // хвост уходит на этом же шаге, поэтому в его клетку войти можно
      const body = eating ? s.snake : s.snake.slice(0, -1);
      if (hitWall || body.some((p) => p.x === head.x && p.y === head.y)) {
        onStatus('over');
        return;
      }
      s.snake = [head, ...body];
      if (eating) {
        s.score += 1;
        onScore(s.score);
        playSound('eat');
        s.food = s.snake.length >= COLS * ROWS ? { x: -1, y: -1 } : freeCell(s.snake);
      }
    };

    const draw = () => {
      const s = state.current;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); ctx.stroke(); }
      for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); ctx.stroke(); }

      // яблоко
      ctx.shadowColor = c.accent;
      ctx.shadowBlur = 12;
      ctx.fillStyle = c.accent;
      ctx.fillRect(s.food.x * CELL + 4, s.food.y * CELL + 4, CELL - 8, CELL - 8);
      ctx.shadowBlur = 0;

      // змейка: голова ярче, хвост тускнеет
      s.snake.forEach((p, i) => {
        const t = 1 - i / Math.max(s.snake.length, 8);
        ctx.fillStyle = i === 0 ? '#ffffff' : c.green;
        ctx.globalAlpha = i === 0 ? 1 : 0.35 + 0.65 * t;
        ctx.fillRect(p.x * CELL + 2, p.y * CELL + 2, CELL - 4, CELL - 4);
      });
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = state.current;
      const dt = s.last ? Math.min(now - s.last, 250) : 0;
      s.last = now;
      if (statusRef.current === 'playing' && !document.hidden) {
        s.acc += dt;
        const interval = Math.max(MIN_MS, START_MS - s.score * 3);
        while (s.acc >= interval && statusRef.current === 'playing') {
          s.acc -= interval;
          step();
        }
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); stopWatch(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onClick={() => { if (status !== 'playing') start(); }}
      style={{ width: '100%', aspectRatio: `${W} / ${H}` }}
      className="block border border-[var(--line)] bg-[#08050f] cursor-pointer"
      aria-label="Змейка"
    />
  );
}
