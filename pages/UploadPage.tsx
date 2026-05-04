import React, { useState } from 'react';
import { useToast } from '../hooks/useToast';
import Button from '../components/Button';
import Card from '../components/Card';
import { Upload } from 'lucide-react';

type UploadType = 'products' | 'transfers' | 'sales';

const TYPE_LABELS: Record<UploadType, { label: string; desc: string; example: string }> = {
  products: {
    label: 'Productos',
    desc: 'Carga o actualiza el catálogo de productos',
    example: 'id_venta;id_fabrica;description;price;cost;min_stock;category\nVT-001;FAB-001;Blusa seda;15000;8000;5;Blusas',
  },
  transfers: {
    label: 'Transferencias',
    desc: 'Mueve stock entre ubicaciones (bodega ↔ tienda)',
    example: 'id_venta;sitio_inicial;sitio_final;qty\nVT-001;BODCENT;TIENDA1;10',
  },
  sales: {
    label: 'Ventas',
    desc: 'Registra ventas por lote (puntos de venta semanales/quincenales)',
    example: 'id_venta;lugar;precio;qty;timestamp\nVT-001;TIENDA1;15000;2;2026-05-01',
  },
};

const UploadPage: React.FC = () => {
  const { addToast } = useToast();
  const [type, setType] = useState<UploadType>('products');
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleUpload = async () => {
    if (!csv.trim()) {
      addToast('Pega el contenido CSV primero', 'error');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/upload/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      setResult(data);

      if (res.ok) {
        const count = data.count || data.created || 0;
        addToast(`${count} registros procesados`, 'success');
      } else {
        addToast(data.error || 'Error al procesar', 'error');
      }
    } catch {
      addToast('Error de conexión', 'error');
    } finally {
      setLoading(false);
    }
  };

  const info = TYPE_LABELS[type];

  return (
    <div className="page-container animate-fade-in">
      <h2 className="page-title">Carga Masiva</h2>
      <p className="page-subtitle">Importa productos, transferencias y ventas desde archivos CSV</p>

      {/* Selector de tipo */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(TYPE_LABELS) as UploadType[]).map(t => (
          <button
            key={t}
            onClick={() => { setType(t); setResult(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${type === t ? 'bg-clay text-white' : 'bg-canvas text-text-secondary border border-border hover:border-clay-light'}`}
          >
            {TYPE_LABELS[t].label}
          </button>
        ))}
      </div>

      <Card title={info.label}>
        <p className="text-sm text-text-muted mb-4">{info.desc}</p>

        <div className="mb-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Formato esperado</p>
          <pre className="text-xs bg-canvas p-3 rounded-md border border-border font-mono text-text-muted overflow-x-auto">
            {info.example}
          </pre>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
            Contenido CSV
          </label>
          <textarea
            value={csv}
            onChange={e => setCsv(e.target.value)}
            rows={10}
            placeholder="Pega aquí el contenido de tu archivo CSV..."
            className="font-mono text-xs"
          />
        </div>

        <div className="mt-4 flex gap-3 items-center">
          <Button variant="primary" loading={loading} onClick={handleUpload}>
            <Upload size={14} className="mr-1" />
            Procesar {info.label}
          </Button>
        </div>

        {result && (
          <div className={`mt-4 p-4 rounded-lg text-sm ${
            (result.errors || []).length > 0 ? 'bg-amber-light/50 text-amber' : 'bg-sage-lighter/50 text-sage'
          }`}>
            <p className="font-medium">
              {result.count || result.created || 0} registros procesados
            </p>
            {(result.errors || []).length > 0 && (
              <div className="mt-2">
                <p className="font-medium text-brick">Errores:</p>
                <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                  {result.errors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default UploadPage;
