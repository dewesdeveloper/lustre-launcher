interface UserSearchResultProps {
  user: any;
  onSend: () => void;
}

export const UserSearchResult = ({ user: u, onSend }: UserSearchResultProps) => (
  <div className="tl-vrow">
    <div className="ic overflow-hidden" style={{ width: 44, height: 44 }}>
      <img src={u.profile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest"} className="w-full h-full object-cover" alt="" />
    </div>
    <div className="vt">
      <b>{u.profile?.display_name || u.username}</b>
      <div className="vd">@{u.username}</div>
    </div>
    <button
      onClick={onSend}
      className="tl-btn"
    >
      ОТПРАВИТЬ ЗАЯВКУ
    </button>
  </div>
);
