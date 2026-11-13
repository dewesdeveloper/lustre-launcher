import type { InputHTMLAttributes } from 'react'
import { inputClasses } from './inputClasses'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />
}
