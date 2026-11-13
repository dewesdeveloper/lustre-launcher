import { IconX } from '@tabler/icons-react';
import CharCounter from '../../../components/CharCounter';

const TITLE_MAX = 200;
const TEXT_MAX = 10000;

type DiscussionComposerProps = {
  postTitle: string;
  postContent: string;
  postError: string;
  submitting: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

/** Форма нового обсуждения внутри сообщества. */
export default function DiscussionComposer(props: DiscussionComposerProps) {
  const { postTitle, postContent, postError, submitting } = props;
  return (
    <section className="tl-panel space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="tl-sec-head mb-0! mr-4 flex-1">
          <span className="bar" />
          <h2>Новое обсуждение</h2>
          <span className="line" />
        </div>
        <button type="button" onClick={props.onClose} className="tl-btn ghost" aria-label="Закрыть"><IconX size={14} /></button>
      </div>

      <input value={postTitle} maxLength={TITLE_MAX} onChange={(e) => props.onTitleChange(e.target.value)} placeholder="Заголовок обсуждения *" className="tl-field" />
      <CharCounter value={postTitle} max={TITLE_MAX} className="-mt-1" />
      <textarea rows={4} value={postContent} maxLength={TEXT_MAX} onChange={(e) => props.onContentChange(e.target.value)} placeholder="О чём хотите поговорить?" className="tl-field resize-none" />
      <CharCounter value={postContent} max={TEXT_MAX} className="-mt-1" />

      {postError && <div className="tl-warnrow mb-0!"><span className="t">{postError}</span></div>}

      <button type="button" onClick={props.onSubmit} disabled={submitting} className="tl-btn solid block">
        {submitting ? 'Публикуем...' : 'Опубликовать'}
      </button>
    </section>
  );
}
