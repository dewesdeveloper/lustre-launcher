import type { ReactNode } from 'react';

interface GlitchCheckboxProps {
  /** Отмечен ли чекбокс */
  checked: boolean;
  /** Изменение состояния */
  onChange: (checked: boolean) => void;
  /** Текст подписи. Верхний регистр задаётся стилями, дублируется в data-text для глитча */
  label: string;
  /** Ссылки на документы — рендерятся отдельной строкой под подписью */
  links?: ReactNode;
  disabled?: boolean;
  id?: string;
  /** Подсветить: пытались продолжить, не отметив пункт */
  attention?: boolean;
}

/**
 * Глитч-чекбокс в стилистике лаунчера: рамка и галочка акцентом, при наведении
 * подпись «разъезжается» на вторичный и акцентный цвета.
 * Ставится внутрь `.glitch-checkbox-wrapper` (как в исходном стиле).
 */
export function GlitchCheckbox({ checked, onChange, label, links, disabled, id, attention }: GlitchCheckboxProps) {
  return (
    <div className={`glitch-checkbox-item ${attention && !checked ? 'needs-attention' : ''}`}>
      <label className="glitch-checkbox-container" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={attention && !checked ? true : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="checkbox-box">
          <div className="checkbox-mark" />
        </div>
        <span className="checkbox-label" data-text={label}>{label}</span>
      </label>
      {links && <div className="glitch-checkbox-links">{links}</div>}
    </div>
  );
}

export default GlitchCheckbox;
