'use client';

import { useEffect, useState } from 'react';
import Acceso from '@/components/Acceso/Acceso';
import Sidebar from '@/components/Sidebar/Sidebar';
import PropertyDetail from '@/components/Propiedades/PropertyDetail';
import { getSession, login as apiLogin, logout as apiLogout, getPropertyById, setUnauthorizedHandler } from '@/services/api';
import '@/components/CRM/CRM.css';
import './page.css';

export default function PropertyPage({ params }) {
  const { id } = params;
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [property, setProperty] = useState(null);
  const [propLoading, setPropLoading] = useState(true);
  const [propError, setPropError] = useState('');
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
  }, []);

  useEffect(() => {
    setCanClose(typeof window !== 'undefined' && !!window.opener);
  }, []);

  useEffect(() => {
    let active = true;
    getSession()
      .then((result) => {
        if (!active) return;
        if (result?.online) setSession(result.user || result);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setBackendDown(true);
        setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setPropLoading(true);
    setPropError('');
    getPropertyById(id)
      .then((data) => {
        if (!active) return;
        if (!data) setPropError('not-found');
        else setProperty(data);
      })
      .catch((err) => {
        if (!active) return;
        setPropError(err?.message || 'No se pudo cargar la propiedad.');
      })
      .finally(() => { if (active) setPropLoading(false); });
    return () => { active = false; };
  }, [session, id]);

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

  function goToPanel() {
    window.location.href = '/';
  }

  function goToTab(key) {
    window.location.href = key === 'dashboard' ? '/' : `/?tab=${key}`;
  }

  async function handleLogout() {
    await apiLogout();
    window.location.href = '/';
  }

  function closeTab() {
    window.close();
  }

  if (authLoading) {
    return (
      <div className="prop-page-status">
        <div className="prop-page-brand">CRM</div>
        <div className="prop-page-status-text">Cargando…</div>
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

  if (propLoading) {
    return (
      <div className="prop-page-status">
        <div className="prop-page-brand">CRM</div>
        <div className="prop-page-status-text">Cargando propiedad…</div>
      </div>
    );
  }

  if (propError) {
    const notFound = propError === 'not-found';
    return (
      <div className="prop-page-status">
        <div className="prop-page-brand">CRM</div>
        <h2>{notFound ? 'Propiedad no encontrada' : 'No se pudo cargar la propiedad'}</h2>
        <p>{notFound ? `No existe ninguna propiedad con el ID ${id}.` : propError}</p>
        <button className="btn primary sm" onClick={goToPanel}>Ir al panel</button>
      </div>
    );
  }

  return (
    <div className="crm-root">
      <Sidebar tab="propiedades" setTab={goToTab} session={session} onLogout={handleLogout} />
      <main className="crm-main">
        <PropertyDetail property={property} onBack={goToPanel} onClose={closeTab} canClose={canClose} />
      </main>
    </div>
  );
}
