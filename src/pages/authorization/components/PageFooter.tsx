import { Link } from 'react-router-dom';

export function PageFooter() {
  return (
    <footer className="flex items-center justify-between px-8 py-6 tl-term text-[13px] tl-muted">
      <span>© 2026 Lustre</span>
      <div className="flex gap-8">
        <Link to="/privacy" className="transition-colors hover:text-white">
          Пользовательское соглашение
        </Link>
        <Link to="/support" className="transition-colors hover:text-white">
          Поддержка
        </Link>
      </div>
    </footer>
  )
}
