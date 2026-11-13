import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { DOWNLOAD_ANDROID_URL, DOWNLOAD_WINDOWS_URL } from '../../utils/downloads';
import './about.css';

/* ============================================================
   ABOUT — страница-витрина лаунчера.
   Только web-версия (роут регистрируется в App.tsx при isWeb).
   Данные игр берутся из публичного GET /games/ (без авторизации),
   при недоступности API — встроенный статический снимок.
   ============================================================ */

interface ApiGame {
  id: number;
  title: string;
  description?: string | null;
  release_date?: string | null;
  age_rating?: string | null;
  is_adult?: boolean;
  banner_url?: string | null;
  header_image?: string | null;
  features?: unknown;
}

interface AboutSlide {
  id: number;
  adult: boolean;
  title: string;
  year: string;
  age: string;
  tags: string[];
  cover: string;
  desc: string;
}

interface AboutCard {
  id: number;
  age: string;
  title: string;
  img: string;
}

const S = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/';

/* ---------- статический фолбэк (снимок каталога) ---------- */
const FALLBACK_SLIDES_CLEAN: AboutSlide[] = [
  { id: 249, adult: false, title: 'PAPERHEAD', year: '2026', age: '18+', tags: ['Синглплеер'], cover: S + '2680280/page_bg_raw.jpg?t=1791732488', desc: 'В волшебном картонном мире что-то пошло не так... Используй покрытый загадочными рунами карандаш, кучу разнообразного оружия и сокрушительный пинок, чтобы пробиться сквозь толпы ужасных исчадий картонного ада.' },
  { id: 180, adult: false, title: 'Graveyard Keeper 2', year: '2026', age: '16+', tags: ['Синглплеер'], cover: 'https://store.akamai.steamstatic.com/images/storepagebackground/app/4358690?t=1790169326', desc: 'Самый недостоверный симулятор смотрителя на средневековом кладбище возвращается! Восстановите город, управляйте кладбищем, автоматизируйте производство и ведите свою армию нежити в бой.' },
  { id: 136, adult: false, title: 'Valheim', year: '2026', age: '12+', tags: ['Синглплеер', 'Кооп'], cover: S + '892970/page_bg_raw.jpg?t=1790220314', desc: 'Симулятор выживания и исследования для компании от 1 до 10 человек. Вас ждёт процедурно генерируемый мир, пропитанный духом скандинавских мифов.' },
  { id: 135, adult: false, title: 'Breathedge 2', year: '2026', age: '18+', tags: ['Синглплеер'], cover: S + '2412960/e65036bad87fc4d381c8d66438d94d0ac245bbcb/page_bg_raw.jpg?t=1788324312', desc: 'Выживайте на краю космоса! Создавайте и улучшайте инструменты, добывайте ресурсы и защитите галактику, летящую в тартарары.' },
];
const FALLBACK_SLIDES_ADULT: AboutSlide[] = [
  { id: 354, adult: true, title: 'Beauties of Blackfall', year: '2026', age: '18+', tags: ['Синглплеер'], cover: 'https://img.itch.zone/aW1nLzMwOTEzMzgxLnBuZw==/original/ji%2FM4m.png', desc: 'Эротический кулинарный боевой дек-билдер: собирайте колоду приёмов и блюд, сражайтесь и продвигайтесь сквозь тёмный городок Blackfall.' },
  { id: 381, adult: true, title: 'NPC Tales: The Adventurer Demo', year: '2026', age: '18+', tags: ['Синглплеер'], cover: 'https://img.itch.zone/aW1nLzMwOTE0NTU2LnBuZw==/original/PqmDRV.png', desc: 'Вторая демо-версия взрослого фэнтези-рпг NPC Tales: отряд приключенцев, таверна и приключения с лицензией на всё.' },
  { id: 290, adult: true, title: 'Toybox Descend', year: '2026', age: '18+', tags: ['Синглплеер'], cover: 'https://img.itch.zone/aW1nLzMwNzY3ODc0LnBuZw==/original/mf8k3w.png', desc: '3D-роглайк с ближним боем и взрослым контентом: спускайтесь в глубины испытаний, меняя снаряжение от забега к забегу.' },
  { id: 287, adult: true, title: 'Waterpark of Love', year: '2026', age: '18+', tags: ['Синглплеер'], cover: 'https://img.itch.zone/aW1nLzMwNjk2OTMyLnBuZw==/original/xLkriL.png', desc: 'Эротическое приключение от первого лица в аквапарке: солнце, вода и герои, которые точно не про водные горки.' },
];
const FALLBACK_GRID: AboutCard[] = [
  { id: 150, age: '12+', title: 'Hades II', img: S + '1145350/91ac334a2c137d08968ccc0bc474a02579602100/header.jpg?t=1779901265' },
  { id: 190, age: '12+', title: 'Palworld', img: S + '1623730/6912f19c43a95ff5fe514eedd35e68bf12335459/header.jpg?t=1790336367' },
  { id: 136, age: '12+', title: 'Valheim', img: S + '892970/1888731b59362fca6c026cdbafa3dfffd45c3146/header_alt_assets_6.jpg?t=1790220314' },
  { id: 120, age: '12+', title: 'Subnautica 2', img: S + '1962700/header.jpg?t=1785967256' },
  { id: 201, age: '16+', title: 'R.E.P.O.', img: S + '3241660/1ea445e044a2d5b09cfa8291350b63ebed6e5741/header.jpg?t=1778158882' },
  { id: 153, age: '18+', title: 'DOOM: The Dark Ages', img: S + '3017860/header.jpg?t=1789406231' },
  { id: 180, age: '16+', title: 'Graveyard Keeper 2', img: S + '4358690/7f50e84b1ea954a0edb7434eb8c02cd9b06909aa/header_alt_assets_1_russian.jpg?t=1790169326' },
  { id: 276, age: '12+', title: 'UNBEATABLE', img: S + '2240620/a3fe80f8848d0583be61f24292799e7f796e6319/header.jpg?t=1789392242' },
  { id: 257, age: '16+', title: 'Streamer Life Simulator 2', img: S + '2890830/header.jpg?t=1786957839' },
  { id: 244, age: '12+', title: 'The Talos Principle: Reawakened', img: S + '2806640/header.jpg?t=1778598180' },
  { id: 273, age: '12+', title: 'Yunyun Syndrome!? Rhythm Psychosis', img: S + '2914150/b58ce7618c376997fa067ab78906652f1d62d995/header.jpg?t=1791513577' },
  { id: 202, age: '7+', title: 'Rhythia', img: S + '2250500/7466f597a3eb3bad16b0180be3deef182d222690/header.jpg?t=1786627361' },
];
const FALLBACK_MARQUEE: AboutCard[] = FALLBACK_GRID.concat([
  { id: 249, age: '18+', title: 'PAPERHEAD', img: S + '2680280/0b30058f0a9d5ad4ed698367b19bad97001faa02/header.jpg?t=1791732488' },
  { id: 135, age: '18+', title: 'Breathedge 2', img: S + '2412960/083885c9265403cf35f96efa398d620ca06ec2ae/header.jpg?t=1788324312' },
  { id: 123, age: '18+', title: 'Shift At Midnight', img: S + '3722330/759ecea2ffe1ad3819aefdda79e265b8b332bf8f/header.jpg?t=1789401053' },
  { id: 277, age: '18+', title: 'DIVE or DIE', img: S + '3590290/e0279893a393cecd472e1475d16ddb648aad15a3/header.jpg?t=1785164308' },
  { id: 137, age: '18+', title: 'Mewgenics', img: S + '686060/aa8075d11165fef4d4d0d09c156f0da0623b5da1/header.jpg?t=1788661023' },
  { id: 154, age: '18+', title: 'Tiny Bunny', img: S + '1421250/962b6acf018040320b5a07df4f9e635a705664f0/header_russian.jpg?t=1789917370' },
  { id: 262, age: '12+', title: 'He is Coming', img: S + '2824490/02598f72d80e7c5da9f4b418f7fce15532d60388/header.jpg?t=1791278735' },
  { id: 269, age: '18+', title: 'Labyrinth Of The Demon King', img: S + '1804010/53398a473dbe1449743c585c48a722c2d0c23b83/header.jpg?t=1777590626' },
  { id: 250, age: '18+', title: 'CRUEL', img: S + '2689470/header.jpg?t=1778986231' },
  { id: 274, age: '16+', title: 'NEEDY STREAMER OVERLOAD', img: S + '3215170/header.jpg?t=1770251827' },
]);

