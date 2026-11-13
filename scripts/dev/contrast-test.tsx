import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { StoreSubNav } from '../../src/pages/market/StoreSubNav';
import GameCard from '../../src/pages/market/components/catalog/GameCard';
import CatalogToolbar from '../../src/pages/market/components/catalog/CatalogToolbar';
import CatalogFilters from '../../src/pages/market/components/catalog/CatalogFilters';
import SettingsToggle from '../../src/pages/settings/components/SettingsToggle';
import LibraryGameCard from '../../src/pages/library/components/LibraryGameCard';
import { GameHoverPreview, GameRating } from '../../src/components/GameHoverPreview';

const game = {
  id: 1,
  title: 'Косплей-студия 18+',
  developer: 'Studio Hikari',
  description: 'Симулятор косплеера: съёмки, образы и поклонники. Разверни собственную студию и снимай звёздных манекенщиков.',
  header_image: '',
  age_rating: '18+',
  is_adult: true,
  tags: [{ id: 1, name: '18+' }, { id: 2, name: 'Взрослый контент' }, { id: 3, name: 'Аниме 18+' }, { id: 4, name: 'Симулятор' }],
};

/** Открывает выпадающее меню и фиксирует, как меняется inline-стиль (анимация) */
function AnimationProbe() {
  useEffect(() => {
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const status = document.getElementById('status');

    (async () => {
      await sleep(300);
      const btn = Array.from(document.querySelectorAll('nav button'))
        .find((b) => b.textContent?.includes('Рекомендации'));
      if (!btn) { status!.textContent = 'FAIL: кнопка не найдена'; return; }

      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      let rafs = 0;
      const count = () => { rafs++; requestAnimationFrame(count); };
      requestAnimationFrame(count);
      const t0 = performance.now();

      const samples: string[] = [];
      for (const at of [60, 150, 300, 600, 1000]) {
        await sleep(at - (samples.length ? [60, 150, 300, 600, 1000][samples.length - 1] : 0));
        const menu = document.querySelector('.rounded-b-\\[2rem\\]') as HTMLElement | null;
        if (!menu) { samples.push(`${at}ms:нет`); continue; }
        const cs = getComputedStyle(menu);
        samples.push(`${at}ms:op=${cs.opacity}|an=${cs.animationName}|dur=${cs.animationDuration}`);
      }

      const first = document.querySelector('.rounded-b-\\[2rem\\]') as HTMLElement | null;
      const diag = first
        ? `cls=[${first.className.slice(0, 120)}] animProp=${first.style.animation || '—'}`
        : 'нет элемента';

      status!.textContent = `clock=${Math.round(performance.now() - t0)}ms raf=${rafs} ${diag} | ${samples.join(' | ')}`;
    })();
  }, []);

  return <div id="status">ОЖИДАНИЕ</div>;
}

