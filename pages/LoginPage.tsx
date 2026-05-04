import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { LogIn, User, Lock, AlertCircle } from 'lucide-react';
import { APP_VERSION, APP_NAME } from '../version';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    
    setError('');
    setIsSubmitting(true);
    
    const success = await login(username.trim(), password);
    
    if (!success) {
      setError('Credenciales incorrectas');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo / Marca */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-clay text-white mb-6 shadow-card">
            <span className="text-2xl font-light tracking-tighter">F</span>
          </div>
          <h1 className="text-xl font-semibold text-text tracking-tight">{APP_NAME}</h1>
          <p className="text-xs text-text-muted mt-2 font-medium tracking-widest uppercase">
            Gestión de Inventario
          </p>
        </div>

        {/* Form */}
        <div className="bg-surface rounded-xl shadow-elevated border border-border overflow-hidden">
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {/* Usuario */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Usuario
              </label>
              <div className="relative">
                <User 
                  size={16} 
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" 
                />
                <input
                  ref={inputRef}
                  type="text"
                  required
                  autoComplete="username"
                  className="pl-10"
                  placeholder="Ingresa tu usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock 
                  size={16} 
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" 
                />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="pl-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-brick-light/50 text-brick text-xs font-medium">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg
                         bg-clay text-white text-sm font-semibold tracking-wide
                         hover:bg-clay-dark active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-150"
            >
              {isSubmitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn size={16} />
              )}
              {isSubmitting ? 'Ingresando…' : 'Entrar'}
            </button>
          </form>

          {/* Footer */}
          <div className="px-8 py-4 bg-canvas border-t border-border flex items-center justify-between">
            <span className="text-[10px] text-text-muted font-mono tracking-wider">
              v{APP_VERSION}
            </span>
            <span className="text-[10px] text-text-muted">
              Facore &copy; {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
