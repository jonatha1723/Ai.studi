/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import VaultSetup from './components/VaultSetup';
import VaultUnlock from './components/VaultUnlock';
import Gallery from './components/Gallery';
import ErrorBoundary from './components/ErrorBoundary';
import PrivacyScreen from './components/PrivacyScreen';
import { Loader2, Download } from 'lucide-react';

function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstalled, setIsInstalled] = React.useState(false);

  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('App is installable as a real PWA!');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('App was installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled || !deferredPrompt) return null;

  return (
    <button
      onClick={async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            setDeferredPrompt(null);
          }
        }
      }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 font-medium animate-bounce"
    >
      <Download className="w-5 h-5" />
      Instalar Aplicativo
    </button>
  );
}

function AppContent() {
  const { user, isAuthReady, needsSetup, cryptoKey } = useAuth();

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <InstallButton />
      {!user ? (
        <Login />
      ) : needsSetup ? (
        <VaultSetup />
      ) : !cryptoKey ? (
        <VaultUnlock />
      ) : (
        <Gallery />
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PrivacyScreen />
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
