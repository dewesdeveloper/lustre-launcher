import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useDialog } from '../../components/Dialogs';
import { IconSearch, IconUserPlus, IconCopy, IconCheck } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { friendInviteUrl } from '../../utils/inviteLinks';
import { FriendCodeSearch } from './components/FriendCodeSearch';
import { UserSearchResult } from './components/UserSearchResult';

const STEPS = [
  { n: '01', text: 'Скопируйте свой код друга' },
  { n: '02', text: 'Отправьте его другу в чат' },
  { n: '03', text: 'Примьте заявку во вкладке «Заявки»' },
];

export default function AddFriend() {
  const { user } = useAuth();
  const dlg = useDialog();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [codeResult, setCodeResult] = useState<any>(null);
  const [codeError, setCodeError] = useState('');
  const [copied, setCopied] = useState(false);

  // Ссылка-приглашение: в десктопе lustre:// deep-link, в web — обычная ссылка на страницу
  const inviteUrl = friendInviteUrl(user?.friend_code);

  const handleSearch = async (q: string) => {
    setQuery(q);
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    try {
      const res = await api.get(`/user/search?q=${encodeURIComponent(term)}`);
      setResults(res.data);
    } catch { setResults([]); }
  };

  const handleCodeSearch = async () => {
    if (!code.trim()) return;
    setCodeError('');
    setCodeResult(null);
    try {
      const res = await api.get(`/friends/find/${code.trim()}`);
      setCodeResult(res.data);
    } catch (err: any) {
      setCodeError(err.response?.data?.error || 'Пользователь не найден');
    }
  };

  // Открыли по ссылке-приглашению (/friends/add?code=…) — сразу ищем по коду
  const initialCode = searchParams.get('code');
  useEffect(() => {
    if (!initialCode) return;
    void (async () => {
      setCodeError('');
      setCodeResult(null);
      try {
        const res = await api.get(`/friends/find/${encodeURIComponent(initialCode)}`);
        setCodeResult(res.data);
      } catch (err: any) {
        setCodeError(err.response?.data?.error || 'Пользователь не найден');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendRequest = async (id: number) => {
    try {
      await api.post('/friends/request', { friend_id: id });
      dlg.alert({ message: 'Заявка отправлена!', tone: 'success' });
    } catch (e: any) {
      dlg.alert({ message: e?.response?.data?.error || 'Не удалось отправить заявку', danger: true, title: 'Ошибка' });
    }
  };

  const sendRequestByCode = async () => {
    if (!codeResult) return;
    try {
      await api.post('/friends/request', { friend_code: code.trim() });
      dlg.alert({ message: 'Заявка отправлена!', tone: 'success' });
      setCodeResult(null);
      setCode('');
    } catch (e: any) {
      dlg.alert({ message: e?.response?.data?.error || 'Не удалось отправить заявку', danger: true, title: 'Ошибка' });
    }
  };

  const copyCode = async () => {
    if (!user?.friend_code) return;
    try {
      await navigator.clipboard.writeText(user.friend_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* буфер обмена недоступен */ }
  };

  const panelTitle = 'tl-pixel text-[10px] text-white mb-3.5 [text-shadow:var(--glow-sm)]';

  return (
    <div className="max-w-[1240px] mx-auto animate-in fade-in duration-500 pb-10">
      {/* строка статуса модуля */}
      <div className="tl-ticker">
        <span className="live"><IconUserPlus size={14} /> // ADD FRIEND MODULE</span>
        <span>invite: code / nick</span>
        <span>· status: ready</span>
      </div>

      <div className="tl-sec-head mt-2">
        <span className="bar" />
        <h2>ДОБАВИТЬ ДРУГА</h2>
        <span className="count">// шаг 01 из 02</span>
        <span className="line" />
        <span className="tag">INVITE</span>
      </div>

      <div className="grid grid-cols-1 gap-[22px] xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ===== ЛЕВАЯ КОЛОНКА: код и подсказка ===== */}
        <aside className="flex flex-col gap-4">
          <div className="tl-panel p-5">
            <h3 className={panelTitle}>ВАШ КОД ДРУГА</h3>
            <div className="flex items-stretch mb-3">
              <div className="flex-1 grid place-items-center px-2.5 py-3 bg-[#08050f] border border-r-0 border-[var(--line)] tl-term text-[24px] tracking-[.22em] text-[var(--pink)] [text-shadow:var(--glow-sm)]">
                {user?.friend_code || '—'}
              </div>
              <button className="tl-btn" style={{ padding: '0 14px' }} onClick={copyCode}>
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            <p className="tl-term text-[15px] text-[var(--muted-2)] leading-snug break-words">
              Отдайте код другу — или отправьте ссылку {inviteUrl}
            </p>
          </div>

          <div className="tl-panel p-5">
            <h3 className={panelTitle}>КАК ЭТО РАБОТАЕТ</h3>
            <div className="flex flex-col gap-3">
              {STEPS.map(s => (
                <div key={s.n} className="flex items-center gap-3">
                  <span className="w-7 h-7 shrink-0 grid place-items-center border border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.06)] tl-term text-[15px] leading-none text-[var(--pink)]">
                    {s.n}
                  </span>
                  <span className="tl-term text-[15px] text-[var(--muted)] leading-snug">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ===== ПРАВАЯ КОЛОНКА: два способа найти друга ===== */}
        <div className="flex flex-col gap-4">
          <FriendCodeSearch
            code={code}
            codeError={codeError}
            codeResult={codeResult}
            onCodeChange={setCode}
            onSearch={handleCodeSearch}
            onSend={sendRequestByCode}
          />

          <div className="tl-panel p-5">
            <h3 className={panelTitle}>ПОИСК ПО НИКУ</h3>
            <div className="relative mb-4">
              <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
              <input
                className="tl-field"
                style={{ paddingLeft: 40 }}
                placeholder="Введите ник…"
                value={query}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3">
              {results.map((u: any) => (
                <UserSearchResult
                  key={u.id}
                  user={u}
                  onSend={() => sendRequest(u.id)}
                />
              ))}
              {query.length >= 2 && results.length === 0 && (
                <p className="tl-term text-[15px] text-[var(--muted-2)]">Никого не найдено</p>
              )}
              {query.length < 2 && (
                <p className="tl-term text-[15px] text-[var(--muted-2)]">
                  Введите минимум 2 символа ника для поиска
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
