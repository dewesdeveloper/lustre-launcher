import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Paperclip, Send, Smile, X, Reply, Pencil, Check, FileText, Loader2 } from 'lucide-react';
import type { Msg } from '../model';
import { fmtBytes, msgPreview, nameColor } from '../model';

/** Поле ввода растёт до этой высоты (≈7 строк), дальше — прокрутка */
const COMPOSER_MAX_H = 168;

/** Лимит длины сообщения без Pro (как на сервере; с Pro — 32 768, приходит в maxLen) */
export const MAX_MESSAGE_LEN = 4096;
/** Счётчик символов появляется за столько символов до лимита */
const COUNTER_BEFORE = 500;

export type ComposerMode =
  | { kind: 'none' }
  | { kind: 'reply'; msg: Msg; name: string }
  | { kind: 'edit'; msg: Msg };

interface Props {
  threadKey: string;
  draft: string;
  onDraft: (text: string) => void;
  mode: ComposerMode;
  onCancelMode: () => void;
  onSend: (text: string) => void;
  onEditLast: () => void;
  onTyping: () => void;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Лимит длины сообщения (зависит от подписки) */
  maxLen?: number;
}

/** Поле ввода как в Telegram: растущий textarea, эмодзи, вложения, ответ/правка, черновики. */
export function Composer({ threadKey, draft, onDraft, mode, onCancelMode, onSend, onEditLast, onTyping, onFiles, disabled, maxLen = MAX_MESSAGE_LEN }: Props) {
  const [text, setText] = useState(draft);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // смена чата — подставляем его черновик
  useEffect(() => {
    setText(mode.kind === 'edit' ? mode.msg.content : draft);
    setEmojiOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  // вход в режим правки — текст сообщения; выход из правки — снова черновик
  const prevMode = useRef(mode.kind);
  useEffect(() => {
    if (mode.kind === 'edit') setText(mode.msg.content);
    else if (prevMode.current === 'edit') setText(draft);
    prevMode.current = mode.kind;
    requestAnimationFrame(() => ref.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind === 'edit' ? mode.msg.id : mode.kind, mode.kind === 'reply' ? mode.msg.id : 0]);

  // автовысота: scrollHeight не включает рамку — без неё поле было на 2px ниже содержимого
  // и полоса прокрутки появлялась уже на одной строке. Прокрутка — только сверх лимита.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    const full = el.scrollHeight + el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(full, COMPOSER_MAX_H)}px`;
    el.style.overflowY = full > COMPOSER_MAX_H ? 'auto' : 'hidden';
  }, [text]);

  const change = (v: string) => {
    setText(v);
    if (mode.kind !== 'edit') onDraft(v);
    if (v.trim()) onTyping();
  };

  const submit = () => {
    const v = text.trim();
    if (!v || disabled) return;
    onSend(v);
    setText('');
    if (mode.kind !== 'edit') onDraft('');
    setEmojiOpen(false);
  };

  const insert = (s: string) => {
    const el = ref.current;
    if (!el) { change(text + s); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + s + text.slice(end);
    if (next.length > maxLen) return; // эмодзи не должно выводить за лимит
    change(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + s.length;
    });
  };

  const isEdit = mode.kind === 'edit';

  return (
    <div className="relative shrink-0 border-t border-[var(--line)] bg-[var(--panel)]">
      {mode.kind !== 'none' && (
        <div className="flex items-center gap-3 px-4 pt-2">
          {isEdit ? <Pencil size={16} className="text-accent shrink-0" /> : <Reply size={16} className="text-accent shrink-0" />}
          <span className="w-[2px] self-stretch bg-accent shadow-[var(--glow-sm)]" />
          <span className="min-w-0 flex-1">
            <span
              className="block tl-head text-[10px] uppercase tracking-[0.16em]"
              style={{ color: mode.kind === 'reply' ? nameColor(mode.msg.sender_id) : 'var(--pink)' }}
            >
              {isEdit ? 'Редактирование' : `В ответ ${mode.name}`}
            </span>
            <span className="block tl-term text-[14px] text-pearl/70 truncate">{msgPreview(mode.msg)}</span>
          </span>
          <button onClick={onCancelMode} className="text-pearl/70 hover:text-white shrink-0" title="Отменить (Esc)">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2.5">
        <button
          type="button"
          title="Прикрепить файл"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || isEdit}
          className="w-9 h-9 shrink-0 flex items-center justify-center text-pearl/70 hover:text-accent transition-colors disabled:opacity-30"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) onFiles(files);
            e.target.value = '';
          }}
        />

        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          maxLength={maxLen}
          onChange={(e) => change(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files || []);
            if (files.length) { e.preventDefault(); onFiles(files); }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); return; }
            if (e.key === 'Escape' && mode.kind !== 'none') { e.preventDefault(); onCancelMode(); return; }
            if (e.key === 'ArrowUp' && !text && mode.kind === 'none') { e.preventDefault(); onEditLast(); }
          }}
          placeholder={disabled ? 'Нет соединения…' : 'Сообщение'}
          className="lc-composer-input custom-scrollbar flex-1 min-h-[36px] py-[7px] px-3 bg-[#08050f] border border-[var(--line)] focus:border-[var(--line-2)] focus:shadow-[var(--glow-sm)] outline-none tl-term text-[16px] leading-[1.3] text-pearl placeholder:text-pearl/60 transition-shadow"
        />

        <button
          type="button"
          title="Эмодзи"
          onClick={() => setEmojiOpen((v) => !v)}
          className={`w-9 h-9 shrink-0 flex items-center justify-center transition-colors ${emojiOpen ? 'text-accent' : 'text-pearl/70 hover:text-accent'}`}
        >
          <Smile size={19} />
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || disabled}
          title={isEdit ? 'Сохранить' : 'Отправить (Enter)'}
          className="w-9 h-9 shrink-0 flex items-center justify-center bg-accent text-black hover:brightness-110 hover:shadow-[var(--glow)] disabled:opacity-25 disabled:shadow-none transition-all active:scale-95"
        >
          {isEdit ? <Check size={17} /> : <Send size={16} />}
        </button>
      </div>

      {/* счётчик — отдельной строкой под полем, а не поверх текста */}
      {text.length >= maxLen - COUNTER_BEFORE && (
        <div className="flex items-center justify-end gap-3 px-4 pb-2 -mt-1 tl-term text-[14px] leading-none">
          {text.length >= maxLen && maxLen < 32768 && (
            <span className="text-pearl/60">Лимит сообщения. С Lustre Pro — до 32 768 символов</span>
          )}
          <span className={`tabular-nums ${text.length >= maxLen ? 'text-accent' : 'text-pearl/60'}`}>
            {text.length.toLocaleString('ru-RU')} / {maxLen.toLocaleString('ru-RU')}
          </span>
        </div>
      )}

      {emojiOpen && <EmojiPanel onPick={insert} onClose={() => setEmojiOpen(false)} />}
    </div>
  );
}

