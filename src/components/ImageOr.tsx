import { useState, type ReactNode } from 'react';

/** Картинка с заменой: пустая или битая ссылка показывает fallback, а не значок браузера. */
export default function ImageOr({ src, className, fallback }: {
  src?: string;
  className: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return <img src={src} alt="" loading="lazy" decoding="async" className={className} onError={() => setFailed(src)} />;
}
