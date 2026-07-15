'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Acceso from '@/components/Acceso/Acceso';
import { getSession, login as apiLogin, setUnauthorizedHandler } from '@/services/api';

const CRM = dynamic(() => import('@/components/CRM/CRM'), { ssr: false });

export default function Page({ searchParams }) {
  const initialTab = searchParams?.tab || 'dashboard';
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
  }, []);

  useEffect(() => {
    let active = true;
    getSession()
      .then((result) => {
        if (!active) return;
        if (result?.online) setSession(result.user || result);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setBackendDown(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError('');
    const result = await apiLogin(loginForm.email, loginForm.password);
    if (!result) {
      setAuthError('No se pudo conectar con el servidor.');
      return;
    }
    const online = await getSession();
    if (online?.online) {
      setSession(online.user || online);
      return;
    }
    setAuthError('Credenciales incorrectas.');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f1f18' }}>
        <div style={{ textAlign: 'center', color: '#4fb78a' }}>
          <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>CRM</div>
          <div style={{ fontSize: 13, color: '#3d6b55' }}>Cargando…</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Acceso
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        onSubmit={handleLogin}
        authError={authError}
        bootError={backendDown ? 'El servidor no responde. Verificá que el backend esté corriendo.' : ''}
      />
    );
  }

  return <CRM session={session} onLogout={() => setSession(null)} initialTab={initialTab} />;
}
