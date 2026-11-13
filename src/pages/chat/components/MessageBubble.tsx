import { memo, useState } from 'react';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Reply, SmilePlus, FileText, Download, Play, Check,
} from 'lucide-react';
import type { Msg } from '../model';
import { callTitle, fmtClock, fmtDuration, fmtBytes, msgPreview, nameColor } from '../model';
import { ChatAvatar, DeliveryMark, RichText, isEmojiOnly } from './ui';
import { QUICK_REACTIONS } from '../../../api/chat';

export interface BubbleCtx {
  myId: number;
  isGroup: boolean;
  selecting: boolean;
  highlight?: string;
  senderName: (id: number) => string;
  senderAvatar: (id: number) => string | undefined;
  findMsg: (id: number) => Msg | undefined;
  isRead: (m: Msg) => boolean;
  onJump: (id: number) => void;
  onReply: (m: Msg) => void;
  onReact: (m: Msg, emoji: string) => void;
  onContext: (m: Msg, x: number, y: number) => void;
  onToggleSelect: (id: number) => void;
  onOpenMedia: (m: Msg) => void;
  onCallBack: () => void;
  onOpenProfile: (userId: number) => void;
}

function hasTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && sel.toString().length > 0;
}

interface Props {
  m: Msg;
  first: boolean;
  last: boolean;
  selected: boolean;
  flash: boolean;
  ctx: BubbleCtx;
}

