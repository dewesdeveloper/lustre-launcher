import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialog } from './Dialogs';

export interface ProUpgradeOffer {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * Всплывающее окно «нужна подписка Pro»: показывается, когда бесплатный
 * пользователь упёрся в лимит. При согласии ведёт на /subscriptions.
 */
export function useProUpgradeDialog() {
  const dlg = useDialog();
  const navigate = useNavigate();

  return useCallback(async (offer: ProUpgradeOffer) => {
    const go = await dlg.confirm({
      title: offer.title,
      message: offer.message,
      confirmText: offer.confirmText || 'К подписке Pro',
      cancelText: offer.cancelText || 'Не сейчас',
    });
    if (go) navigate('/subscriptions');
    return go;
  }, [dlg, navigate]);
}
