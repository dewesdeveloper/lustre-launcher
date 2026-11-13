import { WifiOff, RefreshCw } from 'lucide-react';
import { useConnectivity } from '../context/ConnectivityContext';

export default function OfflineBadge() {
  const { offline, checking, manualOffline, checkNow } = useConnectivity();
  if (!offline) return null;

  return (
    <button
      onClick={() => { if (!manualOffline) checkNow(); }}
      title={manualOffline ? 'Включён автономный режим' : 'Нет связи с сервером'}
      className="flex items-center gap-1.5 h-6 px-2.5 mr-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-colors cursor-pointer"
    >
      {checking ? <RefreshCw size={11} className="animate-spin" /> : <WifiOff size={11} />}
      Оффлайн
    </button>
  );
}
