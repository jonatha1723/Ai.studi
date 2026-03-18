import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function PrivacyScreen() {
  const { cryptoKey } = useAuth();

  useEffect(() => {
    // Cria o elemento de overlay diretamente no DOM para garantir
    // que ele apareça de forma síncrona, sem o atraso de renderização do React.
    // Isso é crucial para que o OS (iOS/Android) tire o print do app switcher
    // *depois* que a tela já estiver coberta.
    const overlay = document.createElement('div');
    overlay.id = 'privacy-overlay-native';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = '#09090b'; // zinc-950
    overlay.style.zIndex = '999999';
    overlay.style.display = 'none';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = '#f4f4f5'; // zinc-100
    
    overlay.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 24px;">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
        <path d="M12 8v4"/>
        <path d="M12 16h.01"/>
      </svg>
      <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 8px; font-family: system-ui, -apple-system, sans-serif;">Modo Privacidade</h2>
      <p style="color: #a1a1aa; text-align: center; max-width: 320px; font-family: system-ui, -apple-system, sans-serif; padding: 0 24px;">
        O conteúdo do cofre foi ocultado para sua segurança.
      </p>
    `;

    document.body.appendChild(overlay);

    const checkPrivacy = () => localStorage.getItem('privacyMode') === 'true';

    const handleHide = () => {
      // Só oculta se o modo estiver ativo e o cofre estiver destrancado
      if (checkPrivacy() && cryptoKey) {
        overlay.style.display = 'flex';
      }
    };

    const handleShow = () => {
      overlay.style.display = 'none';
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleHide();
      } else {
        handleShow();
      }
    };

    // Eventos padrão
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleHide);
    window.addEventListener('focus', handleShow);
    window.addEventListener('pagehide', handleHide);
    window.addEventListener('pageshow', handleShow);
    
    // Eventos específicos Mobile/WebView
    document.addEventListener('pause', handleHide, false);
    document.addEventListener('resume', handleShow, false);
    
    // Evento específico Safari iOS
    document.addEventListener('webkitvisibilitychange', handleVisibilityChange as any);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleHide);
      window.removeEventListener('focus', handleShow);
      window.removeEventListener('pagehide', handleHide);
      window.removeEventListener('pageshow', handleShow);
      document.removeEventListener('pause', handleHide);
      document.removeEventListener('resume', handleShow);
      document.removeEventListener('webkitvisibilitychange', handleVisibilityChange as any);
      
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    };
  }, [cryptoKey]);

  return null; // O componente React em si não renderiza nada, apenas gerencia o DOM nativo
}
