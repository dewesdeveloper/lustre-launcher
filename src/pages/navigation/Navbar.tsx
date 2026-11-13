import { NavbarTop } from './NavbarTop';
import { NavbarBottom } from './NavbarBottom';

/** Шапка приложения: верхняя полоса (логотип, профиль, окно) и строка разделов. */
export const Navbar = () => (
  <header className="left-0 z-[100] flex w-full flex-col shadow-2xl">
    <NavbarTop />
    <NavbarBottom />
  </header>
);
