import type { ReactNode } from 'react'
import { PageFooter } from './components/PageFooter'
import { PreviewPanel } from './components/PreviewPanel'
import { WindowControls } from '../navigation/components/WindowControls'
import { isElectron } from '../../App'

export { SocialButton, SocialButtons } from './components/SocialButtons'
export { OrDivider } from './components/OrDivider'
export { TextInput } from './components/TextInput'
export { PasswordInput } from './components/PasswordInput'
export { PrimaryButton } from './components/PrimaryButton'
export { FormHeader } from './components/FormHeader'
export { BottomLink } from './components/BottomLink'
export { Stars } from './components/Stars'
export { PageFooter } from './components/PageFooter'
export { PreviewPanel } from './components/PreviewPanel'
export { ConsentCheckboxes, consentGiven, type ConsentState } from './components/ConsentCheckboxes'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-main-bg relative">
      {/* Фон в стиле TL-интерфейса (сетка, как на остальных страницах) */}
      <div className="tl-grid-bg" aria-hidden />

      {/* Перетаскивание окна: страницы входа рендерятся вне MainLayout,
          поэтому у них нет Navbar с appRegion:drag — добавляем полосу-захват. */}
      <div
        className="fixed top-0 left-0 right-0 h-11 z-40"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        aria-hidden
      />

      {/* Окно без рамки (frame:false), а Navbar на страницах входа нет —
          поэтому кнопки свернуть/развернуть/закрыть дублируем здесь. */}
      {isElectron && (
        <div
          className="fixed top-0 right-0 z-50 h-11 flex items-stretch"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <WindowControls />
        </div>
      )}

      <div className="flex flex-1 flex-col relative z-10 min-w-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex min-h-full items-center justify-center px-6 pt-12 pb-6">
            <div className="w-full max-w-[380px]">{children}</div>
          </div>
        </div>
        <PageFooter />
      </div>
      <PreviewPanel />
    </div>
  )
}
