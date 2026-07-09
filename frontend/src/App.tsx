import React, { useState, useEffect } from 'react';
import { Loader2, ShieldAlert, LogOut, ArrowLeft } from 'lucide-react';
import AdminLogin from './components/AdminLogin';
import ApplicantAuth from './components/ApplicantAuth';
import AdminPortal from './components/AdminPortal';
import ApplicantPortal from './components/ApplicantPortal';
import { User } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Simple routing state
  const [routeInfo, setRouteInfo] = useState({
    pathname: window.location.pathname,
    hash: window.location.hash,
    search: window.location.search
  });

  // Track popstate/hashchange to drive reactive routing
  useEffect(() => {
    const handleLocationChange = () => {
      setRouteInfo({
        pathname: window.location.pathname,
        hash: window.location.hash,
        search: window.location.search
      });
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // Restore session from localStorage on load
  useEffect(() => {
    const restoreSession = async () => {
      const storedUserId = localStorage.getItem('assessment_user_id');
      if (storedUserId) {
        try {
          const res = await fetch(`/api/auth/me?userId=${storedUserId}`);
          const data = await res.json();
          if (data.success) {
            setCurrentUser(data.data);
          } else {
            localStorage.removeItem('assessment_user_id');
          }
        } catch (err) {
          console.error("Error restoring session:", err);
        }
      }
      setLoading(false);
    };

    restoreSession();
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('assessment_user_id', user.id);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('assessment_user_id');
    // Direct back to home or relevant portal route cleanly
    if (isAdminRoute) {
      navigateTo('/admin/login');
    } else {
      navigateTo('/');
    }
  };

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event('popstate'));
  };

  // Route Detections
  const isAdminRoute = 
    routeInfo.pathname === '/admin' || 
    routeInfo.pathname === '/admin/login' || 
    routeInfo.pathname.startsWith('/admin/') || 
    routeInfo.hash.startsWith('#admin');

  // Extract invite token from invite/token URL structures
  let inviteToken = '';
  if (routeInfo.pathname.startsWith('/invite/')) {
    inviteToken = routeInfo.pathname.split('/invite/')[1]?.split('/')[0] || '';
  } else if (routeInfo.hash.startsWith('#invite/')) {
    inviteToken = routeInfo.hash.split('#invite/')[1]?.split('/')[0] || '';
  } else {
    const params = new URLSearchParams(routeInfo.search);
    inviteToken = params.get('invite') || params.get('token') || '';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-brand-green mx-auto" />
          <p className="text-sm font-semibold text-gray-500 font-sans">Connecting to Assessment Center...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // ROUTING RENDER LOGIC
  // ==========================================

  // 1. ADMIN ROUTE VIEW
  if (isAdminRoute) {
    if (!currentUser) {
      return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
    }

    if (currentUser.role !== 'ADMIN') {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" id="unauthorized-admin-view">
          <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700/50 text-center space-y-6">
            <div className="p-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-2xl inline-block">
              <ShieldAlert className="h-10 w-10" />
            </div>
            <h2 className="text-xl font-bold text-white">Access Restricted</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              You are currently authenticated as an applicant. To enter the Admin Control Center, you must log out first.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => navigateTo('/')}
                className="flex-1 py-3 border border-slate-700 text-slate-300 hover:bg-slate-700/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" /> Go to Test
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <AdminPortal adminUser={currentUser} onLogout={handleLogout} />;
  }

  // 2. APPLICANT / INVITATION ROUTE VIEW
  if (!currentUser) {
    // If entering through invite link, prioritize Registration.
    // If accessing the general root, default to Login.
    const initialMode = inviteToken ? 'register' : 'login';
    return (
      <ApplicantAuth 
        inviteToken={inviteToken || undefined} 
        initialMode={initialMode} 
        onLoginSuccess={handleLoginSuccess} 
      />
    );
  }

  // If logged in as ADMIN but accessing applicant area, gracefully redirect them or render the AdminPortal
  if (currentUser.role === 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" id="admin-on-applicant-view">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-6">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl inline-block">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 font-sans">Admin Session Detected</h2>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">
            You are logged in as an Administrator. To manage candidates and evaluations, navigate to the Control Panel.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleLogout}
              className="flex-1 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
            <button
              onClick={() => navigateTo('/admin/login')}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Control Panel <ArrowLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Regular Applicant Portal for authenticated candidates
  return <ApplicantPortal applicantUser={currentUser} onLogout={handleLogout} />;
}
