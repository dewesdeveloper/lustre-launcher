import { useNavigate } from 'react-router-dom';

// Ссылки из окна настроек должны открываться в главном окне Electron,
// а не внутри окна настроек (в браузерном режиме — обычная навигация)
export function useOpenPath() {
  const navigate = useNavigate();
  return (route: string) => {
    const electron = (window as any).electron;
    if (electron?.openInMain) electron.openInMain(route);
    else navigate(route);
  };
}
