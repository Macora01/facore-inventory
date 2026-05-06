import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Card from '../components/Card';
import {
  ArrowDown, ArrowUp, ArrowRightLeft, ShoppingCart, RotateCcw,
  Package, Search, MapPin, TrendingUp, X
} from 'lucide-react';
import type { TraceabilitySummary } from '../types';
import { MOVEMENT_TYPE_LABEL } from '../types';

const API = '/api';

// ── Icono + color por tipo de movimiento ──
const movementMeta: Record<string, { icon: React.FC<{ size?: number }>; color: string; bg: string }> = {
  INITIAL_LOAD:   { icon: Package, color: 'text-sage', bg: 'bg-sage/10' },
  TRANSFER_IN:    { icon: ArrowDown, color: 'text-sage', bg: 'bg-sage/10' },
  TRANSFER_OUT:   { icon: ArrowUp, color: 'text-amber', bg: 'bg-amber/10' },
  SALE:           { icon: ShoppingCart, color: 'text-clay', bg: 'bg-clay/10' },
  ADJUSTMENT:     { icon: ArrowRightLeft, color: 'text-text-secondary', bg: 'bg-surface border border-border' },
  REVERSION:      { icon: RotateCcw, color: 'text-brick', bg: 'bg-brick/10' },
};

const TraceabilityPage: React.FC = () => {
  const { products } = useApp();
  const { addToast } = useToast();

  const [searchCode, setSearchCode] = useState('');
  const [foundProduct, setFoundProduct] = useState<{ id_venta: string; id_fabrica: string } | null>(null);
  const [data, setData] = useState<TraceabilitySummary | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Buscar producto ──
  const handleSearch = () => {
    const code = searchCode.trim().toUpperCase();
    if (!code) return;

    const match = products.find(
      p => p.id_venta.toUpperCase() === code || p.id_fabrica.toUpperCase() === code
    );

    if (match) {
      setFoundProduct({ id_venta: match.id_venta, id_fabrica: match.id_fabrica });
    } else {
      addToast(`Producto no encontrado: ${code}`, 'error');
    }
  };

  // ── Cargar trazabilidad al encontrar producto ──
  useEffect(() => {
    if (!foundProduct) return;

    setLoading(true);
    fetch(`${API}/traceability/${encodeURIComponent(foundProduct.id_venta)}`, {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Producto sin datos');
        return res.json();
      })
      .then(json => setData(json))
      .catch(err => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [foundProduct]);

  // ── Limpiar búsqueda ──
  const clearSearch = () => {
    setSearchCode('');
    setFoundProduct(null);
    setData(null);
  };

  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const formatCLP = (n: number) =>
    '$' + Math.round(n).toLocaleString('es-CL');

  // ── Render ──
  return (
    <div className="page-container animate-fade-in space-y-6">
      <h2 className="page-title">Trazabilidad</h2>
      <p className="page-subtitle">Historial completo de movimientos de un producto</p>

      {/* ── Búsqueda ── */}
      <Card>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">
              Código del producto
            </label>
            <input
              type="text"
              value={searchCode}
              onChange={e => setSearchCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="VT-001 o FAB-001"
              autoFocus
            />
          </div>
          <button
            onClick={handleSearch}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-clay text-white
                       hover:bg-clay-dark transition-colors min-h-[44px] font-medium"
          >
            <Search size={18} />
            Buscar
          </button>
          {foundProduct && (
            <button
              onClick={clearSearch}
              className="p-3 rounded-lg border border-border hover:bg-surface
                         text-text-muted hover:text-text transition-colors min-h-[44px]"
              title="Limpiar búsqueda"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted mt-2">
          Ingresa el código de venta (VT-001) o código de fábrica (FAB-001)
        </p>
      </Card>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-clay border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Sin selección ── */}
      {!loading && !foundProduct && (
        <div className="mt-8 p-16 border-2 border-dashed border-border rounded-xl text-center">
          <Search size={40} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-secondary font-medium">
            Busca un producto para ver su trazabilidad
          </p>
          <p className="text-sm text-text-muted mt-2">
            Aparecerá el historial completo de movimientos, desde el más reciente al más antiguo
          </p>
        </div>
      )}

      {/* ── Resultados ── */}
      {!loading && data && (
        <div className="space-y-6">
          {/* ── Info del producto ── */}
          <Card>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-clay/10 flex items-center justify-center shrink-0">
                <Package size={24} className="text-clay" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-text">
                  {data.product.description}
                </h3>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-sm">
                  <span className="text-text-muted">
                    Venta: <strong className="text-text">{data.product.id_venta}</strong>
                  </span>
                  <span className="text-text-muted">
                    Fábrica: <strong className="text-text">{data.product.id_fabrica}</strong>
                  </span>
                  {data.product.category && (
                    <span className="text-text-muted">
                      Categoría: <strong className="text-text">{data.product.category}</strong>
                    </span>
                  )}
                </div>
                <div className="flex gap-4 mt-2 text-sm">
                  <span>Precio: <strong>{formatCLP(data.product.price)}</strong></span>
                  <span>Costo: <strong>{formatCLP(data.product.cost)}</strong></span>
                  <span>Stock mín: <strong>{data.product.minStock ?? 2}</strong></span>
                </div>
              </div>
            </div>
          </Card>

          {/* ── Resumen numérico ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl bg-sage/5 border border-sage/15">
              <p className="text-xs text-text-muted uppercase tracking-wider">Total Comprado</p>
              <p className="text-2xl font-bold text-sage mt-1">{data.totalPurchased}</p>
            </div>
            <div className="p-5 rounded-xl bg-clay/5 border border-clay/15">
              <p className="text-xs text-text-muted uppercase tracking-wider">Total Vendido</p>
              <p className="text-2xl font-bold text-clay mt-1">{data.totalSold}</p>
            </div>
            <div className="p-5 rounded-xl bg-surface border border-border">
              <p className="text-xs text-text-muted uppercase tracking-wider">En Stock</p>
              <p className="text-2xl font-bold text-text mt-1">
                {data.totalInStock}
                {data.product.minStock && data.totalInStock <= data.product.minStock && (
                  <span className="text-sm font-normal text-brick ml-2">⚠ Bajo</span>
                )}
              </p>
            </div>
          </div>

          {/* ── Stock por ubicación + Ventas por ubicación ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stock por ubicación */}
            <Card title="Stock por Ubicación" padding="none">
              {data.stockByLocation.length === 0 ? (
                <p className="p-5 text-sm text-text-muted">Sin stock registrado</p>
              ) : (
                <div className="divide-y divide-border">
                  {data.stockByLocation.map(sl => (
                    <div key={sl.locationId} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-text-muted" />
                        <span className="text-sm font-medium">{sl.locationName}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{sl.quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Ventas por ubicación */}
            <Card title="Ventas por Ubicación" padding="none">
              {data.salesByLocation.length === 0 ? (
                <p className="p-5 text-sm text-text-muted">Sin ventas registradas</p>
              ) : (
                <div className="divide-y divide-border">
                  {data.salesByLocation.map(sl => (
                    <div key={sl.locationId} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-text-muted" />
                        <span className="text-sm font-medium">{sl.locationName}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold tabular-nums">{sl.quantity}</span>
                        <span className="text-xs text-text-muted ml-2">({sl.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Timeline LIFO ── */}
          <Card title={`Historial de Movimientos (${data.history.length})`} padding="none">
            {data.history.length === 0 ? (
              <p className="p-5 text-sm text-text-muted">Sin movimientos registrados</p>
            ) : (
              <div className="relative">
                {data.history.map((m, i) => {
                  const meta = movementMeta[m.type] || movementMeta.ADJUSTMENT;
                  const label = MOVEMENT_TYPE_LABEL[m.type as keyof typeof MOVEMENT_TYPE_LABEL] || m.type;
                  const isLast = i === data.history.length - 1;

                  return (
                    <div key={m.id || i} className="relative flex gap-4 px-5 py-3">
                      {/* Línea conectora vertical */}
                      {!isLast && (
                        <div className="absolute left-[35px] top-12 bottom-0 w-px bg-border" />
                      )}

                      {/* Icono */}
                      <div className={`relative z-10 w-10 h-10 rounded-full ${meta.bg} ${meta.color}
                                      flex items-center justify-center shrink-0 mt-0.5`}>
                        <meta.icon size={18} />
                      </div>

                      {/* Contenido */}
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-text">{label}</span>
                          <span className="text-xs text-text-muted">
                            {formatDate(m.timestamp)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-sm">
                          <span className="font-medium tabular-nums">{m.quantity} uds.</span>
                          {m.price && (
                            <span className="text-text-muted">× {formatCLP(m.price)}</span>
                          )}
                        </div>

                        {/* Origen → Destino */}
                        {(m.fromLocationId || m.toLocationId) && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-text-muted">
                            {m.fromLocationId ? (
                              <span>{m.fromLocationId}</span>
                            ) : (
                              <span className="italic">—</span>
                            )}
                            <ArrowRightLeft size={12} />
                            {m.toLocationId ? (
                              <span>{m.toLocationId}</span>
                            ) : (
                              <span className="italic">—</span>
                            )}
                          </div>
                        )}

                        {m.reason && (
                          <p className="text-xs text-text-muted mt-0.5 italic">
                            {m.reason}
                          </p>
                        )}
                      </div>

                      {/* Badge de cantidad (derecha) */}
                      <div className="text-right shrink-0">
                        <span className={`text-sm font-semibold tabular-nums
                          ${m.type === 'SALE' || m.type === 'TRANSFER_OUT'
                            ? 'text-brick'
                            : 'text-sage'
                          }`}>
                          {m.type === 'SALE' || m.type === 'TRANSFER_OUT' ? '−' : '+'}
                          {m.quantity}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default TraceabilityPage;
