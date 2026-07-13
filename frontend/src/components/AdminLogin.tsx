import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { User } from '../types';
import { apiRequest } from '../config/api';

interface AdminLoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result: any = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, requiredRole: 'ADMIN' })
      });
      if (!result.success) {
        throw new Error(result.message || 'Authentication failed');
      }
      onLoginSuccess(result.data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetLogin = () => {
    setEmail('admin@assessment.com');
    setPassword('admin123');
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-12 sm:px-6 lg:px-8" id="admin-login-container">
      <div className="max-w-md w-full space-y-8 bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700/50" id="admin-login-card">
        <div>
          <div className="flex justify-center" id="admin-logo-wrapper">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 animate-pulse">
              <ShieldCheck className="h-10 w-10" id="admin-shield-icon" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-white font-sans" id="admin-login-header">
            Admin Control Center
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400" id="admin-login-subheader">
            Authorized Personnel Authentication Only
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-sm" id="admin-auth-error">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} id="admin-auth-form">
          <div className="space-y-4 rounded-md shadow-sm" id="admin-form-fields">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Administrator Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Mail className="h-4.5 w-4.5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-3 bg-slate-950/40 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="admin@assessment.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Secret Key / Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Lock className="h-4.5 w-4.5" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-3 bg-slate-950/40 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center items-center py-3.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-500/50 cursor-pointer transition-colors"
              id="admin-submit-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  Sign In to Control Panel
                  <ChevronRight className="ml-2 h-4.5 w-4.5 text-indigo-300 group-hover:text-white transition-all" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* <div className="pt-6 border-t border-slate-700/50" id="admin-preset-panel">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mb-3">Developer Credentials Preset</p>
          <button
            onClick={handlePresetLogin}
            className="w-full flex items-center justify-between p-3.5 bg-slate-900 hover:bg-slate-950 border border-slate-800 rounded-xl text-left cursor-pointer transition-all"
            id="admin-preset-fill"
          >
            <div>
              <p className="text-xs font-semibold text-slate-300">Quick-Fill Admin Preset</p>
              <p className="text-[11px] text-slate-500">Auto-fill verified admin credentials</p>
            </div>
            <span className="text-[11px] font-mono bg-slate-800 text-indigo-300 border border-slate-700/50 px-2.5 py-1 rounded-md">admin123</span>
          </button>
        </div> */}
      </div>
    </div>
  );
}
