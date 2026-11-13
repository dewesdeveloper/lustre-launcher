import type { SortOption } from './types';

const SORT_LABEL: Record<SortOption, string> = {
  popular: 'По популярности',
  discussions: 'По обсуждениям',
  alpha: 'По алфавиту',
};

/** Варианты сортировки форумов в порядке показа в меню */
export const sortOptions = (Object.keys(SORT_LABEL) as SortOption[]).map((id) => ({ id, label: SORT_LABEL[id] }));
