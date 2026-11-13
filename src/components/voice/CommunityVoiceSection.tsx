import { useEffect, useState } from 'react';
import { watchCommunity } from '../../api/voiceChannel';
import { VoiceChannelsPanel } from './VoiceChannelsPanel';
import { VoiceRoomView } from './VoiceRoomView';
import { useVoice } from './useVoice';

/** Вкладка «Голосовые каналы» сообщества: список каналов слева, комната справа (как сервер в Discord). */
export default function CommunityVoiceSection({ communityId, communityName, ownerId, initialChannelId }: {
  communityId: number;
  communityName: string;
  ownerId: number;
  initialChannelId?: number | null;
}) {
  const v = useVoice();
  const com = v.communities[communityId];
  const [selected, setSelected] = useState<number | null>(initialChannelId ?? null);

  useEffect(() => watchCommunity(communityId), [communityId]);

  // по умолчанию — канал, где вы сидите, иначе первый
  useEffect(() => {
    if (!com?.channels.length) return;
    if (selected && com.channels.some((c) => c.id === selected)) return;
    const mine = v.communityId === communityId ? v.channelId : null;
    setSelected(mine ?? com.channels[0].id);
  }, [com?.channels, selected, v.channelId, v.communityId, communityId]);

  // перенесли модератором — показываем новый канал
  useEffect(() => {
    if (v.communityId === communityId && v.channelId) setSelected(v.channelId);
  }, [v.channelId, v.communityId, communityId]);

  const channel = com?.channels.find((c) => c.id === selected) ?? null;

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[460px]">
      <div className="tl-panel !p-0 flex flex-col min-h-0">
        <VoiceChannelsPanel
          communityId={communityId}
          communityName={communityName}
          ownerId={ownerId}
          selectedId={selected}
          onSelect={setSelected}
        />
      </div>
      <div className="min-h-0">
        {channel ? (
          <VoiceRoomView communityId={communityId} communityName={communityName} channel={channel} />
        ) : (
          <div className="tl-panel h-full flex items-center justify-center">
            <p className="tl-head text-[10px] uppercase tracking-[0.2em] tl-muted">{com?.loaded ? 'Нет голосовых каналов' : 'Загрузка…'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