/* ---------- помощники ---------- */
const stripHtml = (s?: string | null) =>
  String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const validYear = (d?: string | null) => {
  const y = Number(String(d || '').slice(0, 4));
  return y >= 2015 && y <= 2027;
};

const featureTags = (f: unknown): string[] => {
  let obj: any = f;
  if (typeof f === 'string') { try { obj = JSON.parse(f); } catch { obj = null; } }
  if (!obj || typeof obj !== 'object') return ['Синглплеер'];
  const out: string[] = [];
  if (obj.singlePlayer) out.push('Синглплеер');
  if (obj.coop) out.push('Кооп');
  if (obj.multiplayer) out.push('Мультиплеер');
  if (obj.online) out.push('Онлайн');
  return out.length ? out : ['Синглплеер'];
};

const toSlide = (g: ApiGame): AboutSlide => ({
  id: g.id,
  adult: !!g.is_adult,
  title: g.title,
  year: String(g.release_date || '').slice(0, 4),
  age: g.age_rating || '—',
  tags: featureTags(g.features),
  cover: g.banner_url || g.header_image || '',
  desc: stripHtml(g.description).slice(0, 230) || 'Игра каталога Lustre — подробности на странице.',
});

const toCard = (g: ApiGame): AboutCard => ({
  id: g.id,
  age: g.age_rating || '—',
  title: g.title,
  img: g.header_image || g.banner_url || '',
});

