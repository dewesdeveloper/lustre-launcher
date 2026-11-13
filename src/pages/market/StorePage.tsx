import { StoreSubNav } from './StoreSubNav';
import { GameCatalog } from './GameCatalog';

/** Магазин игр: строка навигации магазина, служебная бегущая строка и каталог. */
export const StorePage = () => (
  <div className="animate-in fade-in pb-10 duration-500">
    <StoreSubNav />
    <main className="custom-scrollbar flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1240px] px-6 pt-8">
        <div className="tl-ticker">
          <span className="live">// STORE MODULE</span>
          <span>game catalogue</span>
          <span>· sync: ok</span>
        </div>
        <GameCatalog />
      </div>
    </main>
  </div>
);
