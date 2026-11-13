// Мост «голосовой канал ↔ звонки»: в LiveKit одна комната на окно, поэтому, как в Discord,
// начало звонка отключает голосовой канал. Отдельный модуль — без циклических импортов
// между api/call.ts, api/groupCall.ts и api/voiceChannel.ts.

let leaveHook: (() => void) | null = null;

/** voiceChannel регистрирует, как выйти из канала. */
export function registerVoiceLeave(fn: () => void) { leaveHook = fn; }

/** Звонки вызывают перед стартом/принятием: выходим из голосового канала. */
export function leaveVoiceForCall() { leaveHook?.(); }

