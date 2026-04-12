import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const state = (this as any).state;
    const props = (this as any).props;

    if (state.hasError) {
      let errorMessage = 'Ocorreu um erro inesperado.';
      const errorMsg = state.error?.message?.toLowerCase() || '';

      if (errorMsg.includes('permission') || errorMsg.includes('insufficient')) {
        errorMessage = 'Você não tem permissão para realizar esta ação ou acessar estes dados.';
      } else if (errorMsg.includes('quota exceeded')) {
        errorMessage = 'Cota do banco de dados excedida. Tente novamente amanhã.';
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-zinc-900/50 border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-white/10 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/5">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Ops! Algo deu errado</h2>
            <p className="text-zinc-400 mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white text-black hover:bg-zinc-200 font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <RefreshCw size={20} />
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return props.children;
  }
}
