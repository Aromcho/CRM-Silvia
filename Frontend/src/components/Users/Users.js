'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import Avatar from '../UI/Avatar';
import { getUsers, registerUser, updateUser, changeUserPassword } from '@/services/api';
import './Users.css';

const e = React.createElement;
const { useState, useEffect, useCallback } = React;

const ROLE_OPTS = [
  { key: 'USER', label: 'Usuario' },
  { key: 'ADMIN', label: 'Administrador' },
  { key: 'SUPERADMIN', label: 'Super Admin' },
];
const ROLE_LABELS = Object.fromEntries(ROLE_OPTS.map((r) => [r.key, r.label]));

function NewUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', phoneNumber: '', role: 'USER' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.name || !form.email || !form.password) { setError('Nombre, email y contraseña son obligatorios.'); return; }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setSaving(true);
    setError('');
    try {
      const user = await registerUser(form);
      onCreated(user);
    } catch (err) {
      setError(err.message || 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  }

  return e('div', { className: 'user-modal-overlay', onClick: onClose },
    e('form', { className: 'user-modal', onClick: (ev) => ev.stopPropagation(), onSubmit: handleSubmit },
      e('div', { className: 'user-modal-head' },
        e('h2', null, 'Nuevo usuario'),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('div', { className: 'user-modal-body' },
        error && e('p', { className: 'error-msg' }, error),
        e('div', { className: 'user-form-row' },
          e('div', { className: 'field' }, e('label', null, 'Nombre *'), e('input', { value: form.name, onChange: set('name'), placeholder: 'Juan Pérez', autoFocus: true })),
          e('div', { className: 'field' }, e('label', null, 'Email *'), e('input', { type: 'email', value: form.email, onChange: set('email'), placeholder: 'juan@inmobiliaria.com' })),
        ),
        e('div', { className: 'user-form-row' },
          e('div', { className: 'field' }, e('label', null, 'Contraseña *'), e('input', { type: 'password', value: form.password, onChange: set('password'), placeholder: 'Mínimo 6 caracteres' })),
          e('div', { className: 'field' }, e('label', null, 'Teléfono'), e('input', { value: form.phoneNumber, onChange: set('phoneNumber') })),
        ),
        e('div', { className: 'field' },
          e('label', null, 'Rol'),
          e('select', { value: form.role, onChange: set('role') }, ROLE_OPTS.map((r) => e('option', { key: r.key, value: r.key }, r.label))),
        ),
        e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 } },
          e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, 'Cancelar'),
          e('button', { type: 'submit', className: 'btn primary sm', disabled: saving }, saving ? 'Creando…' : 'Crear usuario'),
        ),
      ),
    ),
  );
}

