import { IconHash } from '@tabler/icons-react';

interface FriendCodeSearchProps {
  code: string;
  codeError: string;
  codeResult: any;
  onCodeChange: (value: string) => void;
  onSearch: () => void;
  onSend: () => void;
}

export const FriendCodeSearch = ({ code, codeError, codeResult, onCodeChange, onSearch, onSend }: FriendCodeSearchProps) => (
  <div className="tl-panel p-5">
    <p className="tl-pixel text-[10px] text-white mb-3.5 [text-shadow:var(--glow-sm)] flex items-center gap-2">
      <IconHash size={14} className="text-[var(--pink)]" /> НАЙТИ ПО КОДУ ДРУГА
    </p>
    <div className="flex gap-2">
      <input
        className="tl-field flex-1 font-bold"
        style={{ letterSpacing: '0.2em' }}
        placeholder="Введите 10-значный код..."
        value={code}
        onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
      />
      <button
        onClick={onSearch}
        disabled={code.length < 10}
        className="tl-btn"
      >
        Найти
      </button>
    </div>

    {codeError && <p className="tl-term text-[15px] mt-2" style={{ color: '#ff5b8a' }}>{codeError}</p>}

    {codeResult && (
      <div className="tl-vrow mt-4">
        <div className="ic overflow-hidden" style={{ width: 44, height: 44 }}>
          <img src={codeResult.profile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest"} className="w-full h-full object-cover" alt="" />
        </div>
        <div className="vt">
          <b>{codeResult.profile?.display_name || codeResult.username}</b>
          <div className="vd">@{codeResult.username}</div>
        </div>
        <button
          onClick={onSend}
          className="tl-btn"
        >
          ОТПРАВИТЬ ЗАЯВКУ
        </button>
      </div>
    )}
  </div>
);
