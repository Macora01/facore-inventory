import React, { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import Card from '../components/Card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { TrendingUp, Package, AlertTriangle, MapPin } from 'lucide-react';

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

type Tab = 'sales' | 'products' | 'stock';

const ReportsPage: React.FC = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [loading, setLoading] = useState(false);

  // ── Ventas ──
  const [salesPeriod, setSalesPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [salesData, setSalesData] = useState<SalesSummaryItem[]>([]);

  // ── Productos ──
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // ── Stock ──
  const [stockData, setStockData] = useState<StockStatus | null>(null);

  const formatCLP = (n: number) =>
    '$' + Math.round(n).toLocaleString('es-CL');

  // ── Cargar datos según tab ──
  useEffect(() => {
    setLoading(true);

    if (activeTab === 'sales') {
      fetch(`${API}/reports/sales-summary?period=${salesPeriod}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => setSalesData(Array.isArray(data) ? data : []))
        .catch(() => addToast('Error al cargar datos de ventas', 'error'))
        .finally(() => setLoading(false));
    } else if (activeTab === 'products') {
      fetch(`${API}/reports/top-products?limit=15`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => setTopProducts(Array.isArray(data) ? data : []))
        .catch(() => addToast('Error al cargar top productos', 'error'))
        .finally(() => setLoading(false));
    } else if (activeTab === 'stock') {
      fetch(`${API}/reports/stock-status`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => setStockData(data))
        .catch(() => addToast('Error al cargar estado de stock', 'error'))
        .finally(() => setLoading(false));
    }
  }, [activeTab, salesPeriod]);

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

  // ── Render ──
  return (
    <div className="page-container animate-fade-in space-y-6">
      <h2 className="page-title">Reportes</h2>
      <p className="page-subtitle">Estadísticas y análisis del inventario</p>

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

      {/* ═══════════════ VENTAS ═══════════════ */}
      {!loading && activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Selector de período */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Agrupar por:</span>
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
              <p className="p-8 text-center text-sm text-text-muted">Sin datos de ventas</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 11, fill: '#888' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#888' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #e5e5e0',
                        borderRadius: '12px',
                        fontSize: '13px',
                      }}
                      formatter={(value: any) => formatCLP(Number(value))}
                    />
                    <Bar dataKey="totalRevenue" fill="#5C7D6B" radius={[6, 6, 0, 0]} name="Ingresos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Tabla de ventas */}
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
      {!loading && activeTab === 'products' && (
        <div className="space-y-6">
          {/* Gráfico de barras horizontal */}
          <Card title="Top 15 — Más Vendidos" padding="none">
            {topProducts.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">Sin datos de ventas</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={Math.max(300, topProducts.length * 28)}>
                  <BarChart
                    data={[...topProducts].reverse()} // invertir para que el #1 quede arriba
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="productDescription"
                      tick={{ fontSize: 11, fill: '#555' }}
                      tickLine={false}
                      axisLine={false}
                      width={115}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #e5e5e0',
                        borderRadius: '12px',
                        fontSize: '13px',
                      }}
                      formatter={(value: any) => [`${value} uds.`, 'Vendido']}
                    />
                    <Bar dataKey="totalSold" fill="#7D6B5C" radius={[0, 6, 6, 0]} name="Unidades" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Tabla */}
          {topProducts.length > 0 && (
            <Card title="Detalle" padding="none">
              <div className="overflow-x-auto">
                <table className="facore-table w-full">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th>Vendido</th>
                      <th>Ventas</th>
                      <th>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.productId}>
                        <td className="font-semibold text-text-muted">{i + 1}</td>
                        <td>
                          <div>
                            <span className="font-medium">{p.productDescription}</span>
                            <span className="text-xs text-text-muted ml-2">{p.productId}</span>
                          </div>
                        </td>
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
      {!loading && activeTab === 'stock' && stockData && (
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

          {/* Distribución por ubicación */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de torta */}
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
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, value }) =>
                          `${name} (${value})`
                        }
                        labelLine={{ stroke: '#ccc', strokeWidth: 1 }}
                      >
                        {stockData.distribution.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #e5e5e0',
                          borderRadius: '12px',
                          fontSize: '13px',
                        }}
                        formatter={(value: any) => [`${value} uds.`, 'Items']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Tabla distribución */}
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

          {/* Alertas stock bajo */}
          {stockData.lowStock.length > 0 && (
            <Card title={`⚠️ Productos bajo stock mínimo (${stockData.lowStock.length})`} padding="none">
              <div className="overflow-x-auto">
                <table className="facore-table w-full">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Ubicación</th>
                      <th>Stock</th>
                      <th>Mínimo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockData.lowStock.map(item => (
                      <tr key={`${item.productId}-${item.locationId}`}>
                        <td>
                          <div>
                            <span className="font-medium">{item.productDescription}</span>
                            <span className="text-xs text-text-muted ml-2">{item.productId}</span>
                          </div>
                        </td>
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

      {!loading && activeTab === 'stock' && !stockData && (
        <p className="text-center text-sm text-text-muted py-8">Cargando datos de stock...</p>
      )}
    </div>
  );
};

export default ReportsPage;
