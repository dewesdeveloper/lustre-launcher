/** Роли: user | moderator | manager | admin (выдаются в БД). */
export type Role = 'user' | 'moderator' | 'manager' | 'admin';

/** Модерация контента — удаление чужих комментариев, отзывов, обсуждений, изображений
 *  и сообществ: отдельная роль moderator, а также менеджеры и администраторы. */
export function canModerate(role?: string | null): boolean {
  return role === 'moderator' || role === 'manager' || role === 'admin';
}
