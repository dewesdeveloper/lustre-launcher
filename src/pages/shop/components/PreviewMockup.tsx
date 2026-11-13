import AvatarFrame from '../../../components/AvatarFrame';
import { PROFILE_THEMES, LAUNCHER_THEMES, isCustomThemeId, parseCustomThemeId } from '../../../components/profileThemes';
import { RARITY_COLOR } from '../constants';
import type { ShopItem } from '../../../api/shop';

/* ===== Мокап: как предмет будет выглядеть в профиле/лаунчере ===== */
export function PreviewMockup({ item, profile, username }: { item: ShopItem; profile: any; username?: string }) {
  const isImage = (p: string) => /^(https?:\/\/|data:)/i.test(p);

  if (item.type === 'theme') {
    const custom = isCustomThemeId(item.payload) ? parseCustomThemeId(item.payload) : null;
    if (item.scope === 'launcher') {
      const lt = custom || LAUNCHER_THEMES.find(x => x.id === item.payload);
      const color = lt?.accent || '#FF006E';
      const violet = lt?.violet || '#8338EC';
      return (
        <div className="relative w-full h-64 overflow-hidden border border-white/10" style={{ background: `linear-gradient(135deg, ${color}26, #0d0b13 50%, ${violet}33)` }}>
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full blur-[70px] opacity-40" style={{ background: color }} />
          <div className="absolute inset-x-10 top-7 bottom-0 rounded-t-xl bg-black/50 border border-white/10 backdrop-blur-sm flex flex-col overflow-hidden shadow-2xl">
            <div className="h-6 flex items-center gap-1.5 px-3 bg-black/50 border-b border-white/5">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="w-2 h-2 rounded-full bg-white/20" />
              <span className="w-2 h-2 rounded-full bg-white/20" />
              <span className="ml-2 text-[10px] font-black uppercase tracking-[0.3em] text-pearl/60">LustreHub</span>
            </div>
            <div className="flex-1 flex">
              <div className="w-16 bg-black/30 border-r border-white/5 p-2 space-y-2">
                {[0, 1, 2, 3].map(i => <div key={i} className={`h-2.5 rounded ${i === 0 ? '' : 'bg-white/10'}`} style={i === 0 ? { background: `${color}66` } : undefined} />)}
              </div>
              <div className="flex-1 p-3 space-y-2.5">
                <div className="h-14 rounded-lg border border-white/10" style={{ background: `linear-gradient(120deg, ${color}30, transparent 70%)` }} />
                <div className="flex gap-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex-1 h-10 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center">
                      <span className="w-4 h-4 rounded" style={{ background: i === 0 ? color : i === 1 ? `${violet}66` : 'rgba(255,255,255,0.12)' }} />
                    </div>
                  ))}
                </div>
                <div className="h-2 w-2/3 rounded bg-white/10" />
              </div>
            </div>
          </div>
          <span className="absolute top-2 right-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/70">Так это выглядит в лаунчере</span>
        </div>
      );
    }
    const pt = custom
      ? { color: custom.accent, ambient: '' }
      : PROFILE_THEMES.find(x => x.id === item.payload);
    return (
      <div className="relative w-full h-64 overflow-hidden border border-white/10 bg-[#0d0b13]">
        <div
          className={`absolute inset-0 ${custom ? '' : `bg-linear-to-b ${pt?.ambient || 'from-[#FF006E]/20 via-black to-black'}`}`}
          style={custom ? { background: `linear-gradient(to bottom, ${custom.accent}33, #000 60%)` } : undefined}
        />
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-72 h-36 rounded-full blur-[60px] opacity-30" style={{ background: pt?.color || '#FF006E' }} />
        <div className="absolute bottom-0 inset-x-0 p-4 flex items-end gap-3.5 bg-linear-to-t from-black/50 to-transparent">
          <AvatarFrame avatarUrl={profile?.avatar_url} frameId={profile?.frame_id} frameUrl={profile?.avatar_frame_url} size="large" className="mb-1" />
          <div className="pb-2 min-w-0">
            <p className="text-base font-black text-white truncate">{username || 'Профиль'}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> В сети
              </span>
            </div>
          </div>
          <span className="ml-auto pb-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/65 text-right shrink-0">Так это<br />выглядит в<br />профиле</span>
        </div>
      </div>
    );
  }

  if (item.type === 'tag') {
    const color = RARITY_COLOR[item.rarity] || '#9CA3AF';
    return (
      <div className="relative w-full h-64 overflow-hidden border border-white/10 bg-[#0d0b13]">
        {profile?.banner_url ? (
          <img src={profile.banner_url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover opacity-50" />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-[#2a1230] via-[#150b1e] to-[#0d0b13]" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-[#0d0b13] via-transparent to-black/20" />
        <div className="absolute bottom-0 inset-x-0 p-4 flex items-end gap-3.5">
          <AvatarFrame
            avatarUrl={profile?.avatar_url}
            frameId={profile?.frame_id}
            frameUrl={profile?.avatar_frame_url}
            size="large"
            className="mb-1"
          />
          <div className="pb-2 min-w-0">
            <p className="text-base font-black text-white truncate">{username || 'Игрок'}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border"
                style={{ color, borderColor: `${color}55`, background: `${color}1a` }}
              >
                {item.payload}
              </span>
            </div>
          </div>
          <span className="ml-auto pb-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/65 text-right shrink-0">Так будет<br />выглядеть твой<br />титул</span>
        </div>
      </div>
    );
  }

  if (item.type === 'background') {
    const media = item.payload || item.image_url;
    return (
      <div className="relative w-full h-64 overflow-hidden border border-white/10 bg-[#050407]">
        {media ? (
          item.is_video ? (
            <video src={media} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <img src={media} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
          )
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-[#2a1230] via-[#150b1e] to-[#050407]" />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at center, transparent 0%, #050407 100%)' }}
        />
        {/* мини-лаунчер поверх фона */}
        <div className="absolute inset-x-8 top-6 bottom-4 rounded-xl bg-black/45 border border-white/10 backdrop-blur-sm overflow-hidden">
          <div className="h-5 flex items-center gap-1 px-2.5 bg-black/40 border-b border-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF006E]" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="ml-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-pearl/60">LustreHub</span>
          </div>
          <div className="flex-1 flex">
            <div className="w-12 bg-black/30 border-r border-white/5 p-1.5 space-y-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-2 rounded" style={{ background: i === 0 ? '#FF006E66' : 'rgba(255,255,255,0.08)' }} />
              ))}
            </div>
            <div className="flex-1 p-2.5 space-y-2">
              <div className="h-10 rounded-lg border border-white/10 bg-white/5" />
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-1 h-6 rounded bg-white/5 border border-white/8" />
                ))}
              </div>
              <div className="h-1.5 w-1/2 rounded bg-white/10" />
            </div>
          </div>
        </div>
        {item.is_video && (
          <span className="absolute top-2 left-3 px-2 py-0.5 rounded-md bg-black/70 border border-white/15 text-[10px] font-black uppercase tracking-[0.25em] text-white/70">
            Видео-фон
          </span>
        )}
        <span className="absolute top-2 right-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/70">
          Так это выглядит в лаунчере
        </span>
      </div>
    );
  }

  const shownAvatar = item.type === 'avatar' ? item.payload : profile?.avatar_url;  const shownFrameUrl = item.type === 'frame' && isImage(item.payload) ? item.payload : profile?.avatar_frame_url;
  const shownFrameId = item.type === 'frame' && !isImage(item.payload) ? item.payload : profile?.frame_id;
  const shownBanner = item.type === 'banner' ? item.image_url : profile?.banner_url;

  return (
    <div className="relative w-full h-64 overflow-hidden border border-white/10 bg-[#0d0b13]">
      {shownBanner ? (
        <img src={shownBanner} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-[#2a1230] via-[#150b1e] to-[#0d0b13]" />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-[#0d0b13] via-transparent to-black/20" />
      <div className="absolute bottom-0 inset-x-0 p-4 flex items-end gap-3.5">
        <AvatarFrame
          avatarUrl={shownAvatar}
          frameId={shownFrameUrl ? undefined : shownFrameId}
          frameUrl={shownFrameUrl}
          size="large"
          className="mb-1"
        />
        <div className="pb-2 min-w-0">
          <p className="text-base font-black text-white truncate">{username || 'Профиль'}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-black uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> В сети
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-pearl/70">Профиль</span>
          </div>
        </div>
        <span className="ml-auto pb-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/65 text-right shrink-0">Так это<br />выглядит в<br />профиле</span>
      </div>
    </div>
  );
}
