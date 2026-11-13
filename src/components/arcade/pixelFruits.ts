// Пиксельные фрукты для «Фрукт-ниндзя»: спрайты 12×12, рисуются один раз в маленький холст
// и увеличиваются без сглаживания — так они остаются чёткими и в полном экране.

export const SPRITE_PX = 12;

type Paint = (x: number, y: number) => string | null;

export interface FruitKind {
  id: string;
  juice: string;
  sprite: HTMLCanvasElement;
}

function makeSprite(paint: Paint): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPRITE_PX;
  c.height = SPRITE_PX;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < SPRITE_PX; y++) {
    for (let x = 0; x < SPRITE_PX; x++) {
      const color = paint(x, y);
      if (color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
    }
  }
  return c;
}

// Круглый фрукт: основной цвет, тень справа снизу, блик слева сверху
function round(base: string, shade: string, light: string, { cx = 5.5, cy = 6.5, rx = 5, ry = 5 } = {}): Paint {
  return (x, y) => {
    const dx = (x - cx) / (rx + 0.5), dy = (y - cy) / (ry + 0.5);
    if (dx * dx + dy * dy > 1) return null;
    if ((x === Math.round(cx) - 2 && y === Math.round(cy) - 2) || (x === Math.round(cx) - 3 && y === Math.round(cy) - 1)) return light;
    return dx + dy > 0.55 ? shade : base;
  };
}

// Хвостик и листик поверх основы
function withTop(paint: Paint, stem: [number, number][], leaf: [number, number][]): Paint {
  return (x, y) => {
    if (stem.some(([sx, sy]) => sx === x && sy === y)) return '#5a3a1a';
    if (leaf.some(([lx, ly]) => lx === x && ly === y)) return '#3fae4a';
    return paint(x, y);
  };
}

const STRAWBERRY = [
  '....gggg....',
  '...gggggg...',
  '..rrggggrr..',
  '.rrrrrrrrrr.',
  '.rryrrrryrr.',
  '.rrrrrrrrrr.',
  '..rrryrrrr..',
  '..rrrrryrd..',
  '...rrrrrd...',
  '...ryrrdd...',
  '....rrdd....',
  '.....dd.....',
];

const BANANA = [
  '..........b.',
  '.........yb.',
  '........yy..',
  '.......yyy..',
  '......yyyd..',
  '....yyyyd...',
  '..yyyyydd...',
  'yyyyyydd....',
  '.yyyddd.....',
  '..ddd.......',
  '............',
  '............',
];

function fromRows(rows: string[], palette: Record<string, string>): Paint {
  return (x, y) => palette[rows[y]?.[x] ?? '.'] ?? null;
}

let cache: { fruits: FruitKind[]; bomb: HTMLCanvasElement } | null = null;

export function pixelFruits() {
  if (cache) return cache;
  const fruits: FruitKind[] = [
    { id: 'apple', juice: '#ff3b3b', sprite: makeSprite(withTop(round('#e8323a', '#a51c2a', '#ff9a9a'), [[6, 0], [6, 1]], [[7, 0], [8, 0], [8, 1]])) },
    { id: 'orange', juice: '#ff9f1a', sprite: makeSprite(withTop(round('#ff9f1a', '#d9730b', '#ffd9a0'), [[6, 1]], [[7, 1], [7, 0]])) },
    { id: 'lemon', juice: '#ffe14a', sprite: makeSprite(round('#ffe14a', '#d6b21f', '#fff6b8', { cx: 5.5, cy: 6, rx: 5, ry: 3.6 })) },
    { id: 'melon', juice: '#ff3b5c', sprite: makeSprite((x, y) => {
      const base = round('#2e9e45', '#1d6b2e', '#7ddc8a')(x, y);
      return base === '#2e9e45' && x % 3 === 0 ? '#1d6b2e' : base;
    }) },
    { id: 'plum', juice: '#b04fd0', sprite: makeSprite(withTop(round('#8e44ad', '#5e2a73', '#d39cec'), [[6, 1]], [])) },
    { id: 'kiwi', juice: '#8fd14f', sprite: makeSprite(round('#8a6a3a', '#5d4423', '#c7a26b')) },
    { id: 'strawberry', juice: '#ff2d55', sprite: makeSprite(fromRows(STRAWBERRY, { r: '#ff2d55', d: '#b3173a', y: '#ffe14a', g: '#3fae4a' })) },
    { id: 'banana', juice: '#ffe14a', sprite: makeSprite(fromRows(BANANA, { y: '#ffe14a', d: '#d6b21f', b: '#5a3a1a' })) },
  ];
  const bomb = makeSprite((x, y) => {
    if ((x === 8 && y === 2) || (x === 9 && y === 1)) return '#8a6a3a'; // фитиль
    if (x === 10 && y === 0) return '#ffb020';                           // искра
    if ((x === 9 && y === 0) || (x === 11 && y === 1)) return '#ffe14a';
    return round('#2a2a35', '#14141a', '#7a7a92', { cx: 5.5, cy: 7, rx: 4.6, ry: 4.6 })(x, y);
  });
  cache = { fruits, bomb };
  return cache;
}
