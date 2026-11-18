import { Link } from 'react-router-dom';
import OfficialLinks from '../../../components/OfficialLinks';

export function PageFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 px-8 py-6 tl-term text-[13px] tl-muted">
      <span>© 2026 Lustre</span>
      <OfficialLinks />
      <div className="flex gap-8">
        <Link to="/terms" className="transition-colors hover:text-white">
          Пользовательское соглашение
        </Link>
        <Link to="/privacy" className="transition-colors hover:text-white">
          Конфиденциальность
        </Link>
        <Link to="/support" className="transition-colors hover:text-white">
          Поддержка
        </Link>
      </div>
    </footer>
  )
}
