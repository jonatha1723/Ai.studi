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