// ---------------- Эмодзи ----------------

const EMOJI_GROUPS: { id: string; icon: string; list: string[] }[] = [
  { id: 'smiles', icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖'.split(' ') },
  { id: 'hands', icon: '👍', list: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⚡ 🌟 ⭐'.split(' ') },
  { id: 'games', icon: '🎮', list: '🎮 🕹️ 👾 🎯 🎲 🧩 ♟️ 🃏 🀄 🎰 🏆 🥇 🥈 🥉 🏅 🎖️ ⚔️ 🗡️ 🛡️ 🏹 💣 🔫 🪄 🧙 🐉 🦄 👑 💎 🪙 💰 🎁 🎉 🎊 🎈 🚀 🛸 🌌 🌙 ☄️ 🔮 🧪 ⚙️ 🔧 🖥️ 💻 ⌨️ 🖱️ 🎧 🎤 📺 📱 🔋 📡 🛰️'.split(' ') },
  { id: 'food', icon: '🍕', list: '🍕 🍔 🍟 🌭 🥪 🌮 🌯 🍣 🍜 🍝 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 🥤 🧋 ☕ 🍵 🍺 🍻 🥂 🍷 🍹 🍎 🍌 🍉 🍇 🍓 🍒 🥑 🌶️'.split(' ') },
];

const RECENT_KEY = 'lh_recent_emoji';

function EmojiPanel({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(() => (loadRecent().length ? 'recent' : 'smiles'));
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !target.closest('[title="Эмодзи"]')) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const pick = (e: string) => {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 32);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const list = tab === 'recent' ? recent : EMOJI_GROUPS.find((g) => g.id === tab)?.list ?? [];

  return (
    <div
      ref={ref}
      className="lc-pop absolute right-3 bottom-full mb-2 z-40 w-[340px] bg-[#0d0a14] border border-[var(--line)] shadow-[0_12px_32px_rgba(0,0,0,.65)]"
    >
      <div className="grid grid-cols-9 gap-0.5 p-2 h-[220px] overflow-y-auto custom-scrollbar content-start">
        {list.length === 0 && <p className="col-span-9 tl-term text-[14px] tl-muted p-2">Здесь появятся недавние эмодзи</p>}
        {list.map((e, i) => (
          <button key={`${e}${i}`} type="button" onClick={() => pick(e)} className="h-9 text-[21px] hover:bg-[rgb(var(--accent-rgb)/.18)] transition-colors">
            {e}
          </button>
        ))}
      </div>
      <div className="flex border-t border-[var(--line)]">
        {[{ id: 'recent', icon: '🕘' }, ...EMOJI_GROUPS].map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setTab(g.id)}
            className={`flex-1 h-9 text-[17px] transition-colors ${tab === g.id ? 'bg-[rgb(var(--accent-rgb)/.16)] shadow-[inset_0_-2px_0_var(--pink)]' : 'hover:bg-white/[0.04] opacity-70'}`}
          >
            {g.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

// ---------------- Отправка файлов ----------------

/** Окно «Отправить N файлов» с превью и подписью — как в Telegram. */
export function AttachDialog({ files, onCancel, onSend, maxLen = MAX_MESSAGE_LEN }: {
  files: File[];
  maxLen?: number;
  onCancel: () => void;
  onSend: (caption: string, onProgress: (p: { index: number; total: number; percent: number }) => void) => Promise<void>;
}) {
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; percent: number } | null>(null);
  const [previews] = useState(() => files.map((f) => (f.type.startsWith('image/') || f.type.startsWith('video/') ? URL.createObjectURL(f) : '')));

  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSend(caption, setProgress);
    } finally {
      setBusy(false);
    }
  };

  const allMedia = files.every((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
  const title = allMedia
    ? `Отправить ${files.length > 1 ? `${files.length} медиа` : files[0].type.startsWith('video/') ? 'видео' : 'фото'}`
    : `Отправить ${files.length > 1 ? `${files.length} файла(ов)` : 'файл'}`;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="tl-panel w-[440px] max-w-[92vw] bg-[var(--panel)] border border-[var(--line)] shadow-[0_20px_60px_rgba(0,0,0,.7)]">
        <div className="flex items-center justify-between px-4 h-11 border-b border-[var(--line)]">
          <span className="tl-head text-[10px] uppercase tracking-[0.18em] text-white">{title}</span>
          {!busy && <button onClick={onCancel} className="text-pearl/70 hover:text-white"><X size={16} /></button>}
        </div>
        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar p-3 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              {previews[i] && f.type.startsWith('image/') ? (
                <img src={previews[i]} alt="" className={`${files.length === 1 ? 'w-full max-h-72' : 'w-14 h-14'} object-cover border border-[var(--line)]`} />
              ) : previews[i] ? (
                <video src={previews[i]} muted className={`${files.length === 1 ? 'w-full max-h-72' : 'w-14 h-14'} object-cover border border-[var(--line)] bg-black`} />
              ) : (
                <span className="w-14 h-14 shrink-0 flex items-center justify-center bg-[rgb(var(--accent-rgb)/.15)] border border-[var(--line-2)] text-accent"><FileText size={22} /></span>
              )}
              {(files.length > 1 || !previews[i]) && (
                <span className="min-w-0 flex-1">
                  <span className="block tl-head text-[10px] uppercase tracking-[0.08em] text-pearl/85 truncate">{f.name}</span>
                  <span className="block tl-term text-[14px] tl-muted">{fmtBytes(f.size)}</span>
                  {progress && progress.index === i && (
                    <span className="block h-1 mt-1 bg-white/10"><span className="block h-full bg-accent" style={{ width: `${progress.percent}%` }} /></span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="px-3 pb-3">
          <input
            autoFocus
            value={caption}
            maxLength={maxLen}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } if (e.key === 'Escape' && !busy) onCancel(); }}
            placeholder="Подпись"
            disabled={busy}
            className="tl-field w-full h-9 tl-term text-[15px]"
          />
          {progress && files.length === 1 && (
            <span className="block h-1 mt-2 bg-white/10"><span className="block h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} /></span>
          )}
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={onCancel} disabled={busy} className="tl-btn ghost">Отмена</button>
            <button onClick={send} disabled={busy} className="tl-btn solid flex items-center gap-2">
              {busy && <Loader2 size={13} className="animate-spin" />}
              {busy && progress ? `${progress.index + 1}/${progress.total} · ${progress.percent}%` : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
