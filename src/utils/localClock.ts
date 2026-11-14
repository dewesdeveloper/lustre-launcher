/** Местные час (0–23) и дата (ГГГГММДД) игрока: сервер не знает часовой пояс, а значку «Ночной дозор» нужна ночь по времени игрока */
export function localClock(now = new Date()): { local_hour: number; local_day: number } {
  return {
    local_hour: now.getHours(),
    local_day: now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate(),
  };
}
