import { Image as ImageIcon, Frame, Wallpaper, Palette as PaletteIcon, Tags, MonitorPlay, LayoutTemplate } from 'lucide-react';

export const TYPE_META: Record<string, { title: string; subtitle: string; label: string; icon: any }> = {
  avatar: { title: 'Аватары', subtitle: 'Подари лицу настроение', label: 'Аватар', icon: ImageIcon },
  frame: { title: 'Рамки аватара', subtitle: 'Рамка с характером — вокруг твоего аватара', label: 'Рамка аватара', icon: Frame },
  banner: { title: 'Фоны профиля', subtitle: 'Пусть профиль отражает твои вкусы', label: 'Фон профиля', icon: Wallpaper },
  theme: { title: 'Темы', subtitle: 'Перекрась весь лаунчер — или только профиль', label: 'Тема', icon: PaletteIcon },
  tag: { title: 'Титулы', subtitle: 'Подчеркни свой статус в профиле', label: 'Титул', icon: Tags },
  background: { title: 'Фоны лаунчера', subtitle: 'Изображение или видео вместо фоновой сетки', label: 'Фон лаунчера', icon: MonitorPlay },
  miniprofile_bg: { title: 'Фоны минипрофиля', subtitle: 'Фон карточки, которую видят при наведении на аватар', label: 'Фон минипрофиля', icon: LayoutTemplate },
};

export const RARITY_COLOR: Record<string, string> = {
  common: '#94A3B8',
  rare: '#22D3EE',
  epic: '#8B5CF6',
  legendary: '#EAB308',
};

export const RARITY_LABEL: Record<string, string> = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
};

export const RARITY_WEIGHT: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export const DESCRIPTIONS: Record<string, string> = {
  avatar: 'Этот аватар появится в твоём профиле, в чате и в списках друзей.',
  frame: 'Рамка обрамляет твой аватар по всему лаунчеру — её увидят все, кто откроет профиль.',
  banner: 'Фон украсит шапку твоего профиля — его видят все, кто его откроет.',
  theme: 'Тема перекрасит лаунчер: акценты, свечения и фон интерфейса.',
  tag: 'Титул показывается в шапке твоего профиля рядом с ником. Можно носить до 4 титулов из магазина и 1 свой.',
  miniprofile_bg: 'Фон появляется в карточке минипрофиля, которую видят при наведении на аватар в чате, комментариях и друзьях.',
  background: 'Фон заменяет фоновую сетку лаунчера. Изображение или видео — настраивается масштаб, размытие, прозрачность и смещение.',
};

export const DESCRIPTIONS_THEME: Record<string, string> = {
  launcher: 'Глобальная тема: весь лаунчер перекрасится — акценты, свечения, фон. Действует в каждом окне.',
  profile: 'Тема профиля: изменит оформление твоей страницы профиля, лаунчер останется прежним.',
};

export const SORTS = [
  { id: 'new', label: 'Сначала новинки' },
  { id: 'price_asc', label: 'Сначала дешёвые' },
  { id: 'price_desc', label: 'Сначала дорогие' },
  { id: 'rarity', label: 'По редкости' },
  { id: 'name', label: 'По названию' },
];

export const nf = (n: number) => n.toLocaleString('ru-RU');
