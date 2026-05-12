import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Card from '../components/Card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, Package, AlertTriangle, MapPin, Download, ChevronDown, X } from 'lucide-react';

const API = '/api';

// ── Paleta de la app para gráficos ──
const CHART_COLORS = ['#7D6B5C', '#5C7D6B', '#C49B5C', '#A65D5D', '#8B7D6B', '#6B8B7D', '#B8A58C', '#C4956B'];

interface SalesSummaryItem {
  period: string;
  totalSales: number;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
}

interface TopProduct {
  productId: string;
  productDescription: string;
  factoryId: string;
  category: string;
  totalSold: number;
  totalRevenue: number;
  saleCount: number;
}

interface LowStockItem {
  productId: string;
  productDescription: string;
  factoryId: string;
  category: string;
  minStock: number;
  currentStock: number;
  locationId: string;
  locationName: string;
  quantity: number;
}

interface DistributionItem {
  locationId: string;
  locationName: string;
  locationType: string;
  productCount: number;
  totalItems: number;
}

interface StockStatus {
  lowStock: LowStockItem[];
  distribution: DistributionItem[];
  productsWithStock: number;
  grandTotal: number;
}

interface StockDetailItem {
  productId: string;
  productDescription: string;
  factoryId: string;
  category: string;
  minStock: number;
  price: number;
  cost: number;
  quantity: number;
  locationName: string;
  locationId: string;
}

type Tab = 'sales' | 'products' | 'stock';

