import { useState, useEffect } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { createGroup } from '../../../api/groups';
import api from '../../../api';
import { useDialog } from '../../../components/Dialogs';
import { useProUpgradeDialog } from '../../../components/ProUpgradeDialog';
import { useProLimits } from '../../../api/proLimits';
import { GROUP_FALLBACK } from '../model';

type CreateGroupModalProps = {
  onClose: () => void;
  onCreated: (groupId: number) => void;
};

/** Создание группы прямо из окна сообщений (раньше — отдельное окно /group-window). */
export default function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const dlg = useDialog();
  const offerPro = useProUpgradeDialog();
  const { group_members: maxMembers, is_pro: isPro } = useProLimits();
  const [name, setName] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(true);

  useEffect(() => {
    api.get('/friends/list')
      .then((res) => setFriends(res.data || []))
      .catch(() => setFriends([]))
      .finally(() => setLoadingFriends(false));
  }, []);

  const submit = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const g = await createGroup({ name: name.trim(), member_ids: selected });
      onCreated(g.id);
    } catch (e: any) {
      if (e?.response?.data?.code === 'group_limit') {
        await offerPro({
          title: 'Лимит групп',
          message: `${e.response.data.error}. Открыть страницу подписки?`,
        });
        onClose();
      } else {
        await dlg.alert({
          title: 'Ошибка',
          message: e?.response?.data?.error || 'Не удалось создать группу',
          danger: true,
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const toggle = (id: number) => {
    if (!selected.includes(id)) {
      // лимит участников считает и создателя: owner + selected <= maxMembers
      if (selected.length + 1 >= maxMembers) {
        if (!isPro) {
          offerPro({
            title: 'Лимит участников',
            message: `В группе может быть до ${maxMembers} участников, включая создателя. С подпиской Pro — до 50. Открыть страницу подписки?`,
          });
        } else {
          dlg.alert({ title: 'Лимит участников', message: `В группе может быть не более ${maxMembers} участников.`, tone: 'info' });
        }
        return;
      }
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="absolute inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="tl-panel w-full max-w-md p-0">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--line)]">
          <span className="tl-head text-[11px] uppercase tracking-[0.16em] text-white">Новая группа</span>
          <button onClick={onClose} className="text-pearl/70 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !creating) submit(); }}
            placeholder="Название группы"
            maxLength={60}
            className="tl-field rounded-none tl-term text-[14px]"
          />

          <div>
            <p className="tl-head text-[10px] uppercase tracking-[0.18em] tl-muted mb-2">
              Участники ({selected.length}/{maxMembers - 1})
              {!isPro && <span className="text-[#fbbf24] font-bold"> · с Pro — до 50</span>}
            </p>
            <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
              {loadingFriends ? (
                <div className="flex items-center justify-center py-6 text-pearl/60"><Loader2 size={16} className="animate-spin" /></div>
              ) : friends.length === 0 ? (
                <p className="tl-term text-[14px] tl-muted">Пока нет друзей — создайте группу без участников</p>
              ) : (
                friends.map((f) => {
                  const fd = f.friend_details;
                  if (!fd) return null;
                  const checked = selected.includes(fd.id);
                  return (
                    <button
                      key={fd.id}
                      onClick={() => toggle(fd.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-none border transition-all text-left ${checked ? 'bg-[rgb(var(--accent-rgb)/.12)] border-[var(--line-2)]' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]'}`}
                    >
                      <img src={fd.profile?.avatar_url || GROUP_FALLBACK} alt="" className="w-8 h-8 rounded-none object-cover bg-black border border-[var(--line)]" />
                      <span className="tl-head text-[10px] uppercase tracking-[0.08em] text-pearl/80 flex-1 truncate">{fd.profile?.display_name || fd.username}</span>
                      <span className={`w-4 h-4 rounded-none border flex items-center justify-center text-[10px] ${checked ? 'bg-accent border-accent text-black' : 'border-white/20'}`}>
                        {checked ? <Check size={10} /> : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <button
            onClick={submit}
            disabled={!name.trim() || creating}
            className="tl-btn solid w-full h-11 disabled:opacity-40"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : null} Создать группу
          </button>
        </div>
      </div>
    </div>
  );
}
