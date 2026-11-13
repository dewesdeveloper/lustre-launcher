import { useEffect, useRef } from 'react';
import { FIELD_H, FIELD_W, themeColors, watchCanvasSize, type GameStatus } from './arcade';
import { pixelFruits, SPRITE_PX } from './pixelFruits';
import { playSound } from './sound';

const W = FIELD_W;
const H = FIELD_H;
const GRAVITY = 900;      // пикселей/с²
const LIVES = 3;
const SIZE = SPRITE_PX * 4; // спрайт 12×12, увеличенный ровно в 4 раза

interface Item {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number;
  sprite: HTMLCanvasElement; juice: string; bomb: boolean; sliced: boolean;
}
interface Half { x: number; y: number; vx: number; vy: number; rot: number; vr: number; sprite: HTMLCanvasElement; side: -1 | 1 }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string }
interface TrailPoint { x: number; y: number; t: number }

// Пересечение отрезка движения курсора с кругом фрукта
function segmentHitsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
  const px = ax + t * dx - cx, py = ay + t * dy - cy;
  return px * px + py * py <= r * r;
}

/**
 * «Фрукт-ниндзя»: зажмите кнопку мыши и проведите по фруктам. Фрукт — +1 очко, три и больше
 * за один взмах — бонус за комбо. Упустили 3 фрукта или задели бомбу — проигрыш.
 */
