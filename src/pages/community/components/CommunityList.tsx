import { IconLogin2, IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { Community } from '../../../api/community';
import Select from '../../../components/ui/Select';
import { CommunityCardItem } from './CommunityCard';

type CommunityListProps = {
  communities: Community[];
  total: number;
  loading: boolean;
  userId?: number;
  /** Модератор может удалить любое сообщество */
  isModerator?: boolean;
  onPublish: () => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onInvite: (community: Community) => void;
  onOpen: (community: Community) => void;
  pageSize: number;
  onChangePageSize: (size: number) => void;
};

const PAGE_SIZES = [10, 20, 30, 50];
const GRID = 'grid grid-cols-1 gap-6 md:grid-cols-2';

/** Раздел «Сообщества»: размер страницы, кнопки публикации и создания, сетка карточек. */
export default function CommunityList(props: CommunityListProps) {
  const { communities, total, loading, userId, isModerator = false, pageSize } = props;
  const navigate = useNavigate();

  let body;
  if (loading) {
    body = <div className={GRID}>{[0, 1].map((i) => <div key={i} className="tl-panel h-56 animate-pulse" />)}</div>;
  } else if (communities.length === 0) {
    body = (
      <div className="tl-panel p-14 text-center">
        <p className="tl-head tl-muted text-[11px] font-bold uppercase tracking-[.2em]">Пока нет ни одного сообщества</p>
        <p className="tl-term mt-2 text-[15px] text-[var(--muted-2)]">Стань первым — создай сообщество по любимой игре</p>
      </div>
    );
  } else {
    body = (
      <div className={GRID}>
        {communities.map((c) => {
          const owner = userId === c.creator_id;
          return (
            <CommunityCardItem
              key={c.ID}
              community={c}
              isOwner={owner}
              canDelete={owner || isModerator}
              onDelete={() => props.onDelete(c.ID)}
              onInvite={() => props.onInvite(c)}
              onOpen={() => props.onOpen(c)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <section>
      <div className="tl-sec-head">
        <span className="bar" />
        <h2>Сообщества</h2>
        <span className="count">// {total}</span>
        <span className="line" />
      </div>

      <div className="tl-toolbar">
        <Select
          value={pageSize}
          onChange={(v) => props.onChangePageSize(Number(v))}
          buttonClassName="rounded-none! bg-[#08050f]! border-[color:var(--line)]! px-3.5 py-2.5 text-[10px]"
          panelClassName="rounded-none! shadow-none! backdrop-blur-none! bg-[#0f0a17]! border-[color:var(--line)]!"
          options={PAGE_SIZES.map((n) => ({ value: n, label: `По ${n}` }))}
        />
        <div className="spacer" />
        {userId ? (
          <>
            <button type="button" onClick={props.onPublish} className="tl-btn ghost"><IconPlus size={15} /> Опубликовать контент</button>
            <button type="button" onClick={props.onCreate} className="tl-btn solid"><IconPlus size={15} /> Создать сообщество</button>
          </>
        ) : (
          <button type="button" onClick={() => navigate('/login')} className="tl-btn solid"><IconLogin2 size={15} /> Войти</button>
        )}
      </div>

      {body}
    </section>
  );
}
