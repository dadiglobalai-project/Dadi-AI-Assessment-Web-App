import React, { useState, useEffect } from 'react';
import { UserCheck, Shield, Mail, Lock, User as UserIcon, ArrowRight, AlertCircle, Loader2, ClipboardList } from 'lucide-react';
import { User } from '../types';
import { apiUrl } from '../config/api';

interface ApplicantAuthProps {
  inviteToken?: string;
  initialMode?: 'register' | 'login';
  onLoginSuccess: (user: User) => void;
}

export default function ApplicantAuth({ inviteToken, initialMode = 'register', onLoginSuccess }: ApplicantAuthProps) {
  const [isRegister, setIsRegister] = useState(initialMode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [appliedRoleId, setAppliedRoleId] = useState('');
  const [roles, setRoles] = useState<{ id: string, role_name: string, description?: string }[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  
  // Invitation validation states
  const [invitationValidating, setInvitationValidating] = useState(!!inviteToken);
  const [invitationDetails, setInvitationDetails] = useState<{ id: string, title: string, timeLimitMinutes: number, role_id?: string, role_name?: string } | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch roles list for registration dropdown
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setRolesLoading(true);
        setRolesError(null);
        const res = await fetch(apiUrl('/api/roles'), { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok || !data.success || !Array.isArray(data.data)) {
          throw new Error(data.message || 'Unable to load available positions.');
        }

        const activeRoles = data.data.filter((r: any) => r.status !== 'INACTIVE');
        setRoles(activeRoles);

        if (activeRoles.length === 0) {
          setRolesError('No active positions are available right now. Please contact the hiring coordinator.');
        }
      } catch (err) {
        console.error("Error fetching roles:", err);
        setRoles([]);
        setRolesError(err instanceof Error ? err.message : 'Unable to load positions. Please refresh the page or contact support.');
      } finally {
        setRolesLoading(false);
      }
    };
    fetchRoles();
  }, []);

  // Validate invitation token on load
  useEffect(() => {
    if (inviteToken) {
      validateToken();
    }
  }, [inviteToken]);

  // Set role automatically from invitation details
  useEffect(() => {
    if (invitationDetails && invitationDetails.role_id) {
      setAppliedRoleId(invitationDetails.role_id);
    }
  }, [invitationDetails]);

  const validateToken = async () => {
    try {
      setInvitationValidating(true);
      setInvitationError(null);
      const res = await fetch(apiUrl(`/api/invite/validate?token=${inviteToken}`));
      const result = await res.json();
      
      if (result.success) {
        setInvitationDetails(result.data);
        // Automatically default to register if token is valid and they don't have an account yet
        setIsRegister(initialMode === 'register');
      } else {
        setInvitationError(result.message || 'The invitation link is invalid or has expired.');
      }
    } catch (err) {
      setInvitationError('Failed to verify invitation. Please check your network connection.');
    } finally {
      setInvitationValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (!appliedRoleId) {
        setError("Please select the Role / Position Applied For");
        return;
      }
    }

    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister 
      ? { name, email, password, role: 'APPLICANT', inviteToken, appliedRoleId } 
      : { email, password, requiredRole: 'APPLICANT' };

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



  if (invitationValidating) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-brand-green mx-auto" />
          <p className="text-sm font-semibold text-gray-500">Securing invitation context...</p>
        </div>
      </div>
    );
  }

  if (invitationError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12" id="invite-error-container">
        <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-sm border border-red-100 text-center">
          <div className="p-3 bg-red-50 text-red-600 rounded-2xl inline-block">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Access Restricted</h2>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">{invitationError}</p>
          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">Please contact the hiring coordinator or administrator who sent you the evaluation link.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8" id="applicant-auth-container">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-100" id="applicant-auth-card">
        <div>
          <div className="flex justify-center" id="applicant-logo-wrapper">
            <div className="p-3 bg-brand-green/10 text-brand-green rounded-2xl">
              <ClipboardList className="h-10 w-10" />
            </div>
          </div>
          
          <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-gray-900 animate-in fade-in duration-300" id="applicant-auth-header">
            {isRegister ? 'Register Candidate Profile' : 'Candidate Assessment Sign In'}
          </h2>

          {invitationDetails && (
            <div className="mt-4 p-3.5 bg-brand-green/5 border border-brand-green/20 rounded-xl text-center space-y-0.5" id="assessment-details-badge">
              <span className="text-[10px] font-bold text-brand-green uppercase tracking-wider">Invitation Assigned</span>
              <p className="text-sm font-bold text-gray-900 leading-snug">{invitationDetails.title}</p>
              <p className="text-xs text-brand-green font-medium">Evaluation Duration: {invitationDetails.timeLimitMinutes} Minutes</p>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-gray-500" id="applicant-auth-subheader">
            {isRegister ? 'Already registered for this evaluation? ' : "Don't have an applicant account yet? "}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
              }}
              className="font-semibold text-brand-green hover:text-brand-green/80 cursor-pointer transition-colors"
              id="toggle-auth-mode"
            >
              {isRegister ? 'Sign in here' : 'Register now'}
            </button>
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm" id="applicant-auth-error-banner">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit} id="applicant-auth-form">
          <div className="space-y-4 rounded-md shadow-sm" id="form-fields">
            {isRegister && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <UserIcon className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green text-sm font-medium transition-all"
                    placeholder="Alex Rivera"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <Mail className="h-4.5 w-4.5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green text-sm font-medium transition-all"
                  placeholder="alex@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <Lock className="h-4.5 w-4.5" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green text-sm font-medium transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Confirm Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <Lock className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green text-sm font-medium transition-all"
                    placeholder="••••••••"
                    id="confirm-password-input"
                  />
                </div>
              </div>
            )}

            {isRegister && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Role / Position Applied For</label>
                <div className="relative">
                  <select
                    required
                    value={appliedRoleId}
                    onChange={(e) => setAppliedRoleId(e.target.value)}
                    disabled={rolesLoading || !!rolesError || !!(invitationDetails && invitationDetails.role_id)}
                    className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green text-sm font-medium disabled:bg-gray-100 disabled:text-gray-500 cursor-pointer transition-all"
                    id="applied-role-select"
                  >
                    <option value="">
                      {rolesLoading ? 'Loading positions...' : 'Select a role / position...'}
                    </option>
                    {invitationDetails?.role_id && !roles.some(r => r.id === invitationDetails.role_id) && (
                      <option value={invitationDetails.role_id}>
                        {invitationDetails.role_name || 'Assigned position'}
                      </option>
                    )}
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.role_name}
                      </option>
                    ))}
                  </select>
                </div>
                {invitationDetails && invitationDetails.role_id && (
                  <p className="mt-1 text-[11px] text-gray-400 italic">
                    Role locked based on invitation link.
                  </p>
                )}
                {rolesError && !invitationDetails?.role_id && (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    {rolesError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-brand-green hover:bg-brand-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green disabled:bg-brand-green/50 cursor-pointer transition-all shadow-sm"
              id="submit-auth-btn"
            >
              {loading ? 'Processing...' : isRegister ? 'Register & Start' : 'Sign In to Assessment'}
              <ArrowRight className="ml-2 h-4.5 w-4.5 text-brand-yellow group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </form>


      </div>
    </div>
  );
}
