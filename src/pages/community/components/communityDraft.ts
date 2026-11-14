// Черновик сообщества для формы создания и его ограничения (как на сервере)
import type { CommunityFormat } from '../../../api/community';

/** Черновик нового сообщества */
export type CommunityDraft = {
  name: string;
  description: string;
  coverUrl: string;
  format: CommunityFormat | null;
  gameId: number | null;
  themeId: number | null;
  isPrivate: boolean;
};

export const EMPTY_DRAFT: CommunityDraft = { name: '', description: '', coverUrl: '', format: null, gameId: null, themeId: null, isPrivate: false };

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 1000;
