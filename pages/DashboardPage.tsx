import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Card from '../components/Card';
import { Brain, Package, TrendingUp, AlertTriangle, ChevronDown, Save, X, Sparkles } from 'lucide-react';

const API = '/api';

// ── Providers predefinidos ──
const PROVIDERS: { id: string; label: string; baseUrl: string; model: string }[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { id: 'custom', label: 'Personalizado', baseUrl: '', model: '' },
];

// ── Renderizador simple de Markdown ──
function renderMarkdown(text: string): string {
  let html = text
    // Escapar HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Encabezados
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold text-text mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-text mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-clay mt-6 mb-3 border-b border-border pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-clay mt-6 mb-3">$1</h1>')
    // Negrita e itálica
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Listas numeradas
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal text-sm text-text leading-relaxed">$1</li>')
    // Listas no numeradas
    .replace(/^[-•]\s(.+)$/gm, '<li class="ml-4 list-disc text-sm text-text leading-relaxed">$1</li>')
    // Separadores
    .replace(/^───+/gm, '<hr class="my-4 border-border" />')
    // Párrafos: líneas no vacías que no son ya HTML tags
    .replace(/^(?!<[a-z/])(.+)$/gm, '<p class="text-sm text-text leading-relaxed my-2">$1</p>')
    // Juntar <li> consecutivos en <ul>
    .replace(/((?:<li class="ml-4 list-disc[^>]*>.*?<\/li>\n?)+)/g, '<ul class="my-2">$1</ul>')
    .replace(/((?:<li class="ml-4 list-decimal[^>]*>.*?<\/li>\n?)+)/g, '<ol class="my-2">$1</ol>')
    // Limpiar saltos extra
    .replace(/\n{3,}/g, '\n\n');

  return html;
}

const DashboardPage: React.FC = () => {
  const { products, stock, movements, pendingSales, currentUser, fetchData } = useApp();
  const { addToast } = useToast();

  // ── AI Panel ──
  const [showAI, setShowAI] = useState(false);
  const [provider, setProvider] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [saveKey, setSaveKey] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  // ── Cargar API Key guardada ──
  useEffect(() => {
    const saved = localStorage.getItem('facore_ai_key');
    const savedProvider = localStorage.getItem('facore_ai_provider');
    if (saved) setApiKey(saved);
    if (savedProvider) setProvider(savedProvider);
  }, []);

  // ── Datos para el dashboard ──
  const totalProducts = products.length;
  const totalStock = stock.reduce((sum, s) => sum + s.quantity, 0);
  const lowStockCount = products.filter(p => {
    const total = stock.filter(s => s.productId === p.id_venta).reduce((sum, s) => sum + s.quantity, 0);
    return total <= (p.minStock ?? 2);
  }).length;
  const pendingCount = pendingSales.filter(s => s.status === 'pending').length;
  const recentSales = movements.filter(m => m.type === 'SALE').length;
  const totalRevenue = movements
    .filter(m => m.type === 'SALE' && m.price)
    .reduce((sum, m) => sum + (m.price || 0) * m.quantity, 0);

  const formatCLP = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

  // ── Disparar análisis AI ──
  const handleAnalyze = async () => {
    if (!apiKey.trim()) {
      addToast('Ingresa tu API Key', 'error');
      return;
    }

    const prov = PROVIDERS.find(p => p.id === provider)!;
    const baseUrl = provider === 'custom' ? customBaseUrl : prov.baseUrl;
    const model = provider === 'custom' ? customModel : prov.model;

    if (!baseUrl) {
      addToast('Ingresa la URL base del endpoint', 'error');
      return;
    }

    // Guardar en localStorage si el usuario marcó la opción
    if (saveKey) {
      localStorage.setItem('facore_ai_key', apiKey);
      localStorage.setItem('facore_ai_provider', provider);
    }

    setAnalyzing(true);
    setAiResult('');

    try {
      const res = await fetch(`${API}/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey, baseUrl, model }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`);
      }

      setAiResult(data.analysis);
      addToast('Análisis completado', 'success');
    } catch (err: any) {
      addToast(err.message || 'Error al analizar', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const currentProvider = PROVIDERS.find(p => p.id === provider)!;

  // ── Cargar datos al montar ──
  useEffect(() => {
    fetchData('products');
    fetchData('stock');
    fetchData('movements');
    fetchData('sales/pending');
  }, []);

  return (
    <div className="page-container animate-fade-in space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">Resumen del sistema</p>
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

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {([
          [totalProducts, 'Productos', Package, 'text-clay'],
          [totalStock, 'En Stock', Package, 'text-sage'],
          [recentSales, 'Ventas', TrendingUp, 'text-clay'],
          [lowStockCount, 'Stock Bajo', AlertTriangle, lowStockCount > 0 ? 'text-brick' : 'text-sage'],
          [pendingCount, 'Pendientes', AlertTriangle, pendingCount > 0 ? 'text-amber' : 'text-text-muted'],
        ] as [number, string, React.FC<{ size?: number }>, string][]).map(([value, label, Icon, colorClass], i) => (
          <div key={i} className="p-4 rounded-xl bg-surface border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} />
              <p className="text-xs text-text-muted uppercase tracking-wider">{label as string}</p>
            </div>
            <p className={`text-xl font-bold ${colorClass}`}>{value as number}</p>
          </div>
        ))}
      </div>

      {/* Ingresos totales */}
      <div className="p-5 rounded-xl bg-clay/5 border border-clay/10">
        <p className="text-xs text-text-muted uppercase tracking-wider">Ingresos Totales (ventas registradas)</p>
        <p className="text-2xl font-bold text-clay mt-1">{formatCLP(totalRevenue)}</p>
      </div>

      {/* ── Panel AI ── */}
      {showAI && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-clay" />
              <h3 className="text-lg font-semibold text-text">Análisis de Inteligencia Artificial</h3>
            </div>
            <p className="text-sm text-text-muted">
              El sistema envía los datos actuales del inventario a la AI para obtener análisis,
              sugerencias y predicciones. Solo tú (admin) puedes ejecutar este análisis.
            </p>

            {/* Configuración */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">
                  Proveedor
                </label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value)}
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={currentProvider.id === 'deepseek' ? 'sk-...' : 'sk-...'}
                    className="flex-1"
                  />
                  <button
                    onClick={() => setSaveKey(!saveKey)}
                    className={`p-2.5 rounded-lg border transition-colors min-h-[44px] min-w-[44px]
                               flex items-center justify-center
                               ${saveKey
                                 ? 'bg-clay/10 border-clay text-clay'
                                 : 'border-border text-text-muted hover:text-text'
                               }`}
                    title="Guardar en este navegador"
                  >
                    <Save size={16} />
                  </button>
                </div>
                {saveKey && (
                  <p className="text-xs text-sage mt-1">Se guardará en este navegador</p>
                )}
              </div>
            </div>

            {/* Opciones personalizadas */}
            {provider === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">
                    URL Base
                  </label>
                  <input
                    type="text"
                    value={customBaseUrl}
                    onChange={e => setCustomBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com/v1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="deepseek-chat"
                  />
                </div>
              </div>
            )}

            {/* Botón analizar */}
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                         bg-clay text-white font-medium hover:bg-clay-dark transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              {analyzing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analizando inventario...
                </>
              ) : (
                <>
                  <Brain size={18} />
                  Analizar Inventario
                </>
              )}
            </button>

            {/* Resultado */}
            {aiResult && (
              <div className="mt-4 p-5 rounded-xl bg-canvas border border-border">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(aiResult) }}
                />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;
