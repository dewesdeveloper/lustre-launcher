import type { Community, CommunityGame } from '../../api/community';

/** Вкладки страницы сообщества */
export type Tab = 'images' | 'discussions' | 'voice';

/** Порядок форумов на странице обсуждений */
export type SortOption = 'popular' | 'discussions' | 'alpha';

/** Форум игры: её сообщества и сводные цифры по ним */
export type GameForum = {
  game: CommunityGame;
  communities: Community[];
  communityCount: number;
  /** обсуждений во всех сообществах игры */
  discussions: number;
  /** участников во всех сообществах игры */
  members: number;
};
