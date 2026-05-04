import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Button from '../components/Button';
import Card from '../components/Card';
import { APP_VERSION } from '../version';

const SettingsPage: React.FC = () => {
  const { currentUser, fetchData, dbStatus } = useApp();
  const { addToast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings', { credentials: 'include' });
      if (res.ok) setSettings(await res.json());
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        addToast('Configuración guardada', 'success');
      }
    } catch {
      addToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container animate-fade-in max-w-2xl">
      <h2 className="page-title">Configuración</h2>
      <p className="page-subtitle">Ajustes generales del sistema</p>

      <Card title="Información del sistema">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Versión</span>
            <span className="font-mono">{APP_VERSION}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Base de datos</span>
            <span className={dbStatus === 'connected' ? 'text-sage' : 'text-brick'}>
              {dbStatus === 'connected' ? 'Conectada' : 'Desconectada'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Usuario</span>
            <span>{currentUser?.username} ({currentUser?.role})</span>
          </div>
        </div>
      </Card>

      <Card title="Parámetros generales">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Nombre de la empresa
            </label>
            <input
              type="text"
              value={settings.companyName || ''}
              onChange={e => setSettings({ ...settings, companyName: e.target.value })}
              placeholder="Facore"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Moneda
            </label>
            <input
              type="text"
              value={settings.currency || 'CLP'}
              onChange={e => setSettings({ ...settings, currency: e.target.value })}
            />
          </div>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Guardar configuración
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;