/* ---------- живые данные (публичный API, без авторизации) ---------- */
async function loadLive() {
  const [cleanRes, adultRes, listRes, totalRes, adultCountRes] = await Promise.all([
    api.get('/games/', { params: { limit: 40, sort: 'date-new', adult: '0' } }),
    api.get('/games/', { params: { limit: 40, sort: 'date-new', adult: '1' } }),
    api.get('/games/', { params: { limit: 22, sort: 'added-new', adult: '0' } }),
    api.get('/games/', { params: { limit: 1 } }),
    api.get('/games/', { params: { limit: 1, adult: '1' } }),
  ]);
  const clean = (cleanRes.data as ApiGame[]).filter(g => validYear(g.release_date)).slice(0, 4).map(toSlide);
  const adult = (adultRes.data as ApiGame[]).filter(g => validYear(g.release_date)).slice(0, 4).map(toSlide);
  const list = (listRes.data as ApiGame[]).map(toCard).filter(c => c.img);
  const total = Number(totalRes.headers['x-total-count']) || 0;
  const adultCount = Number(adultCountRes.headers['x-total-count']) || 0;
  if (!clean.length || !list.length) throw new Error('empty');
  return {
    slides: [...clean, ...adult],
    grid: list.slice(0, 12),
    marquee: list,
    total,
    adultCount,
  };
}

/* ---------- пиксельные иконки (SVG defs) ---------- */
const ICONS: Record<string, ReactNode> = {
  'i-spark': <><rect x="7" y="1" width="2" height="2" /><rect x="5" y="3" width="6" height="2" /><rect x="3" y="5" width="10" height="2" /><rect x="1" y="7" width="14" height="2" /><rect x="3" y="9" width="10" height="2" /><rect x="5" y="11" width="6" height="2" /><rect x="7" y="13" width="2" height="2" /></>,
  'i-monitor': <><rect x="2" y="2" width="12" height="2" /><rect x="2" y="2" width="2" height="9" /><rect x="12" y="2" width="2" height="9" /><rect x="2" y="9" width="12" height="2" /><rect x="7" y="11" width="2" height="2" /><rect x="5" y="13" width="6" height="1" /></>,
  'i-users': <><rect x="2" y="3" width="4" height="4" /><rect x="1" y="8" width="6" height="5" /><rect x="9" y="4" width="5" height="3" /><rect x="8" y="8" width="7" height="5" /></>,
  'i-cart': <><rect x="2" y="3" width="2" height="2" /><rect x="4" y="5" width="10" height="2" /><rect x="5" y="7" width="8" height="4" /><rect x="5" y="12" width="2" height="2" /><rect x="11" y="12" width="2" height="2" /></>,
  'i-box': <><rect x="2" y="4" width="12" height="10" /><rect x="2" y="7" width="12" height="2" fill="#0b0210" /><rect x="6" y="9" width="4" height="3" fill="#0b0210" /></>,
  'i-shield': <><rect x="3" y="2" width="10" height="2" /><rect x="2" y="4" width="12" height="7" /><rect x="4" y="11" width="8" height="3" /><rect x="7" y="5" width="2" height="5" fill="#0b0210" /></>,
  'i-phone': <><rect x="4" y="1" width="8" height="14" /><rect x="5" y="3" width="6" height="9" fill="#0b0210" /><rect x="7" y="13" width="2" height="1" /></>,
  'i-download': <><rect x="7" y="2" width="2" height="7" /><rect x="5" y="7" width="6" height="2" /><rect x="3" y="9" width="10" height="2" /><rect x="3" y="12" width="10" height="2" /></>,
  'i-check': <><rect x="3" y="8" width="2" height="2" /><rect x="5" y="10" width="2" height="2" /><rect x="7" y="8" width="2" height="2" /><rect x="9" y="6" width="2" height="2" /><rect x="11" y="4" width="2" height="2" /></>,
  'i-bolt': <><rect x="9" y="1" width="4" height="2" /><rect x="7" y="3" width="4" height="2" /><rect x="5" y="5" width="4" height="2" /><rect x="3" y="7" width="6" height="2" /><rect x="5" y="9" width="4" height="2" /><rect x="7" y="11" width="3" height="2" /><rect x="8" y="13" width="2" height="2" /></>,
  'i-chat': <><rect x="2" y="3" width="12" height="8" /><rect x="4" y="11" width="6" height="3" /><rect x="4" y="5" width="8" height="1" fill="#0b0210" /><rect x="4" y="7" width="6" height="1" fill="#0b0210" /></>,
  'i-heart': <><rect x="3" y="3" width="4" height="2" /><rect x="9" y="3" width="4" height="2" /><rect x="2" y="5" width="12" height="3" /><rect x="3" y="8" width="10" height="2" /><rect x="5" y="10" width="6" height="2" /><rect x="7" y="12" width="2" height="1" /></>,
  'i-globe': <><rect x="4" y="2" width="8" height="2" /><rect x="2" y="4" width="12" height="8" /><rect x="4" y="12" width="8" height="2" /><rect x="4" y="4" width="2" height="4" fill="#0b0210" /><rect x="10" y="4" width="2" height="4" fill="#0b0210" /><rect x="6" y="6" width="4" height="4" fill="#0b0210" /></>,
  'i-coin': <><rect x="6" y="2" width="4" height="2" /><rect x="4" y="4" width="8" height="2" /><rect x="3" y="6" width="10" height="4" /><rect x="4" y="10" width="8" height="2" /><rect x="6" y="12" width="4" height="2" /></>,
  'i-clock': <><rect x="6" y="2" width="4" height="2" /><rect x="4" y="6" width="8" height="6" /><rect x="6" y="8" width="2" height="4" fill="#0b0210" /></>,
};