/** Наводит курсор на карточку библиотеки и пишет, какой transform получился */
function TiltProbe() {
  useEffect(() => {
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    (async () => {
      await sleep(400);
      const outer = document.getElementById('tilt-card-test');
      const status = document.getElementById('status-tilt');
      if (!outer || !status) return;

      const r = outer.getBoundingClientRect();
      const opts = { bubbles: true, clientX: r.left + r.width * 0.15, clientY: r.top + r.height * 0.15 };
      // событие шлём на саму карточку (всплытие идёт вверх, а не вниз)
      const target = (outer.querySelector('.tilt-inner') as HTMLElement) || outer;

      // дошли ли события вообще (нативный слушатель на корне React)
      let rootSaw = 0;
      const root = document.getElementById('root');
      const onRoot = () => { rootSaw++; };
      root?.addEventListener('mousemove', onRoot);

      target.dispatchEvent(new MouseEvent('mouseover', opts));
      target.dispatchEvent(new MouseEvent('mousemove', opts));
      const mm = document.getElementById('mm-react');
      mm?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }));
      root?.removeEventListener('mousemove', onRoot);
      await sleep(60);

      const inner = outer.querySelector('.tilt-inner') as HTMLElement | null;

      // контроль: доходит ли до React вообще? кликаем чекбокс тумблера (onChange)
      const toggle = document.querySelector('#toggles input[type="checkbox"]') as HTMLInputElement | null;
      const before = toggle?.checked;
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(30);
      const after = toggle?.checked;

      status.textContent = inner
        ? `rect=${Math.round(r.width)}x${Math.round(r.height)} rootSaw=${rootSaw} mmReact=${(window as any).__mmReact || 0} inlineAttr=[${(inner.getAttribute('style') || '').slice(0, 90)}] click=${before}→${after}`
        : 'FAIL: .tilt-inner не найден';

      // --- выбор тега в фильтрах: строка чипсов должна раскрываться плавно ---
      const filters = document.getElementById('filters');
      if (filters) {
        const rowSel = '[class*="overflow-hidden"][class*="transition-all"]';
        const rowBefore = filters.querySelector(rowSel) as HTMLElement | null;
        const beforeCls = rowBefore
          ? (rowBefore.className.match(/max-h-\S+/) || ['?'])[0]
          : 'НЕТ';

        // открываем выпадающий список тегов (он свёрнут, пока не открыт)
        const opener = Array.from(filters.querySelectorAll('button'))
          .find((b) => (b.textContent || '').toUpperCase().includes('ВЫБРАТЬ')) as HTMLButtonElement | null;
        opener?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(80);
        const openNow = !!filters.querySelector('input[placeholder*="тегов" i]');

        const pill = Array.from(filters.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Аниме') as HTMLButtonElement | null;
        pill?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(120);

        const row = filters.querySelector(rowSel) as HTMLElement | null;
        const chip = filters.querySelector('[class*="bg-accent/10"]');
        const afterCls = row ? (row.className.match(/max-h-\S+/) || ['?'])[0] : 'НЕТ';
        const transition = row ? /transition-all/.test(row.className) && /duration-300/.test(row.className) : false;
        status.textContent += ` | тегДо=${beforeCls} тегПосле=${afterCls} плавный=${transition} чип=${!!chip} пиллНайден=${!!pill}`;
      }

      // --- попап игры при наведении ---
      const gh = document.getElementById('game-hover-test');
      if (gh) {
        // обработчик висит на внутреннем span компонента — событие шлём именно в него
        const target = (gh.querySelector('span') as HTMLElement) || gh;
        const box = target.getBoundingClientRect();
        const ev = { bubbles: true, clientX: box.left + 10, clientY: box.top + 10 };
        target.dispatchEvent(new MouseEvent('mouseover', ev));
        target.dispatchEvent(new MouseEvent('mousemove', ev));
        await sleep(600); // задержка показа 400ms + запас

        const pop = Array.from(document.querySelectorAll('.w-\\[320px\\]'))
          .find((el) => el.textContent?.includes('Косплей-студия')) as HTMLElement | null;
        if (!pop) {
          status.textContent += ' | попап игры: НЕТ';
        } else {
          const mediaBox = pop.querySelector('.grid-cols-4');
          const items = mediaBox ? mediaBox.children.length : 0;
          const videos = pop.querySelectorAll('video').length;
          const ratingText = pop.textContent || '';
          const rate = (id: string) =>
            (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

          // карусель: слайды, их размер, стрелки и точки
          const carousel = pop.querySelector('.overflow-x-auto') as HTMLElement | null;
          const slides = carousel ? carousel.children.length : 0;
          const slideH = carousel && carousel.firstElementChild
            ? Math.round(carousel.firstElementChild.getBoundingClientRect().height) : 0;
          const slideW = carousel && carousel.firstElementChild
            ? Math.round(carousel.firstElementChild.getBoundingClientRect().width) : 0;
          const arrows = pop.querySelectorAll('button[aria-label*="Предыдущее"], button[aria-label*="Следующее"]').length;
          const dots = pop.querySelectorAll('button[aria-label^="Медиа "]').length;

          // листание: двигаем скролл и проверяем, что подсветилась другая точка
          let moved = 'нет карусели';
          if (carousel) {
            const dotStates = () => Array.from(pop.querySelectorAll('button[aria-label^="Медиа "]'))
              .map((d) => (d.className.includes('w-4') ? '1' : '0')).join('');
            const before = dotStates();
            carousel.scrollLeft = 320;
            carousel.dispatchEvent(new Event('scroll'));
            await sleep(80);
            const after = dotStates();
            moved = `до=${before} после=${after} scrollLeft=${Math.round(carousel.scrollLeft)} ${after !== before ? 'OK' : 'НЕТ'}`;
          }

          status.textContent +=
            ` | попап:ЕСТЬ заголовок=${pop.textContent?.includes('Косплей-студия')} медиа4старое=${items} видео=${videos}` +
            ` | карусель:слайдов=${slides} размер=${slideW}x${slideH} стрелки=${arrows} точки=${dots} листание[${moved}]` +
            ` | оценки[${rate('rating-full')}] [${rate('rating-loading')}] [${rate('rating-error')}]`;
        }
      }

      // --- карточки не должны сжиматься до размера контента ---
      const sq = document.getElementById('squeeze-test');
      if (sq) {
        const cells = Array.from(sq.children) as HTMLElement[];
        const cellW = cells[0] ? Math.round(cells[0].getBoundingClientRect().width) : 0;
        const cardW = cells.map((c) =>
          Math.round((c.firstElementChild as HTMLElement)?.getBoundingClientRect().width || 0),
        );
        const cardH = cells.map((c) =>
          Math.round((c.firstElementChild as HTMLElement)?.getBoundingClientRect().height || 0),
        );
        const okW = cardW.length === 2 && cardW[0] === cellW && cardW[1] === cellW;
        const okH = cardH.length === 2 && cardH[0] === cardH[1];
        const slotH = cells.map((c) => Math.round(c.getBoundingClientRect().height));
        status.textContent +=
          ` | сжатие:ширина=[${cardW.join(',')}] трек=${cellW} ${okW ? 'OK' : 'СЖАТЫ'}` +
          ` высота=[${cardH.join(',')}] ${okH ? 'OK' : 'РАЗНЫЕ'}` +
          ` обёртки=[${slotH.join(',')}] класс=[${(cells[0]?.className || '').slice(0, 70)}]`;
      }
    })();
  }, []);
  return <div id="status-tilt">ОЖИДАНИЕ</div>;
}

