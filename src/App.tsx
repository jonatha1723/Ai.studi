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
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

function AppContent() {
  const { user, isAuthReady, needsSetup, cryptoKey } = useAuth();

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-white/5 blur-[100px] rounded-full" />
        
        <div className="relative">
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 blur-xl bg-white/30 rounded-full"
          />
          <Loader2 className="w-10 h-10 text-white animate-spin relative z-10" strokeWidth={1.5} />
        </div>
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
