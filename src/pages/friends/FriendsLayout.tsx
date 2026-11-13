import { Outlet } from 'react-router-dom';

// Обёртка раздела «Друзья»: без левого меню и без собственного фона —
// страница рисует собственные панели, а под ней
// остаётся видна общая сетка лаунчера (ThemeDecor / LauncherBackdrop).
export default function FriendsLayout() {
  return (
    <div className="h-full text-pearl">
      <main className="h-full overflow-y-auto custom-scrollbar p-8">
        <Outlet />
      </main>
    </div>
  );
}
