import OfficialLinks, { DocLinks } from '../../../components/OfficialLinks';

export function PageFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 px-8 py-6 tl-term text-[13px] tl-muted">
      <span>© 2026 Lustre</span>
      <OfficialLinks />
      <DocLinks />
    </footer>
  )
}
