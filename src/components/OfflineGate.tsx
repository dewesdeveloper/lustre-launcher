import type { ReactNode } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useConnectivity } from '../context/ConnectivityContext';
import OfflineArcade from './arcade/OfflineArcade';

export function OfflineNotice() {
  const { manualOffline, checking, checkNow, setManualOffline } = useConnectivity();

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center text-center px-8 py-8 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
        <WifiOff size={28} />
      </div>
      <h2 className="text-xl font-black text-white uppercase tracking-tight">
        Недоступно в автономном режиме
      </h2>
      <p className="text-sm text-pearl/70 max-w-sm leading-relaxed">
        {manualOffline
          ? 'Включён автономный режим. Отключите его, чтобы пользоваться этой функцией.'
          : 'Нет связи с сервером. Проверьте подключение к интернету и повторите.'}
      </p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={() => checkNow()}
          disabled={checking || manualOffline}
          className="px-5 py-2.5 rounded-xl bg-accent text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 flex items-center gap-2"
        >
          {checking ? <RefreshCw size={12} className="animate-spin" /> : null}
          Повторить подключение
        </button>
        {manualOffline && (
          <button
            onClick={() => setManualOffline(false)}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-pearl/70 text-[10px] font-black uppercase tracking-widest hover:text-pearl hover:bg-white/10 transition-all"
          >
            Отключить автономный режим
          </button>
        )}
      </div>
      <div className="mt-4 w-full flex justify-center">
        <OfflineArcade />
      </div>
    </div>
  );
}

export function OfflineGate({ children }: { children: ReactNode }) {
  const { offline } = useConnectivity();
  if (!offline) return <>{children}</>;
  return <OfflineNotice />;
}