function App() {
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  return (
    <MemoryRouter>
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at 30% 20%, #b14fff 0%, #6a1bd1 35%, #2a0b52 70%, #12042a 100%)',
        }}
      >
        <StoreSubNav />
        <AnimationProbe />

        <div style={{ padding: 32, maxWidth: 720 }}>
          <div id="toolbar">
            <CatalogToolbar
              searchQuery=""
              onChangeSearch={() => {}}
              sortBy="relevance"
              onChangeSort={() => {}}
              hasFilters={false}
              selectedRating=""
              onClearRating={() => {}}
              selectedTags={pickedTags}
              onToggleTag={(tg: string) => setPickedTags((prev) => (prev.includes(tg) ? prev.filter((x) => x !== tg) : [...prev, tg]))}
              selectedLang=""
              onClearLang={() => {}}
              resultCount={42}
              pageSize={20}
              onChangePageSize={() => {}}
              view="grid"
              onChangeView={() => {}}
            />
          </div>

          <div style={{ width: 300, marginTop: 8, display: 'inline-block', verticalAlign: 'top' }} id="filters">
            <CatalogFilters
              hasFilters={true}
              clearFilters={() => {}}
              selectedRating=""
              onChangeRating={() => {}}
              allTags={['Аниме', 'Симулятор', 'RPG', 'Шутер', 'Хоррор', 'Гонки', 'Стратегии', 'Кооп', '18+']}
              selectedTags={pickedTags}
              onToggleTag={(tg: string) => setPickedTags((prev) => (prev.includes(tg) ? prev.filter((x) => x !== tg) : [...prev, tg]))}
              allLanguages={['Русский', 'Английский']}
              selectedLang=""
              onChangeLang={() => {}}
              getHideAdult={() => false}
            />
          </div>

          <div style={{ width: 300, marginTop: 8, display: 'inline-block', verticalAlign: 'top', marginLeft: 16 }} id="card">
            <GameCard game={game} onClick={() => {}} />
          </div>
        </div>

        <div
          id="toggles"
          style={{ maxWidth: 420, marginTop: 32, padding: 24, background: 'rgba(0,0,0,0.25)', borderRadius: 16 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <SettingsToggle label="Показывать уведомления" checked={true} onChange={() => {}} />
            <SettingsToggle label="Звуки интерфейса" checked={false} onChange={() => {}} />
            <SettingsToggle label="Анимации" checked={true} onChange={() => {}} disabled />
          </div>
        </div>

        <div style={{ maxWidth: 720, marginTop: 32 }}>
          <TiltProbe />
          <div id="mm-react" onMouseMove={() => { const w = window as any; w.__mmReact = (w.__mmReact || 0) + 1; }} />
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <div id="tilt-card-test" style={{ width: 160 }}>
              <LibraryGameCard
                entry={{
                  id: 1,
                  game_id: 1,
                  favorite: true,
                  created_at: new Date().toISOString(),
                  game: {
                    ID: 1,
                    title: 'Dota 2',
                    header_image: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/header.jpg',
                    banner_url: '',
                    age_rating: '12+',
                    developer: 'Valve',
                    tags: [],
                  },
                }}
                onOpen={() => {}}
                onToggleFavorite={() => {}}
                onRemove={() => {}}
              />
            </div>

            <div id="game-hover-test" style={{ width: 200 }}>
              <GameHoverPreview
                game={{
                  ID: 570,
                  title: 'Косплей-студия 18+',
                  header_image: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/header.jpg',
                  media: [
                    { id: 1, url: 'https://picsum.photos/seed/a/320/180', is_video: false },
                    { id: 2, url: 'https://picsum.photos/seed/b/320/180', is_video: false },
                    { id: 3, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', is_video: true },
                    { id: 4, url: 'https://picsum.photos/seed/d/320/180', is_video: false },
                    { id: 5, url: 'https://picsum.photos/seed/e/320/180', is_video: false },
                  ],
                }}
              >
                <div
                  style={{
                    width: 180, height: 110, borderRadius: 12,
                    background: 'linear-gradient(135deg,#8338EC,#FF006E)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                  }}
                >
                  КАРТОЧКА ИГРЫ
                </div>
              </GameHoverPreview>
            </div>
          </div>

          <div
            id="squeeze-test"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: 560, marginTop: 24 }}
          >
            <GameHoverPreview game={{ ID: 9, title: 'Terraria', header_image: '', media: [] }}>
              <GameCard
                game={{ id: 9, title: 'Terraria', developer: 'Re-Logic', description: '', header_image: '', tags: [{ id: 1, name: 'Action' }] }}
                onClick={() => {}}
              />
            </GameHoverPreview>
            <GameHoverPreview game={{ ID: 10, title: 'Длинная игра', header_image: '', media: [] }}>
              <GameCard
                game={{
                  id: 10,
                  title: 'Длинная игра',
                  developer: 'Studio',
                  description: 'Очень длинное описание игры, которое растягивает карточку по ширине сетки и заставляет её занимать всё положенное место в ряду каталога.',
                  header_image: '',
                  tags: [{ id: 1, name: 'Action' }],
                }}
                onClick={() => {}}
              />
            </GameHoverPreview>
          </div>
          <div style={{ marginTop: 24, width: 340, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 12 }}>
            <div id="rating-samples" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div id="rating-full"><GameRating rating={{ positive_count: 9, negative_count: 3, total: 12, percent: 75 }} /></div>
              <div id="rating-empty"><GameRating rating={{ positive_count: 0, negative_count: 0, total: 0, percent: null }} /></div>
              <div id="rating-loading"><GameRating rating={undefined} /></div>
              <div id="rating-error"><GameRating rating={null} /></div>
            </div>
          </div>
        </div>
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
