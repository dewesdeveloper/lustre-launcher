import { useSyncExternalStore } from 'react';
import api from './index';
import { onChatEvent } from './chat';
import type { GroupCallParticipant } from './groupCall';

/** Идущий звонок группы: виден всем её участникам, даже если им не звонили. */
export interface ActiveGroupCall {
  call_id: string;
  group_id: number;
  started_at: string;
  participants: GroupCallParticipant[];
}

let calls = new Map<number, ActiveGroupCall>();
const listeners = new Set<() => void>();
let offChat: (() => void) | null = null;
// Событие пришло, пока шёл запрос, — его ответ уже устарел
let eventSeq = 0;

function publish(next: Map<number, ActiveGroupCall>) {
  calls = next;
  listeners.forEach((l) => l());
}

async function refresh() {
  const seq = eventSeq;
  try {
    const res = await api.get('/groups/active-calls');
    if (!offChat) return;
    if (seq !== eventSeq) { void refresh(); return; }
    const list: ActiveGroupCall[] = res.data?.calls ?? [];
    publish(new Map(list.map((c) => [c.group_id, c])));
  } catch { /* покажем при следующем обновлении */ }
}

function attach() {
  offChat = onChatEvent((data: any) => {
    if (data.type === '__open') { void refresh(); return; }
    if (data.type !== 'group.call.state') return;
    eventSeq++;
    const next = new Map(calls);
    if (data.active && data.call) next.set(data.group_id, data.call);
    else next.delete(data.group_id);
    publish(next);
  });
  void refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!offChat) attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      offChat?.();
      offChat = null;
      calls = new Map();
    }
  };
}

/** Идущий звонок группы; null — звонка нет (или это не группа). */
export function useGroupActiveCall(groupId: number | null): ActiveGroupCall | null {
  return useSyncExternalStore(subscribe, () => (groupId ? calls.get(groupId) ?? null : null));
}
