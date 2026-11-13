import { useSyncExternalStore } from 'react';
import { getVoiceState, subscribeVoice, type VoiceState } from '../../api/voiceChannel';

/** Состояние голосовых каналов (стор api/voiceChannel) в React. */
export function useVoice(): VoiceState {
  return useSyncExternalStore(subscribeVoice, getVoiceState, getVoiceState);
}
