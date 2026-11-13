import type { Variants } from 'framer-motion';

/** Выпадающее меню раскрывается по вертикали, пункты появляются по очереди */
export const wrapperVariants: Variants = {
  open: { scaleY: 1, opacity: 1, transition: { when: 'beforeChildren', staggerChildren: 0.06, duration: 0.2, ease: 'easeOut' } },
  closed: { scaleY: 0, opacity: 0, transition: { when: 'afterChildren', staggerChildren: 0.04, duration: 0.15, ease: 'easeIn' } },
};

export const itemVariants: Variants = {
  open: { opacity: 1, y: 0, transition: { duration: 0.15 } },
  closed: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

/** Стрелка у кнопки меню переворачивается при открытии */
export const iconVariants: Variants = {
  open: { rotate: 180 },
  closed: { rotate: 0 },
};
