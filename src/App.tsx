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
import LoadingScreen from './components/LoadingScreen';

function AppContent() {
  const { user, isAuthReady, needsSetup, cryptoKey } = useAuth();

  if (!isAuthReady) {
    return <LoadingScreen />;
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