export default function FruitGame({ onScore, onStatus, onLives, status, active }: {
  onScore: (score: number) => void;
  onStatus: (s: GameStatus) => void;
  onLives: (lives: number) => void;
  status: GameStatus;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    items: [] as Item[], halves: [] as Half[], sparks: [] as Spark[], trail: [] as TrailPoint[],
    score: 0, lives: LIVES, spawnIn: 0, elapsed: 0, last: 0,
    pointerDown: false, swipeHits: 0, combo: { text: '', until: 0, x: 0, y: 0 },
    flash: 0,
  });
  const statusRef = useRef(status);
  statusRef.current = status;

  const reset = () => {
    const s = state.current;
    s.items = []; s.halves = []; s.sparks = []; s.trail = [];
    s.score = 0; s.lives = LIVES; s.spawnIn = 0.6; s.elapsed = 0; s.swipeHits = 0;
    s.combo = { text: '', until: 0, x: 0, y: 0 };
    onScore(0);
    onLives(LIVES);
  };

  const start = () => {
    reset();
    onStatus('playing');
  };

  useEffect(() => { reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && statusRef.current !== 'playing') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx = canvas.getContext('2d')!;
    const stopWatch = watchCanvasSize(canvas, W, H, (next) => { ctx = next; });
    const c = themeColors();
    const { fruits, bomb: bombSprite } = pixelFruits();
    let raf = 0;

    const spawnWave = () => {
      const s = state.current;
      // со временем фруктов в волне больше и бомбы чаще
      const level = Math.min(s.elapsed / 30, 1);
      const count = 1 + Math.floor(Math.random() * (2 + level * 3));
      for (let i = 0; i < count; i++) {
        const bomb = s.elapsed > 4 && Math.random() < 0.08 + level * 0.1;
        const x = 60 + Math.random() * (W - 120);
        const kind = fruits[Math.floor(Math.random() * fruits.length)];
        s.items.push({
          x, y: H + SIZE,
          vx: (W / 2 - x) * (0.4 + Math.random() * 0.5) + (Math.random() - 0.5) * 80,
          vy: -(560 + Math.random() * 160),
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 6,
          sprite: bomb ? bombSprite : kind.sprite, juice: kind.juice,
          bomb, sliced: false,
        });
      }
      s.spawnIn = Math.max(0.55, 1.5 - level * 0.9) + Math.random() * 0.5;
    };

    const slice = (it: Item) => {
      const s = state.current;
      it.sliced = true;
      if (it.bomb) {
        playSound('bomb');
        s.flash = 1;
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 380;
          s.sparks.push({ x: it.x, y: it.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8, color: i % 2 ? '#ffb020' : '#ffffff' });
        }
        onStatus('over');
        return;
      }
      s.score += 1;
      s.swipeHits += 1;
      playSound('slice');
      for (const side of [-1, 1] as const) {
        s.halves.push({ x: it.x, y: it.y, vx: it.vx + side * 90, vy: it.vy * 0.4 - 60, rot: it.rot, vr: side * 4, sprite: it.sprite, side });
      }
      const color = it.juice || c.accent;
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 200;
        s.sparks.push({ x: it.x, y: it.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color });
      }
      // комбо: с третьего фрукта за один взмах каждый даёт очко сверху
      if (s.swipeHits >= 3) {
        s.score += 1;
        if (s.swipeHits === 3) playSound('combo');
        s.combo = { text: `Комбо ×${s.swipeHits}`, until: s.elapsed + 0.9, x: it.x, y: it.y };
      }
      onScore(s.score);
    };

    const update = (dt: number) => {
      const s = state.current;
      s.elapsed += dt;
      s.spawnIn -= dt;
      if (s.spawnIn <= 0) spawnWave();

      for (const it of s.items) {
        it.vy += GRAVITY * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
      }
      // упавший нетронутым фрукт — минус жизнь (бомбу пропускать можно)
      const fallen = s.items.filter((it) => !it.sliced && it.vy > 0 && it.y > H + SIZE);
      for (const it of fallen) {
        if (!it.bomb) {
          s.lives -= 1;
          onLives(s.lives);
          if (s.lives > 0) playSound('miss');
        }
      }
      s.items = s.items.filter((it) => !it.sliced && !(it.vy > 0 && it.y > H + SIZE));
      if (s.lives <= 0) onStatus('over');

      for (const h of s.halves) { h.vy += GRAVITY * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; }
      s.halves = s.halves.filter((h) => h.y < H + SIZE * 2);
    };

    const updateFx = (dt: number) => {
      const s = state.current;
      for (const p of s.sparks) { p.vy += GRAVITY * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      s.sparks = s.sparks.filter((p) => p.life > 0);
      const now = performance.now();
      s.trail = s.trail.filter((p) => now - p.t < 140);
      s.flash = Math.max(0, s.flash - dt * 2);
    };

    // Спрайт без сглаживания; половинки разрезанного фрукта — та же картинка, обрезанная по центру
    const drawSprite = (sprite: HTMLCanvasElement, x: number, y: number, rot: number, clipSide: 0 | -1 | 1 = 0) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (clipSide) {
        ctx.beginPath();
        ctx.rect(clipSide < 0 ? -SIZE : 0, -SIZE, SIZE, SIZE * 2);
        ctx.clip();
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, -SIZE / 2, -SIZE / 2, SIZE, SIZE);
      ctx.restore();
    };

    const draw = () => {
      const s = state.current;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W, H);
      for (const h of s.halves) drawSprite(h.sprite, h.x, h.y, h.rot, h.side);
      for (const it of s.items) drawSprite(it.sprite, it.x, it.y, it.rot);
      for (const p of s.sparks) {
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x / 4) * 4 - 2, Math.round(p.y / 4) * 4 - 2, 4, 4); // брызги по пиксельной сетке
      }
      ctx.globalAlpha = 1;

      // след клинка
      if (s.trail.length > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = c.accent;
        ctx.shadowBlur = 14;
        for (let i = 1; i < s.trail.length; i++) {
          const a = s.trail[i - 1], b = s.trail[i];
          ctx.strokeStyle = i === s.trail.length - 1 ? '#ffffff' : c.accent;
          ctx.lineWidth = 2 + (i / s.trail.length) * 5;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      if (s.combo.text && s.elapsed < s.combo.until) {
        ctx.fillStyle = '#ffe14a';
        ctx.font = 'bold 18px "Silkscreen", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s.combo.text, Math.min(Math.max(s.combo.x, 80), W - 80), Math.max(s.combo.y - 40, 24));
      }
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.6})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = state.current;
      const dt = s.last ? Math.min((now - s.last) / 1000, 0.05) : 0;
      s.last = now;
      if (statusRef.current === 'playing' && !document.hidden) update(dt);
      updateFx(dt);
      draw();
    };
    raf = requestAnimationFrame(loop);

    // Взмах: ведём мышью с зажатой кнопкой (или пальцем)
    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const onDown = (e: PointerEvent) => {
      if (statusRef.current !== 'playing') { start(); return; }
      state.current.pointerDown = true;
      state.current.swipeHits = 0;
      state.current.trail = [{ ...toLocal(e), t: performance.now() }];
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const s = state.current;
      if (!s.pointerDown || statusRef.current !== 'playing') return;
      const p = toLocal(e);
      const prev = s.trail.at(-1) ?? { ...p, t: 0 };
      s.trail.push({ ...p, t: performance.now() });
      for (const it of s.items) {
        if (!it.sliced && segmentHitsCircle(prev.x, prev.y, p.x, p.y, it.x, it.y, SIZE * 0.45)) {
          slice(it);
          if (statusRef.current !== 'playing') break;
        }
      }
    };
    const onUp = () => { state.current.pointerDown = false; state.current.swipeHits = 0; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      cancelAnimationFrame(raf);
      stopWatch();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', aspectRatio: `${W} / ${H}`, touchAction: 'none' }}
      className="block border border-[var(--line)] bg-[#08050f] cursor-crosshair select-none"
      aria-label="Фрукт-ниндзя"
    />
  );
}
