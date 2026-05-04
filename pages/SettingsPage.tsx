import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Button from '../components/Button';
import Card from '../components/Card';
import { LOCATION_TYPE_LABEL, LocationType } from '../types';
import { APP_VERSION } from '../version';
import { Plus, Trash2, Save } from 'lucide-react';

type Tab = 'general' | 'users' | 'locations';

const ROLES = ['admin', 'operador', 'vendedora', 'visita'];
const LOCATION_TYPES = Object.entries(LOCATION_TYPE_LABEL);

const SettingsPage: React.FC = () => {
  const { currentUser, dbStatus } = useApp();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [editUser, setEditUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'vendedora', displayName: '', locationId: '' });

  // Locations state
  const [locs, setLocs] = useState<any[]>([]);
  const [editLoc, setEditLoc] = useState<any>(null);
  const [locForm, setLocForm] = useState({ id: '', name: '', type: 'WAREHOUSE', address: '' });

  useEffect(() => { loadSettings(); loadUsers(); loadLocations(); }, []);

  const api = async (url: string, opts: RequestInit = {}) => {
    const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    return res.json();
  };

  const loadSettings = async () => { try { setSettings(await api('/api/settings')); } catch {} };
  const loadUsers = async () => { try { setUsers(await api('/api/settings/users')); } catch {} };
  const loadLocations = async () => { try { setLocs(await api('/api/locations')); } catch {} };

  const handleSaveSettings = async () => {
    setSaving(true);
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    addToast('Configuración guardada', 'success');
    setSaving(false);
  };

  // ── Users CRUD ──
  const saveUser = async () => {
    const url = editUser ? `/api/settings/users/${editUser.id}` : '/api/settings/users';
    const method = editUser ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(userForm) });
    addToast(editUser ? 'Usuario actualizado' : 'Usuario creado', 'success');
    setEditUser(null); setUserForm({ username: '', password: '', role: 'vendedora', displayName: '', locationId: '' });
    loadUsers();
  };

  const deleteUser = async (id: string) => {
    if (!confirm('¿Eliminar este usuario?')) return;
    await api(`/api/settings/users/${id}`, { method: 'DELETE' });
    addToast('Usuario eliminado', 'success'); loadUsers();
  };

  const startEditUser = (u: any) => {
    setEditUser(u);
    setUserForm({ username: u.username, password: '', role: u.role, displayName: u.display_name || '', locationId: u.location_id || '' });
  };

  // ── Locations CRUD ──
  const saveLocation = async () => {
    const url = editLoc ? `/api/settings/locations/${editLoc.id}` : '/api/settings/locations';
    const method = editLoc ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(locForm) });
    addToast(editLoc ? 'Ubicación actualizada' : 'Ubicación creada', 'success');
    setEditLoc(null); setLocForm({ id: '', name: '', type: 'WAREHOUSE', address: '' });
    loadLocations();
  };

  const deleteLocation = async (id: string) => {
    if (!confirm('¿Eliminar esta ubicación?')) return;
    await api(`/api/settings/locations/${id}`, { method: 'DELETE' });
    addToast('Ubicación eliminada', 'success'); loadLocations();
  };

  const startEditLoc = (l: any) => {
    setEditLoc(l);
    setLocForm({ id: l.id, name: l.name, type: l.type, address: l.address || '' });
  };

  const seedData = async () => {
    if (!confirm('¿Generar 20 productos, 7 ubicaciones y 4 usuarios de prueba?')) return;
    const r = await api('/api/seed', { method: 'POST' });
    addToast(r.message || 'Datos generados', 'success');
    loadUsers(); loadLocations();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'users', label: 'Usuarios' },
    { key: 'locations', label: 'Ubicaciones' },
  ];

  return (
    <div className="page-container animate-fade-in max-w-3xl">
      <h2 className="page-title">Configuración</h2>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t.key ? 'bg-clay text-white' : 'bg-canvas text-text-secondary border border-border hover:border-clay-light'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* General */}
      {tab === 'general' && (
        <>
          <Card title="Información del sistema">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Versión</span><span className="font-mono">{APP_VERSION}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Base de datos</span><span className={dbStatus === 'connected' ? 'text-sage' : 'text-brick'}>{dbStatus === 'connected' ? 'Conectada' : 'Desconectada'}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Usuario</span><span>{currentUser?.username} ({currentUser?.role})</span></div>
            </div>
          </Card>

          <Card title="Parámetros">
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre empresa</label><input type="text" value={settings.companyName || ''} onChange={e => setSettings({ ...settings, companyName: e.target.value })} placeholder="Facore" /></div>
              <div><label className="block text-sm font-medium text-text-secondary mb-1.5">Moneda</label><input type="text" value={settings.currency || 'CLP'} onChange={e => setSettings({ ...settings, currency: e.target.value })} /></div>
              <Button variant="primary" loading={saving} onClick={handleSaveSettings}>Guardar</Button>
            </div>
          </Card>

          <Card title="Datos de prueba">
            <p className="text-sm text-text-muted mb-3">Genera 20 productos, 7 ubicaciones y 4 usuarios de prueba.</p>
            <Button variant="secondary" onClick={seedData}>Generar datos de prueba</Button>
          </Card>
        </>
      )}

      {/* Users */}
      {tab === 'users' && (
        <Card title={`Usuarios (${users.length})`} action={
          <Button variant="primary" size="sm" onClick={() => { setEditUser(null); setUserForm({ username: '', password: '', role: 'vendedora', displayName: '', locationId: '' }); }}>
            <Plus size={14} /> Nuevo
          </Button>
        }>
          {(editUser !== null || (!editUser && userForm.username === '' && editUser === undefined)) && (
            <div className="mb-4 p-4 bg-canvas rounded-lg border border-border space-y-3">
              <input type="text" placeholder="Usuario" value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} />
              <input type="password" placeholder={editUser ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'} value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} />
              <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input type="text" placeholder="Nombre visible" value={userForm.displayName} onChange={e => setUserForm({ ...userForm, displayName: e.target.value })} />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={saveUser}><Save size={14} /> {editUser ? 'Actualizar' : 'Crear'}</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditUser(null); setUserForm({ username: '', password: '', role: 'vendedora', displayName: '', locationId: '' }); }}>Cancelar</Button>
              </div>
            </div>
          )}

          <table className="facore-table">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Nombre</th><th></th></tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.username}</td>
                  <td><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-clay-lighter/40 text-clay-dark">{u.role}</span></td>
                  <td className="text-sm">{u.display_name || '—'}</td>
                  <td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEditUser(u)}>Editar</Button>
                      <Button variant="danger" size="sm" onClick={() => deleteUser(u.id)}><Trash2 size={12} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Locations */}
      {tab === 'locations' && (
        <Card title={`Ubicaciones (${locs.length})`} action={
          <Button variant="primary" size="sm" onClick={() => { setEditLoc(null); setLocForm({ id: '', name: '', type: 'WAREHOUSE', address: '' }); }}>
            <Plus size={14} /> Nueva
          </Button>
        }>
          {(editLoc !== null || (!editLoc && locForm.id === '' && editLoc === undefined)) && (
            <div className="mb-4 p-4 bg-canvas rounded-lg border border-border space-y-3">
              <input type="text" placeholder="ID (ej: TIENDA3)" value={locForm.id} onChange={e => setLocForm({ ...locForm, id: e.target.value })} disabled={!!editLoc} />
              <input type="text" placeholder="Nombre" value={locForm.name} onChange={e => setLocForm({ ...locForm, name: e.target.value })} />
              <select value={locForm.type} onChange={e => setLocForm({ ...locForm, type: e.target.value })}>
                {LOCATION_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="text" placeholder="Dirección (opcional)" value={locForm.address} onChange={e => setLocForm({ ...locForm, address: e.target.value })} />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={saveLocation}><Save size={14} /> {editLoc ? 'Actualizar' : 'Crear'}</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditLoc(null); setLocForm({ id: '', name: '', type: 'WAREHOUSE', address: '' }); }}>Cancelar</Button>
              </div>
            </div>
          )}

          <table className="facore-table">
            <thead><tr><th>ID</th><th>Nombre</th><th>Tipo</th><th></th></tr></thead>
            <tbody>
              {locs.map((l: any) => (
                <tr key={l.id}>
                  <td className="font-mono text-xs">{l.id}</td>
                  <td>{l.name}</td>
                  <td><span className="text-xs text-text-muted">{LOCATION_TYPE_LABEL[l.type as LocationType] || l.type}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEditLoc(l)}>Editar</Button>
                      <Button variant="danger" size="sm" onClick={() => deleteLocation(l.id)}><Trash2 size={12} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

export default SettingsPage;
