'use client';
import './Acceso.css';

export default function Acceso({ loginForm, setLoginForm, onSubmit, authError, bootError }) {
  const set = (key) => (ev) => setLoginForm((f) => ({ ...f, [key]: ev.target.value }));

  return (
    <div className="acceso-root">
      <div className="bg" />
      <div className="bg-tint" />
      <div className="acceso-stage">
        <div className="acceso-hero">
          <span className="hero-badge"><span className="dot" />Sistema de Gestión · Inmobiliaria</span>
          <h1>Tu CRM inmobiliario,<br /><em>todo en un lugar.</em></h1>
          <p>Gestioná propiedades, leads y tu equipo desde un panel centralizado con sincronización automática.</p>
        </div>

        <form className="login-card" onSubmit={onSubmit}>
          <div className="card-brand">
            <div className="card-brand-icon">CRM</div>
            <div>
              <div className="card-brand-text">Inmobiliaria</div>
              <div className="card-brand-sub">Panel de gestión</div>
            </div>
          </div>
          <h2>Bienvenido de nuevo</h2>
          <p className="card-lead">Ingresá para acceder al panel de gestión.</p>

          {bootError && <p className="error-msg">{bootError}</p>}

          <div className="acceso-fg">
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" placeholder="tu@inmobiliaria.com" value={loginForm.email} onChange={set('email')} autoComplete="email" />
          </div>
          <div className="acceso-fg">
            <label htmlFor="pass">Contraseña</label>
            <input id="pass" type="password" placeholder="••••••••" value={loginForm.password} onChange={set('password')} autoComplete="current-password" />
          </div>

          {authError && <p className="error-msg">{authError}</p>}

          <button className="enter-btn" type="submit">
            Ingresar al panel
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
          </button>
          <div className="card-foot">¿Necesitás acceso? Contactá al administrador.</div>
        </form>
      </div>
    </div>
  );
}
