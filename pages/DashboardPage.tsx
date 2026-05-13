import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Card from '../components/Card';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  Brain, Package, TrendingUp, AlertTriangle,
  DollarSign, BarChart3, ChevronDown, Save, Sparkles, Store, Warehouse,
} from 'lucide-react';

const API = '/api';

const PIE_COLORS = ['#7D6B5C', '#5C7D6B', '#C49B5C', '#A65D5D'];

interface DashboardData {
  totalProducts: number;
  totalStock: number;
  sales30d: number;
  revenue30d: number;
  cost30d: number;
  margin30d: number;
  marginPercent: number;
  pendingCount: number;
  lowStockCount: number;
  inventoryCost: number;
  inventoryValue: number;
  revenueNeto: number;
  marginNeto: number;
  marginNetoPercent: number;
  inventoryValueNeto: number;
  projected100: number;
  projected95: number;
  projected90: number;
  stockDistribution: { category: string; quantity: number }[];
  sales7d: { fecha: string; ventas: number; unidades: number; ingresos: number }[];
}

const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { id: 'custom', label: 'Personalizado', baseUrl: '', model: '' },
];

// ── Renderizador Markdown ──
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold text-text mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-text mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-clay mt-6 mb-3 border-b border-border pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-clay mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal text-sm text-text leading-relaxed">$1</li>')
    .replace(/^[-•]\s(.+)$/gm, '<li class="ml-4 list-disc text-sm text-text leading-relaxed">$1</li>')
    .replace(/^───+/gm, '<hr class="my-4 border-border" />')
    .replace(/^(?!<[a-z/])(.+)$/gm, '<p class="text-sm text-text leading-relaxed my-2">$1</p>')
    .replace(/((?:<li class="ml-4 list-disc[^>]*>.*?<\/li>\n?)+)/g, '<ul class="my-2">$1</ul>')
    .replace(/((?:<li class="ml-4 list-decimal[^>]*>.*?<\/li>\n?)+)/g, '<ol class="my-2">$1</ol>')
    .replace(/\n{3,}/g, '\n\n');
}

const formatCLP = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

const DashboardPage: React.FC = () => {
  const { currentUser } = useApp();
  const { addToast } = useToast();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // AI Panel
  const [showAI, setShowAI] = useState(false);
  const [provider, setProvider] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [saveKey, setSaveKey] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  // Cargar API Key guardada
  useEffect(() => {
    setApiKey(localStorage.getItem('facore_ai_key') || '');
    const sp = localStorage.getItem('facore_ai_provider');
    if (sp) setProvider(sp);
  }, []);

  // Cargar datos dashboard
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/reports/dashboard-summary`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(json => setData(json))
      .catch(() => addToast('Error al cargar dashboard', 'error'))
      .finally(() => setLoading(false));
  }, []);

  // ── Análisis AI ──
  const handleAnalyze = async () => {
    if (!apiKey.trim()) { addToast('Ingresa tu API Key', 'error'); return; }
    const prov = PROVIDERS.find(p => p.id === provider)!;
    const baseUrl = provider === 'custom' ? customBaseUrl : prov.baseUrl;
    const model = provider === 'custom' ? customModel : prov.model;
    if (!baseUrl) { addToast('Ingresa la URL base', 'error'); return; }
    if (saveKey) { localStorage.setItem('facore_ai_key', apiKey); localStorage.setItem('facore_ai_provider', provider); }

    setAnalyzing(true); setAiResult('');
    try {
      const res = await fetch(`${API}/ai/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey, baseUrl, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setAiResult(json.analysis);
      addToast('Análisis completado', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally { setAnalyzing(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-2 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="page-container animate-fade-in space-y-6">
      {/* ── Cabecera con Logo ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Boa Ideia" className="h-10 w-auto" />
          <div>
            <h2 className="page-title">Dashboard</h2>
            <p className="page-subtitle">Panel de control</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAI(!showAI)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                       transition-all min-h-[44px]
                       ${showAI
                         ? 'bg-clay text-white shadow-sm'
                         : 'bg-surface border border-border text-text-muted hover:text-clay hover:border-clay/30'
                       }`}
          >
            <Brain size={18} />
            Análisis AI
            <ChevronDown size={14} className={`transition-transform ${showAI ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* ── KPIs Principales ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {([
          [data.totalProducts, 'Productos', Package, 'text-clay', 'bg-clay/5 border-clay/10'],
          [data.totalStock, 'Stock Total', Package, 'text-sage', 'bg-sage/5 border-sage/10'],
          [data.sales30d, 'Ventas 30d', TrendingUp, 'text-clay', 'bg-clay/5 border-clay/10'],
          [data.lowStockCount, 'Stock Bajo', AlertTriangle, data.lowStockCount > 0 ? 'text-brick' : 'text-sage',
           data.lowStockCount > 0 ? 'bg-brick/5 border-brick/15' : 'bg-sage/5 border-sage/10'],
          [data.pendingCount, 'Pendientes', AlertTriangle, data.pendingCount > 0 ? 'text-amber' : 'text-text-muted',
           data.pendingCount > 0 ? 'bg-amber/5 border-amber/15' : 'bg-surface border-border'],
        ] as [number, string, React.FC<{ size?: number }>, string, string][]).map(([value, label, Icon, color, bg], i) => (
          <div key={i} className={`p-4 rounded-xl border ${bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={18} />
              <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Métricas Financieras ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          const metrics: [string, string, string, React.FC<{ size?: number }>, string, string][] = [
            ['Ingresos 30d', formatCLP(data.revenue30d), 'c/IVA · s/IVA: ' + formatCLP(data.revenueNeto), DollarSign, 'text-sage', 'bg-sage/5 border-sage/10'],
            ['Costo Inventario', formatCLP(data.inventoryCost), 'Valor venta: ' + formatCLP(data.inventoryValue), BarChart3, 'text-clay', 'bg-clay/5 border-clay/10'],
            ['Margen Bruto', formatCLP(data.marginNeto), data.marginNetoPercent + '% (s/IVA)', TrendingUp, data.marginNeto >= 0 ? 'text-amber' : 'text-brick',
             data.marginNeto >= 0 ? 'bg-amber/5 border-amber/15' : 'bg-brick/5 border-brick/15'],
            ['Margen Neto', formatCLP(data.marginNeto), data.marginNetoPercent + '% (s/IVA 19%)', TrendingUp, data.marginNeto >= 0 ? 'text-clay' : 'text-brick',
             data.marginNeto >= 0 ? 'bg-clay/5 border-clay/10' : 'bg-brick/5 border-brick/15'],
          ];
          return metrics.map(([label, value, sub, Icon, color, bg], i) => (
          <div key={i} className={`p-4 rounded-xl border ${bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} />
              <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
            </div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-text-muted mt-0.5">{sub}</p>
          </div>
        ))})()}
      </div>

      {/* ── Proyecciones de Margen s/IVA ── */}
      <Card title="Proyección de Venta del Inventario Actual (sin IVA)" padding="none">
        <div className="grid grid-cols-3 divide-x divide-border">
          {[
            ['100%', data.projected100, 'Venta total del stock'],
            ['95%', data.projected95, 'Holgura del 5%'],
            ['90%', data.projected90, 'Escenario conservador'],
          ].map(([pct, monto, desc], i) => (
            <div key={i} className="p-4 text-center">
              <p className="text-xs text-text-muted uppercase tracking-wider">{pct} stock</p>
              <p className={`text-xl font-bold mt-1 ${monto >= 0 ? 'text-sage' : 'text-brick'}`}>
                {formatCLP(monto as number)}
              </p>
              <p className="text-xs text-text-muted mt-1">{desc}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-3 text-xs text-text-muted">
          Stock valorizado sin IVA: {formatCLP(data.inventoryValueNeto)} · Costo: {formatCLP(data.inventoryCost)}
        </div>
      </Card>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución Stock */}
        <Card title="Distribución de Stock" padding="none">
          {data.stockDistribution.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-muted">Sin datos</p>
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.stockDistribution}
                    dataKey="quantity"
                    nameKey="category"
                    cx="50%" cy="50%"
                    outerRadius={90}
                    label={({ name, value }) => `${name}: ${value} uds.`}
                    labelLine={{ stroke: '#ccc', strokeWidth: 1 }}
                  >
                    {data.stockDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: '12px', fontSize: '13px' }}
                    formatter={(value: any) => [`${value} uds.`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Ventas 7 días */}
        <Card title="Ventas — Últimos 7 Días" padding="none">
          {data.sales7d.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-muted">Sin ventas este período</p>
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.sales7d} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#888' }}
                    tickFormatter={d => d.slice(5)} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: '12px', fontSize: '13px' }}
                    formatter={(value: any) => formatCLP(Number(value))}
                  />
                  <Bar dataKey="ingresos" fill="#5C7D6B" radius={[6, 6, 0, 0]} name="Ingresos" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* ── Panel AI (solo admin) ── */}
      {isAdmin && showAI && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-clay" />
              <h3 className="text-lg font-semibold text-text">Análisis de Inteligencia Artificial</h3>
            </div>
            <p className="text-sm text-text-muted">
              El sistema envía los datos reales del inventario a la AI para obtener análisis,
              sugerencias y predicciones con y sin las acciones recomendadas.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Proveedor</label>
                <select value={provider} onChange={e => setProvider(e.target.value)}>
                  {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">API Key</label>
                <div className="flex gap-2">
                  <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..." className="flex-1" />
                  <button
                    onClick={() => setSaveKey(!saveKey)}
                    className={`p-2.5 rounded-lg border transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center
                      ${saveKey ? 'bg-clay/10 border-clay text-clay' : 'border-border text-text-muted hover:text-text'}`}
                    title="Guardar en este navegador"
                  ><Save size={16} /></button>
                </div>
                {saveKey && <p className="text-xs text-sage mt-1">Guardada en este navegador</p>}
              </div>
            </div>

            {provider === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">URL Base</label>
                  <input type="text" value={customBaseUrl} onChange={e => setCustomBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com/v1" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Modelo</label>
                  <input type="text" value={customModel} onChange={e => setCustomModel(e.target.value)}
                    placeholder="deepseek-chat" />
                </div>
              </div>
            )}

            <button
              onClick={handleAnalyze} disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                         bg-clay text-white font-medium hover:bg-clay-dark transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              {analyzing ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analizando inventario...</>
              ) : (
                <><Brain size={18} /> Analizar Inventario</>
              )}
            </button>

            {aiResult && (
              <div className="mt-4 p-5 rounded-xl bg-canvas border border-border">
                <div className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(aiResult) }} />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Accesos rápidos ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['#/inventory', 'Catálogo', 'Gestionar productos y stock'],
          ['#/sales', 'Vender', 'Registrar una venta'],
          ['#/reports', 'Reportes', 'Estadísticas detalladas'],
          ['#/traceability', 'Trazabilidad', 'Rastrear un producto'],
        ].map(([hash, label, desc]) => (
          <a key={hash} href={hash}
            className="block p-4 rounded-xl bg-surface border border-border
                       hover:border-clay/30 hover:shadow-sm transition-all group">
            <p className="text-sm font-semibold text-text group-hover:text-clay transition-colors">{label}</p>
            <p className="text-xs text-text-muted mt-1">{desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;
