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
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      setXlsxFile(file);
      setCsv('');
    } else {
      // Leer como texto (CSV)
      const reader = new FileReader();
      reader.onload = (ev) => setCsv(ev.target?.result as string || '');
      reader.readAsText(file);
      setXlsxFile(null);
    }
  };

  const handleUpload = async () => {
    if (!csv.trim() && !xlsxFile) {
      addToast('Pega contenido CSV o selecciona un archivo', 'error');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      let body: any;
      if (xlsxFile) {
        // Convertir XLSX a base64
        const buf = await xlsxFile.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        body = JSON.stringify({ xlsx: base64 });
      } else {
        body = JSON.stringify({ csv });
      }

      const res = await fetch(`/api/upload/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
      });
      const data = await res.json();
      setResult(data);
      if (res.ok) addToast(`${data.count || data.created || 0} registros`, 'success');
      else addToast(data.error || 'Error', 'error');
    } catch { addToast('Error de conexión', 'error'); }
    finally { setLoading(false); }
  };

  const info = TYPE_LABELS[type];

  return (
    <div className="page-container animate-fade-in">
      <h2 className="page-title">Carga Masiva</h2>
      <p className="page-subtitle">Importa productos, transferencias y ventas desde CSV o XLSX</p>

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
            Archivo (XLSX o CSV)
          </label>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange}
            className="border-0 p-0 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                       file:text-sm file:font-medium file:bg-clay file:text-white hover:file:bg-clay-dark
                       file:cursor-pointer file:transition-colors" />
          {xlsxFile && <p className="text-xs text-sage mt-1">✓ {xlsxFile.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
            O pega el contenido CSV
          </label>
          <textarea
            value={csv}
            onChange={e => setCsv(e.target.value)}
            rows={10}
            placeholder="id_venta;descripcion;price;cost..."
            className="font-mono text-xs"
          />
        </div>

        <div className="mt-4 flex gap-3 items-center">
          <Button variant="primary" loading={loading} onClick={handleUpload}>
            <Upload size={14} className="mr-1" />
            Procesar archivo
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