/** Одно сообщение ленты: пузырь, медиа, цитата, реакции, мета; действия по наведению. */
export const MessageBubble = memo(function MessageBubble({ m, first, last, selected, flash, ctx }: Props) {
  const mine = m.sender_id === ctx.myId;
  const deleted = !!m.deleted_at;
  const [picker, setPicker] = useState(false);
  const showAvatarCol = ctx.isGroup && !mine;

  const clickRow = () => {
    if (ctx.selecting && !deleted && m.id > 0) ctx.onToggleSelect(m.id);
  };

  // ---- служебная запись звонка ----
  if (m.kind === 'call') {
    const outgoing = mine;
    const missed = m.call_status === 'missed' || m.call_status === 'declined' || m.call_status === 'canceled';
    const Icon = ctx.isGroup ? Phone : missed && !outgoing ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
    return (
      <div
        data-mid={m.id}
        onClick={clickRow}
        className={`lc-row relative flex items-end gap-2 pr-4 ${ctx.selecting ? 'pl-12 cursor-pointer' : 'pl-4'} ${last ? 'mb-2' : 'mb-0.5'} ${mine ? 'justify-end' : 'justify-start'} ${flash ? 'flash' : ''} ${selected ? 'bg-[rgb(var(--accent-rgb)/.08)]' : ''}`}
      >
        {ctx.selecting && <SelectBox on={selected} />}
        {showAvatarCol && <span className="w-[34px] shrink-0" />}
        <button
          type="button"
          onClick={(e) => { if (ctx.selecting) return; e.stopPropagation(); if (!ctx.isGroup) ctx.onCallBack(); }}
          onContextMenu={(e) => { e.preventDefault(); ctx.onContext(m, e.clientX, e.clientY); }}
          title={ctx.isGroup ? undefined : 'Позвонить снова'}
          className={`lc-bubble ${mine ? 'out' : 'in'} ${last ? 'tail' : ''} ${selected ? 'selected' : ''} flex items-center gap-3 pl-3 pr-4 py-2.5 min-w-[210px] text-left`}
        >
          <span className={`w-9 h-9 flex items-center justify-center border ${missed && !outgoing ? 'border-red-500/50 text-red-400 bg-red-500/10' : 'border-[var(--line)] text-accent bg-[rgb(var(--accent-rgb)/.1)]'}`}>
            <Icon size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block tl-head text-[10px] uppercase tracking-[0.12em] text-white">{callTitle(m.call_status, outgoing, ctx.isGroup)}</span>
            <span className="flex items-center gap-2 tl-term text-[14px] tl-muted">
              {(m.call_duration ?? 0) > 0 ? fmtDuration(m.call_duration!) : missed ? (outgoing ? 'без ответа' : 'пропущен') : ''}
              <span className="ml-auto text-pearl/65">{fmtClock(m.created_at)}</span>
            </span>
          </span>
        </button>
      </div>
    );
  }

  const isMedia = (m.kind === 'image' || m.kind === 'video') && !!m.attachment_url && !deleted;
  const emojiOnly = !deleted && !m.attachment_url && !m.reply_to_id && !m.forwarded_from && isEmojiOnly(m.content);
  const reactions = m.reactions?.filter((r) => r.count > 0) ?? [];
  const hasExtra = !!(m.content || m.reply_to_id || m.forwarded_from || reactions.length || (ctx.isGroup && !mine && first));
  const quoted = m.reply_to_id ? ctx.findMsg(m.reply_to_id) : undefined;

  const meta = (
    <span className={`inline-flex items-center gap-1 tl-term text-[12px] leading-none whitespace-nowrap ${mine ? 'text-pearl/55' : 'text-pearl/65'}`}>
      {m.edited_at && !deleted && <span className="opacity-80">изм.</span>}
      {fmtClock(m.created_at)}
      {mine && !deleted && <DeliveryMark pending={m.pending} read={ctx.isRead(m)} />}
    </span>
  );
  const metaWidth = (mine ? 66 : 44) + (m.edited_at ? 30 : 0);

  const reactionChips = reactions.length > 0 && (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {reactions.map((r) => {
        const me = r.user_ids.includes(ctx.myId);
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={(e) => { e.stopPropagation(); ctx.onReact(m, r.emoji); }}
            title={r.user_ids.map((id) => ctx.senderName(id)).join(', ')}
            className={`lc-pop flex items-center gap-1 h-6 pl-1.5 pr-2 border transition-colors ${
              me
                ? 'bg-accent/90 border-accent text-black'
                : 'bg-black/30 border-[var(--line)] text-pearl/85 hover:border-[var(--line-2)]'
            }`}
          >
            <span className="text-[14px] leading-none">{r.emoji}</span>
            <span className="tl-num text-[10px] leading-none">{r.count}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      data-mid={m.id}
      onClick={clickRow}
      onDoubleClick={(e) => {
        // двойной клик — ответ (как в Telegram Desktop); выделение слова браузером снимаем
        if (ctx.selecting || deleted || m.id <= 0) return;
        if ((e.target as HTMLElement).closest('a,button,video')) return;
        window.getSelection()?.removeAllRanges();
        ctx.onReply(m);
      }}
      onContextMenu={(e) => { if (m.id <= 0) return; e.preventDefault(); ctx.onContext(m, e.clientX, e.clientY); }}
      className={`lc-row group/row relative flex items-end gap-2 pr-4 ${ctx.selecting ? 'pl-12 cursor-pointer' : 'pl-4'} ${last ? 'mb-2' : 'mb-0.5'} ${mine ? 'justify-end' : 'justify-start'} ${flash ? 'flash' : ''} ${selected ? 'bg-[rgb(var(--accent-rgb)/.08)]' : ''}`}
    >
      {ctx.selecting && <SelectBox on={selected} />}

      {showAvatarCol && (
        <span className="w-[34px] shrink-0">
          {last && (
            <button type="button" onClick={(e) => { e.stopPropagation(); ctx.onOpenProfile(m.sender_id); }} title={ctx.senderName(m.sender_id)}>
              <ChatAvatar src={ctx.senderAvatar(m.sender_id)} size={34} />
            </button>
          )}
        </span>
      )}

      <div className={`relative min-w-0 max-w-[min(68%,560px)] flex ${mine ? 'justify-end' : 'justify-start'}`}>
      {/* действия по наведению — снаружи пузыря, со стороны, противоположной краю */}
      {!deleted && m.id > 0 && !ctx.selecting && (
        <HoverActions m={m} ctx={ctx} picker={picker} setPicker={setPicker} side={mine ? 'left' : 'right'} />
      )}

      {emojiOnly ? (
        <div className={`lc-emoji relative flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
          <span className="text-[44px] leading-[1.1] select-text">{m.content}</span>
          {reactionChips}
          <span className="mt-0.5 px-1.5 py-0.5 bg-black/50">{meta}</span>
        </div>
      ) : (
        <div
          className={`lc-bubble ${mine ? 'out' : 'in'} ${isMedia ? 'media' : ''} ${isMedia && hasExtra ? 'has-extra' : ''} ${last ? 'tail' : ''} ${selected ? 'selected' : ''} min-w-0 ${deleted ? 'opacity-60' : ''}`}
        >
          <div className={isMedia && !hasExtra ? '' : isMedia ? 'p-1' : 'px-3 pt-1.5 pb-1.5'}>
            {ctx.isGroup && !mine && first && !deleted && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); ctx.onOpenProfile(m.sender_id); }}
                className={`block tl-head text-[10px] uppercase tracking-[0.12em] mb-0.5 hover:underline ${isMedia ? 'px-2 pt-1' : ''}`}
                style={{ color: nameColor(m.sender_id) }}
              >
                {ctx.senderName(m.sender_id)}
              </button>
            )}

            {m.forwarded_from && !deleted && (
              <p className={`tl-term text-[13px] text-[var(--cyan2)] mb-0.5 ${isMedia ? 'px-2' : ''}`}>
                Переслано от <span className="tl-head text-[10px] uppercase tracking-[0.1em]">{m.forwarded_from}</span>
              </p>
            )}

            {m.reply_to_id && !deleted && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (!hasTextSelection()) ctx.onJump(m.reply_to_id!); }}
                className="w-full flex items-stretch gap-2 mb-1 pr-2 bg-black/25 hover:bg-black/40 text-left transition-colors"
              >
                <span className="w-[3px] shrink-0" style={{ background: quoted ? nameColor(quoted.sender_id) : 'var(--pink)' }} />
                {quoted?.kind === 'image' && quoted.attachment_url && (
                  <img src={quoted.attachment_url} alt="" className="w-8 h-8 my-1 object-cover" />
                )}
                <span className="min-w-0 py-1">
                  <span className="block tl-head text-[10px] uppercase tracking-[0.12em] truncate" style={{ color: quoted ? nameColor(quoted.sender_id) : 'var(--pink)' }}>
                    {quoted ? ctx.senderName(quoted.sender_id) : 'Сообщение'}
                  </span>
                  <span className="block tl-term text-[13px] text-pearl/70 truncate">
                    {quoted ? msgPreview(quoted) : 'Нажмите, чтобы перейти'}
                  </span>
                </span>
              </button>
            )}

            {deleted ? (
              <p className="tl-term text-[15px] italic tl-muted pr-1">
                Сообщение удалено<span className="lc-meta-spacer" style={{ width: metaWidth }} />
              </p>
            ) : (
              <>
                {m.attachment_url && (
                  <Attachment m={m} onOpen={() => ctx.onOpenMedia(m)} overlayMeta={isMedia && !m.content && !reactions.length ? meta : null} />
                )}
                {m.content && (
                  <p className={`tl-wrap tl-term text-[16px] leading-[1.3] text-pearl whitespace-pre-wrap break-words select-text ${isMedia ? 'px-2 pt-1' : ''}`}>
                    <RichText text={m.content} query={ctx.highlight} />
                    <span className="lc-meta-spacer" style={{ width: metaWidth }} />
                  </p>
                )}
              </>
            )}

            {reactionChips && <div className={isMedia ? 'px-1.5 pb-1' : ''}>{reactionChips}</div>}
          </div>

          {/* мета: поверх медиа без подписи — в оверлее, иначе — в правом нижнем углу */}
          {!(isMedia && !m.content && !reactions.length) && (
            <span className={`absolute right-2 bottom-1 ${reactions.length && !m.content ? 'bottom-1.5' : ''}`}>{meta}</span>
          )}
        </div>
      )}

      </div>
    </div>
  );
});

function SelectBox({ on }: { on: boolean }) {
  return (
    <span className={`absolute left-4 bottom-2 w-5 h-5 flex items-center justify-center border transition-colors ${on ? 'bg-accent border-accent text-black shadow-[var(--glow-sm)]' : 'border-[var(--line-2)] bg-black/40'}`}>
      {on && <Check size={13} />}
    </span>
  );
}

function HoverActions({ m, ctx, picker, setPicker, side }: {
  m: Msg; ctx: BubbleCtx; picker: boolean; setPicker: (v: boolean) => void; side: 'left' | 'right';
}) {
  return (
    <div className={`lc-hover absolute bottom-0 z-10 flex gap-1 ${side === 'left' ? 'right-full mr-2' : 'left-full ml-2'} ${picker ? '!opacity-100 !pointer-events-auto' : ''}`}>
      <button
        type="button"
        title="Реакция"
        onClick={(e) => { e.stopPropagation(); setPicker(!picker); }}
        className="w-7 h-7 flex items-center justify-center border border-[var(--line)] bg-[var(--panel)] text-pearl/72 hover:text-accent hover:border-[var(--line-2)]"
      >
        <SmilePlus size={14} />
      </button>
      <button
        type="button"
        title="Ответить"
        onClick={(e) => { e.stopPropagation(); ctx.onReply(m); }}
        className="w-7 h-7 flex items-center justify-center border border-[var(--line)] bg-[var(--panel)] text-pearl/72 hover:text-accent hover:border-[var(--line-2)]"
      >
        <Reply size={14} />
      </button>
      {picker && (
        <div
          onMouseLeave={() => setPicker(false)}
          className={`lc-pop absolute bottom-full mb-1 z-20 flex gap-0.5 p-1 bg-[#0d0a14] border border-[var(--line)] shadow-[0_8px_24px_rgba(0,0,0,.6)] ${side === 'left' ? 'right-0' : 'left-0'}`}
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={(ev) => { ev.stopPropagation(); ctx.onReact(m, e); setPicker(false); }}
              className="w-8 h-8 text-[18px] hover:bg-[rgb(var(--accent-rgb)/.18)] hover:scale-125 transition-transform"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Attachment({ m, onOpen, overlayMeta }: { m: Msg; onOpen: () => void; overlayMeta: React.ReactNode }) {
  if (m.kind === 'image') {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="relative block max-w-full">
        <img
          src={m.attachment_url}
          alt={m.attachment_name || 'Фото'}
          draggable={false}
          className="block max-w-full max-h-[340px] min-w-[120px] min-h-[80px] object-cover bg-black/40 border border-[var(--line)] select-none"
        />
        {overlayMeta && <span className="absolute right-1.5 bottom-1.5 px-1.5 py-1 bg-black/60">{overlayMeta}</span>}
      </button>
    );
  }
  if (m.kind === 'video') {
    return (
      <div className="relative group/v">
        <video
          src={m.attachment_url}
          controls
          playsInline
          preload="metadata"
          onClick={(e) => e.stopPropagation()}
          className="block max-w-full max-h-[340px] bg-black border border-[var(--line)]"
        />
        <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 bg-black/60 tl-term text-[12px] text-pearl/80 flex items-center gap-1 pointer-events-none group-hover/v:opacity-0 transition-opacity">
          <Play size={10} /> {fmtBytes(m.attachment_size)}
        </span>
        {overlayMeta && <span className="absolute right-1.5 top-1.5 px-1.5 py-1 bg-black/60 pointer-events-none">{overlayMeta}</span>}
      </div>
    );
  }
  return (
    <a
      href={m.attachment_url}
      target="_blank"
      rel="noreferrer"
      download={m.attachment_name}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-3 py-1 pr-2 min-w-[220px] group/f"
    >
      <span className="w-11 h-11 shrink-0 flex items-center justify-center bg-[rgb(var(--accent-rgb)/.18)] border border-[var(--line-2)] text-accent group-hover/f:shadow-[var(--glow-sm)]">
        <FileText size={19} className="group-hover/f:hidden" />
        <Download size={19} className="hidden group-hover/f:block" />
      </span>
      <span className="min-w-0">
        <span className="block tl-head text-[10px] uppercase tracking-[0.08em] text-pearl/90 truncate max-w-[260px]">{m.attachment_name || 'Файл'}</span>
        <span className="block tl-term text-[14px] tl-muted">{fmtBytes(m.attachment_size)}</span>
      </span>
    </a>
  );
}