function UserModal({ user: initialUser, onClose, onUpdated, currentUserId }) {
  const [user, setUser] = useState(initialUser);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const isSelf = user._id === currentUserId;

  async function handleRoleChange(role) {
    setSaving(true);
    try {
      const updated = await updateUser(user._id, { role });
      setUser(updated);
      onUpdated(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setSaving(true);
    try {
      const updated = await updateUser(user._id, { active: !user.active });
      setUser(updated);
      onUpdated(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) { setPwMsg('Mínimo 6 caracteres.'); return; }
    setPwSaving(true);
    setPwMsg('');
    try {
      await changeUserPassword(user._id, newPassword);
      setPwMsg('Contraseña actualizada.');
      setNewPassword('');
    } catch (err) {
      setPwMsg(err.message || 'No se pudo actualizar.');
    } finally {
      setPwSaving(false);
    }
  }

  return e('div', { className: 'user-modal-overlay', onClick: onClose },
    e('div', { className: 'user-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'user-modal-head' },
        e('h2', null, user.name),
        e('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          e('span', { className: `role-badge role-${user.role}` }, ROLE_LABELS[user.role] || user.role),
          e('button', { className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
        ),
      ),
      e('div', { className: 'user-modal-body' },
        e('div', { className: 'user-info-row' }, e('span', { className: 'user-info-icon' }, e(Icons.Mail, { width: 14, height: 14 })), e('span', { className: 'user-info-label' }, 'Email'), e('span', { className: 'user-info-value' }, user.email)),
        user.phoneNumber && e('div', { className: 'user-info-row' }, e('span', { className: 'user-info-icon' }, e(Icons.Phone, { width: 14, height: 14 })), e('span', { className: 'user-info-label' }, 'Teléfono'), e('span', { className: 'user-info-value' }, user.phoneNumber)),

        e('div', { className: 'field', style: { marginTop: 14 } },
          e('label', null, 'Rol'),
          e('select', { value: user.role, disabled: saving || isSelf, onChange: (ev) => handleRoleChange(ev.target.value) },
            ROLE_OPTS.map((r) => e('option', { key: r.key, value: r.key }, r.label)),
          ),
          isSelf && e('div', { className: 'user-self-note' }, 'No podés cambiar tu propio rol.'),
        ),

        e('div', { className: 'user-active-row' },
          e('span', null, 'Cuenta activa'),
          e('button', {
            type: 'button', className: `user-toggle${user.active ? ' on' : ''}`, onClick: toggleActive,
            disabled: saving || isSelf, title: isSelf ? 'No podés desactivar tu propia cuenta' : (user.active ? 'Desactivar' : 'Activar'),
          }, e('span', { className: 'user-toggle-knob' })),
        ),

        e('div', { className: 'user-password-field' },
          e('label', null, 'Nueva contraseña'),
          e('div', { style: { display: 'flex', gap: 8 } },
            e('input', { type: 'password', value: newPassword, onChange: (ev) => setNewPassword(ev.target.value), placeholder: 'Mínimo 6 caracteres' }),
            e('button', { type: 'button', className: 'btn ghost sm', disabled: pwSaving || !newPassword, onClick: handleChangePassword }, pwSaving ? 'Guardando…' : 'Actualizar'),
          ),
          pwMsg && e('div', { className: 'user-pw-msg' }, pwMsg),
        ),
      ),
    ),
  );
}

export default function Users({ session }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function handleUpdated(updated) {
    setUsers((us) => us.map((u) => (u._id === updated._id ? updated : u)));
    setSelected((s) => (s && s._id === updated._id ? updated : s));
  }

  const filtered = search
    ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
    : users;

  return e('div', { className: 'users' },
    e('div', { className: 'users-toolbar' },
      e('div', { className: 'users-toolbar-left' },
        e('h1', null, 'Usuarios'),
        e('span', { className: 'users-count-pill' }, `${users.length} usuarios`),
      ),
      e('div', { style: { display: 'flex', gap: 8 } },
        e('div', { className: 'search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', {
            placeholder: 'Buscar por nombre o email…', value: search,
            onChange: (ev) => setSearch(ev.target.value), style: { width: 220 },
          }),
          search ? e('button', { className: 'search-clear', onClick: () => setSearch('') }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
        e('button', { className: 'btn primary sm', onClick: () => setShowNew(true) }, e(Icons.Plus, { width: 14, height: 14 }), 'Nuevo usuario'),
      ),
    ),

    e('div', { className: 'users-body' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando usuarios…')
        : filtered.length === 0
          ? e('div', { className: 'user-empty' }, e(Icons.Users, { width: 44, height: 44 }), e('p', null, 'No hay usuarios'))
          : e('div', { className: 'users-list' },
              filtered.map((u) => {
                return e('div', { key: u._id, className: `user-card${u.active ? '' : ' inactive'}`, onClick: () => setSelected(u) },
                  e(Avatar, { email: u.email, name: u.name, size: 36, className: 'user-card-avatar' }),
                  e('div', { className: 'user-card-info' },
                    e('div', { className: 'user-card-name' }, u.name),
                    e('div', { className: 'user-card-email' }, u.email),
                  ),
                  e('div', { className: 'user-card-right' },
                    e('span', { className: `role-badge role-${u.role}` }, ROLE_LABELS[u.role] || u.role),
                    !u.active && e('span', { className: 'user-inactive-pill' }, 'Inactivo'),
                  ),
                );
              }),
            ),
    ),

    selected && e(UserModal, { user: selected, onClose: () => setSelected(null), onUpdated: handleUpdated, currentUserId: session?.id }),
    showNew && e(NewUserModal, { onClose: () => setShowNew(false), onCreated: (u) => { setUsers((us) => [u, ...us]); setShowNew(false); } }),
  );
}