const ReportsPage: React.FC = () => {
  const { addToast } = useToast();
  const { locations } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filtro de ubicación ──
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const locDropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    if (!locationDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (locDropdownRef.current && !locDropdownRef.current.contains(e.target as Node)) {
        setLocationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [locationDropdownOpen]);

  const allLocationsSelected = selectedLocations.length === 0;

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev => {
      if (id === '__all__') return [];
      if (prev.includes(id)) {
        const next = prev.filter(l => l !== id);
        return next.length === 0 ? [] : next; // si se vacía → todas
      }
      return [...prev, id];
    });
  };

  const getLocationsParam = () => {
    if (selectedLocations.length === 0) return '';
    return `&locations=${selectedLocations.map(id => encodeURIComponent(id)).join(',')}`;
  };

  // ── Ventas ──
  const [salesPeriod, setSalesPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [salesData, setSalesData] = useState<SalesSummaryItem[]>([]);

  // ── Productos ──
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // ── Stock ──
  const [stockData, setStockData] = useState<StockStatus | null>(null);
  const [stockDetail, setStockDetail] = useState<StockDetailItem[]>([]);

  const formatCLP = (n: number) =>
    '$' + Math.round(n).toLocaleString('es-CL');

  // ── Cargar datos según tab ──
  useEffect(() => {
    setLoading(true);
    setError(null);

    const locParam = getLocationsParam();

    if (activeTab === 'sales') {
      const params = new URLSearchParams({ period: salesPeriod });
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      fetch(`${API}/reports/sales-summary?${params}${locParam}`, { credentials: 'include' })
        .then(async res => {
          if (!res.ok) throw new Error(`Error ${res.status}`);
          return res.json();
        })
        .then(data => {
          setSalesData(Array.isArray(data) ? data : []);
          setError(null);
        })
        .catch(err => {
          setError('No se pudieron cargar los datos de ventas');
          setSalesData([]);
        })
        .finally(() => setLoading(false));
    } else if (activeTab === 'products') {
      fetch(`${API}/reports/top-products?limit=15${locParam}`, { credentials: 'include' })
        .then(async res => {
          if (!res.ok) throw new Error(`Error ${res.status}`);
          return res.json();
        })
        .then(data => {
          setTopProducts(Array.isArray(data) ? data : []);
          setError(null);
        })
        .catch(() => {
          setError('No se pudieron cargar los datos de productos');
          setTopProducts([]);
        })
        .finally(() => setLoading(false));
    } else if (activeTab === 'stock') {
      fetch(`${API}/reports/stock-status${locParam ? `?${locParam.slice(1)}` : ''}`, { credentials: 'include' })
        .then(async res => {
          if (!res.ok) throw new Error(`Error ${res.status}`);
          return res.json();
        })
        .then(data => {
          setStockData(data);
          setError(null);
        })
        .catch(() => {
          setError('No se pudieron cargar los datos de stock');
          setStockData(null);
        })
        .finally(() => setLoading(false));

      // Cargar detalle completo para exportación
      fetch(`${API}/reports/stock-detail${locParam ? `?${locParam.slice(1)}` : ''}`, { credentials: 'include' })
        .then(async res => {
          if (!res.ok) throw new Error(`Error ${res.status}`);
          return res.json();
        })
        .then(data => {
          setStockDetail(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          setStockDetail([]);
        });
    }
  }, [activeTab, salesPeriod, dateFrom, dateTo, selectedLocations]);

  // ── Totales de ventas ──
  const salesTotals = salesData.reduce(
    (acc, s) => ({
      revenue: acc.revenue + s.totalRevenue,
      cost: acc.cost + s.totalCost,
      qty: acc.qty + s.totalQuantity,
      count: acc.count + s.totalSales,
    }),
    { revenue: 0, cost: 0, qty: 0, count: 0 }
  );

  // ── Exportar ──
  const exportData = async (format: 'csv' | 'xlsx' | 'pdf') => {
    let label = '';
    let columns: string[] = [];
    let rows: any[][] = [];

    if (activeTab === 'sales') {
      label = 'ventas';
      columns = ['Período', 'Ventas', 'Cantidad', 'Ingresos', 'Costo', 'Margen'];
      rows = salesData.map(s => [s.period, s.totalSales, s.totalQuantity, s.totalRevenue, s.totalCost, s.margin]);
    } else if (activeTab === 'products') {
      label = 'productos-top';
      columns = ['#', 'Producto', 'Código', 'Categoría', 'Vendido', 'Ventas', 'Ingresos'];
      rows = topProducts.map((p, i) => [i + 1, p.productDescription, p.productId, p.category || '', p.totalSold, p.saleCount, p.totalRevenue]);
    } else if (activeTab === 'stock' && stockDetail.length > 0) {
      label = 'stock';
      columns = ['Producto', 'Código', 'ID Fábrica', 'Categoría', 'Ubicación', 'Cantidad', 'Stock Mínimo', 'Precio', 'Costo'];
      rows = stockDetail.map(item => [
        item.productDescription, item.productId, item.factoryId, item.category || '—', item.locationName,
        item.quantity, item.minStock,
        formatCLP(item.price), formatCLP(item.cost)
      ]);
    }

    if (rows.length === 0) {
      addToast('No hay datos para exportar', 'info');
      return;
    }

    try {
      if (format === 'csv') {
        const Papa = (await import('papaparse')).default;
        const csv = Papa.unparse({ fields: columns, data: rows });
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, `reporte-${label}-${new Date().toISOString().slice(0, 10)}.csv`);
      } else if (format === 'xlsx') {
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
        XLSX.writeFile(wb, `reporte-${label}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else if (format === 'pdf') {
        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14);
        doc.text(`Reporte — ${activeTab === 'sales' ? 'Ventas' : activeTab === 'products' ? 'Top Productos' : 'Stock'}`, 14, 15);
        autoTable(doc, {
          head: [columns],
          body: rows,
          startY: 22,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [125, 107, 92] },
        });
        doc.save(`reporte-${label}-${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      addToast(`Reporte exportado como ${format.toUpperCase()}`, 'success');
    } catch (err) {
      console.error('Error al exportar', format, err);
      addToast('Error al exportar', 'error');
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ──
  return (
    <div className="page-container animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-title">Reportes</h2>
          <p className="page-subtitle">Estadísticas y análisis del inventario</p>
        </div>

        {/* Botones exportar */}
        {!loading && !error && (
          <div className="flex gap-2">
            {(['csv', 'xlsx', 'pdf'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => exportData(fmt)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                           bg-surface border border-border text-text-muted
                           hover:text-clay hover:border-clay/30 transition-colors min-h-[36px]"
              >
                <Download size={14} />
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Selector de ubicación ── */}
      <div className="relative" ref={locDropdownRef}>
        <button
          onClick={() => setLocationDropdownOpen(!locationDropdownOpen)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border
                     text-sm text-text hover:border-clay/30 transition-colors min-h-[40px]"
        >
          <div className="text-text-muted"><MapPin size={16} /></div>
          <span>
            {allLocationsSelected
              ? 'Todas las ubicaciones'
              : selectedLocations.length === 1
                ? locations.find(l => l.id === selectedLocations[0])?.name || selectedLocations[0]
                : `${selectedLocations.length} ubicaciones`}
          </span>
          <ChevronDown size={14} className={`text-text-muted transition-transform ${locationDropdownOpen ? 'rotate-180' : ''}`} />
          {!allLocationsSelected && (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedLocations([]); }}
              className="ml-1 p-0.5 rounded hover:bg-brick/10 text-text-muted hover:text-brick"
            >
              <X size={14} />
            </button>
          )}
        </button>

        {locationDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border
                          rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto py-1">
            <label className="flex items-center gap-2 px-4 py-2.5 hover:bg-canvas cursor-pointer
                              text-sm font-medium border-b border-border">
              <input
                type="checkbox"
                checked={allLocationsSelected}
                onChange={() => toggleLocation('__all__')}
                className="w-4 h-4 rounded accent-clay"
              />
              Todas
            </label>
            {locations.filter(l => l.isActive !== false).map(loc => (
              <label key={loc.id}
                className="flex items-center gap-2 px-4 py-2.5 hover:bg-canvas cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedLocations.includes(loc.id)}
                  onChange={() => toggleLocation(loc.id)}
                  className="w-4 h-4 rounded accent-clay"
                />
                <span>{loc.name}</span>
                <span className="text-xs text-text-muted ml-auto">{loc.id}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border w-fit">
        {([
          ['sales', 'Ventas', TrendingUp],
          ['products', 'Productos', Package],
          ['stock', 'Stock', AlertTriangle],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                       transition-colors min-h-[40px]
                       ${activeTab === key
                         ? 'bg-clay text-white shadow-sm'
                         : 'text-text-muted hover:text-text hover:bg-canvas'
                       }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-clay border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-8 rounded-xl bg-brick/5 border border-brick/15 text-center">
          <AlertTriangle size={32} className="mx-auto text-brick mb-3" />
          <p className="text-brick font-medium">{error}</p>
          <p className="text-sm text-text-muted mt-1">Revisa la conexión e inténtalo de nuevo</p>
        </div>
      )}

      {/* ═══════════════ VENTAS ═══════════════ */}
      {!loading && !error && activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Selector de período + rango fechas */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Agrupar:</span>
              {([
                ['day', 'Día'],
                ['week', 'Semana'],
                ['month', 'Mes'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSalesPeriod(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                             ${salesPeriod === key
                               ? 'bg-clay/10 text-clay'
                               : 'text-text-muted hover:text-text'
                             }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Desde:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-sm py-1.5 px-2 min-h-[36px] w-36"
              />
              <span className="text-sm text-text-muted">Hasta:</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-sm py-1.5 px-2 min-h-[36px] w-36"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-text-muted hover:text-brick transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ['Ingresos', formatCLP(salesTotals.revenue), 'text-sage'],
              ['Costo', formatCLP(salesTotals.cost), 'text-amber'],
              ['Margen', formatCLP(salesTotals.revenue - salesTotals.cost), 'text-clay'],
              ['Ventas', `${salesTotals.count} (${salesTotals.qty} uds.)`, 'text-text'],
            ].map(([label, value, colorClass]) => (
              <div key={label as string} className="p-4 rounded-xl bg-surface border border-border">
                <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
                <p className={`text-lg font-bold mt-1 ${colorClass}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Gráfico de barras */}
          <Card title="Ventas por período" padding="none">
            {salesData.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">Sin datos de ventas en este rango</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff', border: '1px solid #e5e5e0',
                        borderRadius: '12px', fontSize: '13px',
                      }}
                      formatter={(value: any) => formatCLP(Number(value))}
                    />
                    <Bar dataKey="totalRevenue" fill="#5C7D6B" radius={[6, 6, 0, 0]} name="Ingresos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Tabla */}
          {salesData.length > 0 && (
            <Card title="Detalle" padding="none">
              <div className="overflow-x-auto">
                <table className="facore-table w-full">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Ventas</th>
                      <th>Cantidad</th>
                      <th>Ingresos</th>
                      <th>Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.slice(0, 30).map(s => (
                      <tr key={s.period}>
                        <td className="font-medium">{s.period}</td>
                        <td>{s.totalSales}</td>
                        <td>{s.totalQuantity}</td>
                        <td>{formatCLP(s.totalRevenue)}</td>
                        <td className={s.margin >= 0 ? 'text-sage' : 'text-brick'}>
                          {formatCLP(s.margin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════ PRODUCTOS ═══════════════ */}
      {!loading && !error && activeTab === 'products' && (
        <div className="space-y-6">
          <Card title="Top 15 — Más Vendidos" padding="none">
            {topProducts.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">Sin datos de ventas</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={Math.max(300, topProducts.length * 28)}>
                  <BarChart
                    data={[...topProducts].reverse()}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="productDescription" tick={{ fontSize: 11, fill: '#555' }}
                      tickLine={false} axisLine={false} width={115} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff', border: '1px solid #e5e5e0',
                        borderRadius: '12px', fontSize: '13px',
                      }}
                      formatter={(value: any) => [`${value} uds.`, 'Vendido']}
                    />
                    <Bar dataKey="totalSold" fill="#7D6B5C" radius={[0, 6, 6, 0]} name="Unidades" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {topProducts.length > 0 && (
            <Card title="Detalle" padding="none">
              <div className="overflow-x-auto">
                <table className="facore-table w-full">
                  <thead>
                    <tr><th>#</th><th>Producto</th><th>Código</th><th>Categoría</th><th>Vendido</th><th>Ventas</th><th>Ingresos</th></tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.productId}>
                        <td className="font-semibold text-text-muted">{i + 1}</td>
                        <td>
                          <span className="font-medium">{p.productDescription}</span>
                        </td>
                        <td className="text-xs font-mono">{p.productId}</td>
                        <td>{p.category || '—'}</td>
                        <td className="font-semibold">{p.totalSold}</td>
                        <td>{p.saleCount}</td>
                        <td>{formatCLP(p.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════ STOCK ═══════════════ */}
      {!loading && !error && activeTab === 'stock' && stockData && (
        <div className="space-y-6">
          {/* Resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl bg-surface border border-border">
              <p className="text-xs text-text-muted uppercase tracking-wider">Total en inventario</p>
              <p className="text-2xl font-bold text-text mt-1">{stockData.grandTotal} uds.</p>
            </div>
            <div className="p-5 rounded-xl bg-surface border border-border">
              <p className="text-xs text-text-muted uppercase tracking-wider">Productos con stock</p>
              <p className="text-2xl font-bold text-text mt-1">{stockData.productsWithStock}</p>
            </div>
            <div className="p-5 rounded-xl bg-brick/5 border border-brick/15">
              <p className="text-xs text-text-muted uppercase tracking-wider">Alertas stock bajo</p>
              <p className="text-2xl font-bold text-brick mt-1">{stockData.lowStock.length}</p>
            </div>
          </div>

          {/* Distribución */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Distribución por Ubicación" padding="none">
              {stockData.distribution.length === 0 ? (
                <p className="p-8 text-center text-sm text-text-muted">Sin datos</p>
              ) : (
                <div className="p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={stockData.distribution}
                        dataKey="totalItems"
                        nameKey="locationName"
                        cx="50%" cy="50%"
                        outerRadius={100}
                        label={({ name, value }) => `${name} (${value})`}
                        labelLine={{ stroke: '#ccc', strokeWidth: 1 }}
                      >
                        {stockData.distribution.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: '#fff', border: '1px solid #e5e5e0',
                          borderRadius: '12px', fontSize: '13px',
                        }}
                        formatter={(value: any) => [`${value} uds.`, 'Items']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Detalle por Ubicación" padding="none">
              <div className="divide-y divide-border">
                {stockData.distribution.map(d => (
                  <div key={d.locationId} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-text-muted" />
                      <div>
                        <p className="text-sm font-medium">{d.locationName}</p>
                        <p className="text-xs text-text-muted">{d.productCount} productos</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{d.totalItems} uds.</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Inventario completo */}
          {stockDetail.length > 0 && (
            <Card title={`Inventario (${stockDetail.length} productos, ${stockDetail.reduce((s, i) => s + i.quantity, 0)} uds.)`} padding="none">
              <div className="overflow-x-auto">
                <table className="facore-table w-full">
                  <thead>
                    <tr><th>Producto</th><th>Código</th><th>ID Fábrica</th><th>Categoría</th><th>Cant.</th><th>Mín.</th><th>Precio</th><th>Costo</th></tr>
                  </thead>
                  <tbody>
                    {stockDetail.map(item => (
                      <tr key={`${item.productId}-${item.locationId}`}>
                        <td>
                          <span className="font-medium">{item.productDescription}</span>
                        </td>
                        <td className="text-xs font-mono">{item.productId}</td>
                        <td className="text-xs font-mono">{item.factoryId}</td>
                        <td>{item.category || '—'}</td>
                        <td className={`font-semibold tabular-nums ${item.quantity <= item.minStock ? 'text-brick' : ''}`}>
                          {item.quantity}
                        </td>
                        <td className="text-text-muted">{item.minStock}</td>
                        <td className="tabular-nums">{formatCLP(item.price)}</td>
                        <td className="tabular-nums text-text-muted">{formatCLP(item.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Alertas */}
          {stockData.lowStock.length > 0 && (
            <Card title={`⚠️ Productos bajo stock mínimo (${stockData.lowStock.length})`} padding="none">
              <div className="overflow-x-auto">
                <table className="facore-table w-full">
                  <thead>
                    <tr><th>Producto</th><th>Código</th><th>Ubicación</th><th>Stock</th><th>Mínimo</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {stockData.lowStock.map(item => (
                      <tr key={`${item.productId}-${item.locationId}`}>
                        <td>
                          <span className="font-medium">{item.productDescription}</span>
                        </td>
                        <td className="text-xs font-mono">{item.productId}</td>
                        <td>{item.locationName}</td>
                        <td className="font-semibold text-brick">{item.quantity}</td>
                        <td>{item.minStock}</td>
                        <td>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brick-light text-brick">
                            {item.quantity === 0 ? 'Agotado' : 'Bajo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {stockData.lowStock.length === 0 && (
            <Card>
              <p className="text-center text-sm text-sage py-4">
                ✓ Todos los productos están sobre su stock mínimo
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
