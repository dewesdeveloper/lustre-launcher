import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { inputClasses } from './inputClasses'

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${inputClasses} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[#6b7280] transition-colors hover:text-white"
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  )
}
