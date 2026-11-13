import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type DialogOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  tone?: 'info' | 'success';
};

interface ActiveDialog extends DialogOptions {
  type: 'confirm' | 'alert';
  resolve: (v: boolean) => void;
}

interface DialogContextType {
  confirm: (opts: DialogOptions | string) => Promise<boolean>;
  alert: (opts: DialogOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | null>(null);

const normalize = (opts: DialogOptions | string): DialogOptions =>
  typeof opts === 'string' ? { message: opts } : opts;

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);

  const open = useCallback((type: 'confirm' | 'alert', opts: DialogOptions | string) => {
    const normalized = normalize(opts);
    return new Promise<boolean>((resolve) => {
      setDialog(prev => {
        prev?.resolve(false);
        return { type, ...normalized, resolve };
      });
    });
  }, []);

  const confirm = useCallback((opts: DialogOptions | string) => open('confirm', opts), [open]);
  const alert = useCallback(async (opts: DialogOptions | string) => {
    await open('alert', opts);
  }, [open]);

  const finish = (result: boolean) => {
    setDialog(prev => { prev?.resolve(result); return null; });
  };

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  const iconTone = dialog?.danger
    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
    : dialog?.tone === 'success'
      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
      : 'bg-violet/10 border border-violet/30 text-violet';

  const Icon = dialog?.danger ? AlertTriangle : dialog?.tone === 'success' ? CheckCircle2 : Info;

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      <AnimatePresence>
        {dialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={() => finish(false)}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, y: 14, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 8, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] bg-[#131018] border border-violet/20 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
            >
              <div className="p-6 flex gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconTone}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  {dialog.title && (
                    <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-pearl mb-1.5">{dialog.title}</h3>
                  )}
                  <p className="text-sm text-pearl/60 leading-relaxed break-words">{dialog.message}</p>
                </div>
              </div>

              <div className="flex gap-2 px-6 pb-6">
                {dialog.type === 'confirm' && (
                  <button
                    onClick={() => finish(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-pearl/60 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-pearl transition-all active:scale-95"
                  >
                    {dialog.cancelText || 'Отмена'}
                  </button>
                )}
                <button
                  autoFocus
                  onClick={() => finish(true)}
                  className={`flex-1 py-2.5 rounded-xl text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${dialog.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-accent hover:bg-accent/80'}`}
                >
                  {dialog.confirmText || (dialog.type === 'alert' ? 'ОК' : 'Подтвердить')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
