import type { RefObject } from 'react';
import {
  IconCheck, IconSend, IconMessage2Question, IconChevronDown,
} from '@tabler/icons-react';

export const TOPICS = [
  { label: 'Проблема с запуском игры', category: 'bug' },
  { label: 'Ошибка оплаты или магазина', category: 'payment' },
  { label: 'Аккаунт и безопасность', category: 'account' },
  { label: 'Сообщества и контент', category: 'other' },
  { label: 'Предложение или идея', category: 'other' },
  { label: 'Другое', category: 'other' },
];

interface TicketFormProps {
  topic: string;
  topicOpen: boolean;
  onTopicToggle: () => void;
  onTopicOpenChange: (open: boolean) => void;
  onTopicChange: (label: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  message: string;
  onMessageChange: (v: string) => void;
  sending: boolean;
  sent: boolean;
  onResetSent: () => void;
  formError: string;
  onSubmit: () => void;
  topicRef: RefObject<HTMLDivElement | null>;
}

export const TicketForm = ({
  topic, topicOpen, onTopicToggle, onTopicOpenChange, onTopicChange,
  email, onEmailChange, message, onMessageChange,
  sending, sent, onResetSent, formError, onSubmit, topicRef,
}: TicketFormProps) => (
  <div className="tl-panel p-6 mb-8">
    {sent ? (
      <div className="py-10 text-center">
        <div className="w-16 h-16 border border-[rgba(52,211,153,.5)] bg-[rgba(52,211,153,.10)] flex items-center justify-center mx-auto mb-5 text-[var(--green2)]">
          <IconCheck size={28} />
        </div>
        <h2 className="tl-head text-[15px] font-bold uppercase tracking-[0.14em] text-white mb-2">Обращение отправлено</h2>
        <p className="tl-term text-[15px] tl-muted mb-8 max-w-md mx-auto leading-relaxed">
          Мы получили ваше сообщение по теме «{topic}» и ответим на {email} в течение 24 часов.
        </p>
        <button
          onClick={onResetSent}
          className="tl-btn solid"
        >
          Создать ещё обращение
        </button>
      </div>
    ) : (
      <>
        <h2 className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-6 flex items-center gap-2">
          <IconMessage2Question size={16} className="text-accent" /> Написать в поддержку
        </h2>

        <div className="space-y-5">
          <div ref={topicRef}>
            <label className="tl-head block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-2">Тема обращения</label>
            <div className="relative">
              <button
                type="button"
                onClick={onTopicToggle}
                className={`tl-field flex items-center justify-between gap-3 text-left ${
                  topicOpen ? 'shadow-[inset_0_0_0_1px_var(--line-2)]' : ''
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <IconMessage2Question size={16} className="text-accent shrink-0" />
                  <span className="truncate">{topic}</span>
                </span>
                <IconChevronDown size={16} className={`text-[var(--muted-2)] shrink-0 transition-transform duration-200 ${topicOpen ? 'rotate-180' : ''}`} />
              </button>

              {topicOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 z-30">
                  <div className="tl-panel py-2 flex flex-col max-h-72 overflow-y-auto custom-scrollbar">
                    {TOPICS.map(t => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => { onTopicChange(t.label); onTopicOpenChange(false); }}
                        className={`px-4 py-2.5 tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-left flex items-center justify-between gap-3 transition-colors ${
                          t.label === topic ? 'text-accent bg-[rgb(var(--accent-rgb)/.10)]' : 'text-[var(--muted)] hover:text-white hover:bg-[rgb(var(--accent-rgb)/.06)]'
                        }`}
                      >
                        <span className="truncate">{t.label}</span>
                        {t.label === topic && <IconCheck size={14} className="shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="tl-head block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-2">Email для ответа *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="you@example.com"
              className="tl-field"
            />
          </div>

          <div>
            <label className="tl-head block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-2">Описание проблемы *</label>
            <textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="Опишите, что произошло, и приложите шаги для воспроизведения..."
              className="tl-field resize-none"
            />
            <p className="tl-head text-right text-[10px] font-bold text-[var(--muted-2)] mt-1.5">{message.length} / 2000</p>
          </div>

          {formError && (
            <div className="tl-warnrow">
              <span className="t">{formError}</span>
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={sending}
            className="tl-btn solid block"
          >
            <IconSend size={16} /> {sending ? 'Отправляем...' : 'Отправить обращение'}
          </button>
        </div>
      </>
    )}
  </div>
);
