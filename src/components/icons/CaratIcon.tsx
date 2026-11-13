// Иконка валюты лаунчера — «Плод изгнания».
// Векторная SVG-иллюстрация в палитре лаунчера:
// акцент #EB006A, второстепенный #8307DE, pearl #E7E4E4. Фона нет.
import appleUrl from '../../assets/currency/apple.svg';

type Props = {
  size?: number | string;
  className?: string;
};

export default function CaratIcon({ size = 14, className = '' }: Props) {
  return (
    <img
      src={appleUrl}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={`inline-block object-contain align-middle shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