function Icon({ id, cls = '' }: { id: string; cls?: string }) {
  return <svg className={`ico ${cls}`} viewBox="0 0 16 16" aria-hidden="true">{ICONS[id]}</svg>;
}

/* ---------- reveal при скролле ---------- */
function useReveal(dep: unknown) {
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.about-page .rv').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

/* ---------- счётчик статистики ---------- */
function StatCounter({ to }: { to: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setVal(to); return; }

    let raf = 0, t0 = 0, settled = false;
    const finish = () => { settled = true; setVal(to); };
    // Страховка: если IntersectionObserver/rAF не отработали (headless, фоновая
    // вкладка) — конечное значение всё равно появится.
    const guard = window.setTimeout(finish, 1200);

    const io = new IntersectionObserver((entries) => {
      if (settled || !entries[0]?.isIntersecting) return;
      io.disconnect();
      const step = (ts: number) => {
        if (settled) return;
        if (!t0) t0 = ts;
        const p = Math.min((ts - t0) / 1100, 1);
        setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
        else finish();
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);

    return () => { io.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(guard); };
  }, [to]);
  return <div className="num" ref={ref}>{val}</div>;
}

/* ---------- слайдер новинок ---------- */
function NewSlider({ slides }: { slides: AboutSlide[] }) {
  const [cur, setCur] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);
  const count = slides.length;

  const go = (n: number) => setCur(((n % count) + count) % count);

  useEffect(() => {
    setCur(0);
  }, [count]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || paused || count < 2) return;
    timer.current = window.setInterval(() => setCur((c) => (c + 1) % count), 6000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [paused, count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setCur((c) => (c - 1 + count) % count);
      if (e.key === 'ArrowRight') setCur((c) => (c + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  const touchX = useRef<number | null>(null);

  return (
    <section
      className="slider"
      aria-label="Новинки игр"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="slides"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true); }}
        onTouchEnd={(e) => {
          if (touchX.current !== null) {
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 44) setCur((c) => (dx < 0 ? (c + 1) % count : (c - 1 + count) % count));
          }
          touchX.current = null;
          setPaused(false);
        }}
      >
        {slides.map((g, i) => (
          <article key={`${g.id}-${i}`} className={`slide${i === cur ? ' on' : ''}`}>
            <div className="bg" style={{ backgroundImage: `url('${g.cover}')` }} />
            <div className="veil" />
            {g.adult && <span className="adult-mark">18+ ADULT</span>}
            <div className="content">
              <span className="s-kicker">Новинка · #{i + 1} из {count}</span>
              <div className="s-meta">
                <span className="m-chip year">{g.year}</span>
                <span className="m-chip age">{g.age}</span>
                {g.tags.map((t) => <span className="m-chip" key={t}>{t}</span>)}
              </div>
              <h3>{g.title}</h3>
              <p className="s-desc">{g.desc}</p>
              <div className="s-cta">
                <Link className="btn solid" to={`/games/${g.id}`}>Подробнее</Link>
                <Link className="btn" to="/store">В каталог</Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      <button className="arrow prev" type="button" aria-label="Предыдущая игра" onClick={() => go(cur - 1)}>‹</button>
      <button className="arrow next" type="button" aria-label="Следующая игра" onClick={() => go(cur + 1)}>›</button>
      <div className="dots" role="tablist" aria-label="Слайды">
        {slides.map((g, i) => (
          <button
            key={`d-${g.id}-${i}`}
            className={`dot${i === cur ? ' on' : ''}`}
            type="button"
            aria-label={`Слайд ${i + 1}: ${g.title}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </section>
  );
}

/* ---------- карточка с 3D-наклоном (как TiltCard в библиотеке) ---------- */
function TiltCard({ card }: { card: AboutCard }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const canHover = useMemo(
    () => typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!canHover) return;
    const el = e.currentTarget;
    const inner = innerRef.current;
    const rect = el.getBoundingClientRect();
    if (!inner || !rect.width || !rect.height) return;
    const dx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const dy = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    inner.style.transform = `rotateX(${(-dy * 8).toFixed(2)}deg) rotateY(${(dx * 5).toFixed(2)}deg)`;
    inner.style.filter = 'brightness(1.07)';
  };
  const onLeave = () => {
    const inner = innerRef.current;
    if (inner) { inner.style.transform = 'rotateX(0deg) rotateY(0deg)'; inner.style.filter = 'none'; }
  };
  return (
    <Link className="g-card rv" to={`/games/${card.id}`} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="g-tilt" ref={innerRef}>
        <div className="shot">
          <span className={`age${card.age === '18+' ? ' ad' : ''}`}>{card.age}</span>
          <img src={card.img} alt={card.title} loading="lazy" />
        </div>
        <div className="meta">
          <span className="t">{card.title}</span>
          <span className="go">Подробнее →</span>
        </div>
      </div>
    </Link>
  );
}

/* ---------- секции контента ---------- */
const FEATS: { icon: string; h: string; p: string }[] = [
  { icon: 'i-monitor', h: 'Каталог игр', p: 'Более 250 игр с фильтрами по возрасту, тегам и языку, поиском и шестью сортировками. Превью со скриншотами и трейлером при наведении.' },
  { icon: 'i-box', h: 'Библиотека', p: 'Коллекции до 50 игр, витрины профиля, топ-10 избранного и история установок — вся коллекция под рукой.' },
  { icon: 'i-chat', h: 'Чат и звонки', p: 'Личные и групповые чаты с вложениями, голосовые и видеозвонки, демонстрация экрана — прямо в лаунчере.' },
  { icon: 'i-users', h: 'Сообщества', p: 'Обсуждения, посты с картинками и мастерская. Друзья, заявки и статусы онлайн — всё в одном месте.' },
  { icon: 'i-heart', h: 'Стиль профиля', p: 'Рамки аватаров, темы, баннеры, титулы и значки с редкостями. Профиль выглядит так, как хочется тебе.' },
  { icon: 'i-cart', h: 'Экономика', p: 'Внутренняя валюта, магазин кастомизации и ежедневный бонус. Купленное остаётся навсегда.' },
  { icon: 'i-shield', h: 'Безопасность', p: 'Двухфакторная аутентификация, привязка телефона и подтверждение входа с мобильного — как Steam Guard.' },
  { icon: 'i-globe', h: 'Три платформы', p: 'Десктоп для Windows, веб-версия в браузере и мобильное приложение — один аккаунт везде.' },
];

const DETAILS: { icon: string; h: string; items: [string, string][] }[] = [
  {
    icon: 'i-monitor', h: 'Игры',
    items: [
      ['Каталог 250+ игр', 'фильтры, поиск, сортировки, возрастные рейтинги'],
      ['Превью при наведении', 'скриншоты и трейлер без входа в карточку'],
      ['Библиотека и коллекции', 'коллекции, избранное, витрины профиля'],
      ['Загрузка и запуск игр', 'торренты и прямые ссылки с менеджером прогресса (десктоп)'],
      ['Рекомендации и новости', 'подборки по интересам и лента обновлений'],
    ],
  },
  {
    icon: 'i-chat', h: 'Общение',
    items: [
      ['Чаты', 'личные и групповые, вложения, медиа-галерея, закрепления'],
      ['Звонки', 'голос и видео 1-на-1, групповые схемы'],
      ['Демонстрация экрана', 'показывай игру или рабочий стол собеседнику'],
      ['Сообщества', 'обсуждения, посты, мастерская, инвайты'],
      ['Друзья', 'заявки по коду, онлайн-статусы, активность'],
    ],
  },
  {
    icon: 'i-heart', h: 'Стиль и профиль',
    items: [
      ['Кастомизация', 'рамки, темы профиля и лаунчера, баннеры, титулы'],
      ['Значки достижений', 'редкости, секреты и витрина в профиле'],
      ['Уровень и опыт', 'активность, комментарии и покупки прокачивают профиль'],
      ['Магазин', 'новые предметы, фильтры и превью на персонаже'],
    ],
  },
  {
    icon: 'i-shield', h: 'Аккаунт и безопасность',
    items: [
      ['2FA', 'код из приложения-аутентификатора при входе'],
      ['Подтверждение с телефона', 'вход подтверждается в мобильном приложении'],
      ['Доверенные устройства', 'список сессий и отзыв в один клик'],
      ['Автономный режим', 'библиотека и настройки доступны без сети'],
    ],
  },
];

const PRO_ITEMS: [string, string][] = [
  ['Бейдж и подсветка ника', 'градиент виден в чате, комментариях и ленте'],
  ['Эксклюзивная косметика', 'рамки, темы и баннер только для подписчиков'],
  ['Двойной ежедневный бонус', '+500 плодов вместо +250'],
  ['Ежемесячная выплата', '150–300 плодов изгнания каждый месяц'],
  ['Крупные лимиты', '30 групп, 50 участников, 50 подборок, видео в чате до 200 МБ'],
  ['Ранний доступ и приоритет', 'новые функции и обращения в поддержку первыми'],
];

const FAQ: [string, string][] = [
  ['Лаунчер бесплатный?', 'Да. Все игры в каталоге бесплатны, подписка Lustre Pro покупает статус, косметику и удобство — не доступ к играм.'],
  ['Нужна ли регистрация?', 'Для входа — да: email и пароль, плюс можно войти через Google, GitHub, Steam, itch.io или Telegram. Один аккаунт работает на всех платформах.'],
  ['Как обновляется лаунчер?', 'Автоматически: при запуске он сам скачивает новую версию и перезапускается. Ручные действия не нужны.'],
  ['Что такое плоды изгнания?', 'Внутренняя валюта Lustre: за неё берут рамки, темы, аватары и баннеры в магазине. Начисляется за активность, а с подпиской возвращается ещё и ежемесячной выплатой.'],
  ['Работает на Mac и Linux?', 'Сейчас десктоп-сборка — для Windows. Веб-версия работает в любом современном браузере на любой ОС, а для Android есть мобильное приложение (файл APK).'],
];

const PLAT_ROWS: [string, boolean, boolean, boolean][] = [
  ['Каталог, библиотека, профиль', true, true, true],
  ['Чат и сообщества', true, true, true],
  ['Звонки и демонстрация экрана', true, true, false],
  ['Загрузка и запуск игр', true, false, false],
  ['Магазин и подписка Pro', true, true, true],
  ['Push-уведомления', false, false, true],
  ['Подтверждение входа с телефона', false, false, true],
];

export default function AboutPage() {
  const [data, setData] = useState<{
    slides: AboutSlide[]; grid: AboutCard[]; marquee: AboutCard[];
    total: number; adultCount: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    loadLive()
      .then((live) => { if (alive) setData(live); })
      .catch(() => {
        if (alive) setData({
          slides: [...FALLBACK_SLIDES_CLEAN, ...FALLBACK_SLIDES_ADULT],
          grid: FALLBACK_GRID,
          marquee: FALLBACK_MARQUEE,
          total: 262,
          adultCount: 128,
        });
      });
    return () => { alive = false; };
  }, []);

  useReveal(data);

  const stats = data
    ? [
        { to: data.total || 262, label: 'игр в каталоге' },
        { to: data.adultCount || 128, label: 'игр 18+' },
        { to: 3, label: 'платформы' },
      ]
    : null;

  return (
    <div className="about-page bg-[#060309] min-h-screen w-full overflow-x-hidden">
      <div className="max-w-[1240px] mx-auto px-4 pb-10">

        {/* ==================== HERO ==================== */}
        <section className="hero rv">
          <div className="sweep" />
          <div className="hero-grid">
            <div className="hero-main">
              <span className="kicker"><span className="dot" /> Lustre Launcher · Одно приложение</span>
              <h1>ТВОИ ИГРЫ.<br /><span className="grad-text">ТВОЁ ОБЩЕНИЕ. ТВОЙ СТИЛЬ.</span></h1>
              <p className="sub">
                Лаунчер для игр с каталогом, библиотекой, чатом, голосовыми звонками и кастомизацией профиля.
                Бесплатный доступ ко всем играм — деньги покупают статус, комфорт и стиль.
              </p>

              <div className="cta-row">
                <a className="btn solid big shine" href={DOWNLOAD_WINDOWS_URL}>
                  <Icon id="i-download" cls="sm" /> Скачать десктоп
                </a>
                <a className="btn big" href={DOWNLOAD_ANDROID_URL}>
                  <Icon id="i-phone" cls="sm" /> Скачать для Android
                </a>
              </div>

              <div className="hero-chips">
                <span className="hero-chip"><Icon id="i-monitor" cls="sm" /> 250+ игр в каталоге</span>
                <span className="hero-chip"><Icon id="i-chat" cls="sm" /> чат и звонки</span>
                <span className="hero-chip"><Icon id="i-heart" cls="sm" /> кастомизация профиля</span>
                <span className="hero-chip"><Icon id="i-bolt" cls="sm" /> автообновление</span>
              </div>
            </div>

            <div className="hero-art" aria-hidden="true">
              <figure className="art-card c1">
                <img src={S + '1145350/91ac334a2c137d08968ccc0bc474a02579602100/header.jpg?t=1779901265'} alt="" loading="lazy" />
                <figcaption className="cap">Hades II</figcaption>
              </figure>
              <figure className="art-card c2">
                <img src={S + '1623730/6912f19c43a95ff5fe514eedd35e68bf12335459/header.jpg?t=1790336367'} alt="" loading="lazy" />
                <figcaption className="cap">Palworld</figcaption>
              </figure>
              <figure className="art-card c3">
                <img src={S + '3241660/1ea445e044a2d5b09cfa8291350b63ebed6e5741/header.jpg?t=1778158882'} alt="" loading="lazy" />
                <figcaption className="cap">R.E.P.O.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ==================== СТАТИСТИКА ==================== */}
        <div className="stats">
          {(stats || [{ to: 0, label: 'игр в каталоге' }, { to: 0, label: 'игр 18+' }, { to: 0, label: 'платформы' }]).map((s) => (
            <div className="stat rv" key={s.label}>
              <StatCounter to={s.to} />
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ==================== НОВИНКИ (СЛАЙДЕР) ==================== */}
        <div className="sec-title">Новинки по дате выхода</div>
        {data && <NewSlider slides={data.slides} />}
        {!data && <section className="slider"><div className="slides"><article className="slide on"><div className="content"><span className="s-kicker">Загрузка…</span></div></article></div></section>}

        {/* ==================== ПОЧЕМУ LUSTRE ==================== */}
        <div className="sec-title">Почему Lustre</div>
        <div className="feat-grid">
          {FEATS.map((f) => (
            <div className="feat rv" key={f.h}>
              <div className="glyph"><Icon id={f.icon} cls="lg" /></div>
              <h3>{f.h}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>

        {/* ==================== ЧТО ИГРАЮТ ==================== */}
        <div className="sec-title">Что играют</div>
        <div className="game-grid">
          {(data?.grid || FALLBACK_GRID).map((c) => <TiltCard card={c} key={c.id} />)}
        </div>

        {/* ==================== КАТАЛОГ В ДВИЖЕНИИ ==================== */}
        <div className="sec-title">Каталог в движении</div>
        <div className="marquee rv" aria-hidden="true">
          <div className="track">
            {[...(data?.marquee || FALLBACK_MARQUEE), ...(data?.marquee || FALLBACK_MARQUEE)].map((c, i) => (
              <Link className="mq-item" to={`/games/${c.id}`} title={c.title} key={`${c.id}-${i}`}>
                <img src={c.img} alt="" loading="lazy" />
              </Link>
            ))}
          </div>
        </div>

        {/* ==================== ЧТО ВНУТРИ ==================== */}
        <div className="sec-title">Что внутри</div>
        <div className="detail">
          {DETAILS.map((d) => (
            <div className="d-box rv" key={d.h}>
              <h3><Icon id={d.icon} /> {d.h}</h3>
              <ul>
                {d.items.map(([b, hint]) => (
                  <li key={b}>
                    <Icon id="i-check" cls="sm" />
                    <span><b>{b}</b> — <span className="hint">{hint}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="d-box pro-box rv">
            <span className="tag">Lustre Pro</span>
            <h3><Icon id="i-coin" /> Подписка Pro</h3>
            <ul>
              {PRO_ITEMS.map(([b, hint]) => (
                <li key={b}>
                  <Icon id="i-check" cls="sm" />
                  <span><b>{b}</b> — <span className="hint">{hint}</span></span>
                </li>
              ))}
            </ul>
            <p className="meta">От 399 ₽/мес · отмена в любой момент</p>
          </div>
        </div>

        {/* ==================== ГДЕ ДОСТУПНО ==================== */}
        <div className="sec-title">Где доступно</div>
        <div className="table-scroll rv">
          <table className="plat">
            <thead>
              <tr>
                <th>Возможность</th>
                <th className="us">Десктоп (Windows)</th>
                <th>Веб-версия</th>
                <th>Мобильное</th>
              </tr>
            </thead>
            <tbody>
              {PLAT_ROWS.map(([name, d, w, m]) => (
                <tr key={name}>
                  <td className="f">{name}</td>
                  {[d, w, m].map((v, i) => (
                    <td key={i} className={v ? 'yes' : 'no'}>
                      {v ? <Icon id="i-check" cls="sm" /> : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta" style={{ marginTop: 12, fontFamily: 'var(--f-term)', fontSize: 15, color: 'var(--muted-2)' }}>
            Веб-версия: <a href="https://lustrehub.pro" style={{ color: 'var(--pink)' }}>lustrehub.pro</a> — работает в браузере, без установки.
          </p>
        </div>

        {/* ==================== СКАЧАТЬ ==================== */}
        <div className="sec-title">Скачать</div>
        <div className="dl-grid">
          <div className="dl rv">
            <span className="os"><Icon id="i-monitor" cls="sm" /> Windows · десктоп-лаунчер</span>
            <h3>Lustre для Windows</h3>
            <p>Полная версия лаунчера: каталог, загрузка и запуск игр, звонки, оверлей и вся кастомизация. Устанавливается один раз — дальше обновляется автоматически.</p>
            <span className="meta">Всегда актуальная версия · весит около 135 МБ</span>
            <a className="btn solid shine" href={DOWNLOAD_WINDOWS_URL}>
              <Icon id="i-download" cls="sm" /> Скачать лаунчер
            </a>
          </div>
          <div className="dl rv">
            <span className="os"><Icon id="i-phone" cls="sm" /> Android · мобильное приложение</span>
            <h3>Lustre для телефона</h3>
            <p>Пуши о сообщениях и звонках, подтверждение входа в аккаунт и доступ к чатам с кармана. Входи в аккаунт и следи за уведомлениями где угодно.</p>
            <span className="meta">Файл APK · при установке разрешите установку из этого источника</span>
            <a className="btn solid shine" href={DOWNLOAD_ANDROID_URL}>
              <Icon id="i-download" cls="sm" /> Скачать APK
            </a>
          </div>
        </div>

        {/* ==================== FAQ ==================== */}
        <div className="sec-title">Вопросы</div>
        <div className="faq rv">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q} <span className="plus">+</span></summary>
              <div className="ans">{a}</div>
            </details>
          ))}
        </div>

        {/* ==================== ФИНАЛЬНЫЙ CTA ==================== */}
        <section className="final rv">
          <h2>ХВАТИТ ЧИТАТЬ. <span className="grad-text">ПОРА ИГРАТЬ.</span></h2>
          <p>Скачай лаунчер, войди в аккаунт и забери приветственный бонус — каталог уже открыт.</p>
          <a className="btn solid big shine" href={DOWNLOAD_WINDOWS_URL}>
            <Icon id="i-download" cls="sm" /> Скачать Lustre
          </a>
        </section>

        {/* ==================== FOOTER ==================== */}
        <footer className="ab-footer">
          <div className="status">SYSTEM STATUS: <b>ONLINE</b><br />LAUNCHER · WINDOWS / WEB / ANDROID SOON</div>
          <div className="keep">KEEP GOING.EXE</div>
        </footer>
      </div>
    </div>
  );
}
