import React, { useState } from 'react';
import { ShieldCheck, User as UserIcon, Lock, Mail, ChevronRight, AlertCircle, Info } from 'lucide-react';
import { User } from '../types';
import { apiUrl } from '../config/api';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'APPLICANT'>('APPLICANT');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister 
      ? { name, email, password, role } 
      : { email, password };

    try {
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Authentication failed');
      }
      onLoginSuccess(result.data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetLogin = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setIsRegister(false);
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8" id="login-container">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-100" id="login-card">
        <div>
          <div className="flex justify-center" id="logo-wrapper">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <ShieldCheck className="h-10 w-10" id="shield-icon" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900" id="login-header">
            {isRegister ? 'Create your account' : 'Sign in to Assessment'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-500" id="login-subheader">
            {isRegister ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
              }}
              className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer"
              id="toggle-auth-mode"
            >
              {isRegister ? 'Sign in instead' : 'Register as applicant'}
            </button>
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm" id="auth-error">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} id="auth-form">
          <div className="space-y-4 rounded-md shadow-sm" id="form-fields">
            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <UserIcon className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Alex Rivera"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Mail className="h-5 w-5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="alex@assessment.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Lock className="h-5 w-5" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Role</label>
                <div className="grid grid-cols-2 gap-3" id="role-selector">
                  <button
                    type="button"
                    onClick={() => setRole('APPLICANT')}
                    className={`py-2 px-4 rounded-xl border text-sm font-medium text-center cursor-pointer ${
                      role === 'APPLICANT'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Applicant
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('ADMIN')}
                    className={`py-2 px-4 rounded-xl border text-sm font-medium text-center cursor-pointer ${
                      role === 'ADMIN'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 cursor-pointer transition-colors"
              id="submit-auth-btn"
            >
              {loading ? 'Authenticating...' : isRegister ? 'Register' : 'Sign In'}
              <ChevronRight className="ml-2 h-5 w-5 text-blue-200 group-hover:text-white transition-colors" />
            </button>
          </div>
        </form>

        <div className="pt-6 border-t border-gray-100" id="preset-accounts-panel">
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            <Info className="h-4 w-4 text-gray-400" />
            <span>Developer Sandbox Presets</span>
          </div>
          <div className="space-y-2.5" id="preset-buttons">
            <button
              onClick={() => handlePresetLogin('admin@assessment.com', 'admin123')}
              className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left cursor-pointer transition-colors"
              id="login-preset-admin"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">Admin Portal Demo</p>
                <p className="text-xs text-slate-500">Manage assessments, play recordings, AI Grade</p>
              </div>
              <span className="text-xs font-mono bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md">admin123</span>
            </button>

            <button
              onClick={() => handlePresetLogin('alex@assessment.com', 'alex123')}
              className="w-full flex items-center justify-between p-3 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded-xl text-left cursor-pointer transition-colors"
              id="login-preset-applicant"
            >
              <div>
                <p className="text-sm font-medium text-blue-900">Applicant Portal Demo (Alex)</p>
                <p className="text-xs text-blue-600">Take evaluation, screen recording, autosave</p>
              </div>
              <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md">alex123</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
