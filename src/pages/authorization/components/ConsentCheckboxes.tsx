import { useEffect } from 'react';
import GlitchCheckbox from '../../../components/GlitchCheckbox';
import { Link } from 'react-router-dom';

export interface ConsentState {
  terms: boolean;
  privacy: boolean;
}

interface ConsentCheckboxesProps {
  value: ConsentState;
  onChange: (value: ConsentState) => void;
  disabled?: boolean;
  /** Префикс id, чтобы не задублировать на страницах входа и регистрации */
  idPrefix?: string;
  /** Счётчик попыток продолжить без согласия: каждое изменение заново подсвечивает
   *  и встряхивает неотмеченные пункты и переводит на них фокус (вместо текста ошибки) */
  nudge?: number;
}

/**
 * Согласие на страницах авторизации: отдельный чекбокс на пользовательское
 * соглашение и на политику конфиденциальности. Оба обязательны.
 */
export function ConsentCheckboxes({ value, onChange, disabled, idPrefix = 'consent', nudge = 0 }: ConsentCheckboxesProps) {
  useEffect(() => {
    if (!nudge) return;
    const first = !value.terms ? 'terms' : !value.privacy ? 'privacy' : null;
    if (first) document.getElementById(`${idPrefix}-${first}`)?.focus();
    // фокус — только в момент новой попытки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudge]);

  return (
    // key: при каждой попытке анимация встряхивания запускается заново
    <div className="glitch-checkbox-wrapper" key={nudge}>
      <GlitchCheckbox
        id={`${idPrefix}-terms`}
        checked={value.terms}
        onChange={(terms) => onChange({ ...value, terms })}
        disabled={disabled}
        attention={nudge > 0}
        label="Согласен с пользовательским соглашением"
        links={<Link to="/legal">Пользовательское соглашение</Link>}
      />
      <GlitchCheckbox
        id={`${idPrefix}-privacy`}
        checked={value.privacy}
        onChange={(privacy) => onChange({ ...value, privacy })}
        disabled={disabled}
        attention={nudge > 0}
        label="Согласен с политикой конфиденциальности"
        links={<Link to="/privacy">Политика конфиденциальности</Link>}
      />
    </div>
  );
}

/** Все согласия получены */
export const consentGiven = (v: ConsentState) => v.terms && v.privacy;

export default ConsentCheckboxes;
