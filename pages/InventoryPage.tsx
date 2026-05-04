import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Card from '../components/Card';
import { Search, AlertTriangle, Download } from 'lucide-react';

const InventoryPage: React.FC = () => {
  const { products, stock, locations, fetchData } = useApp();
  const [search, setSearch] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  useEffect(() => {
    fetchData('products');
    fetchData('stock');
    fetchData('locations');
  }, []);

  // Calcular stock total y bajo mínimo por producto
  const productStock = useMemo(() => {
    const map: Record<string, { total: number; byLocation: { locId: string; locName: string; qty: number }[] }> = {};

    stock.forEach(s => {
      if (!map[s.productId]) map[s.productId] = { total: 0, byLocation: [] };
      map[s.productId].total += s.quantity;
      const loc = locations.find(l => l.id === s.locationId);
      map[s.productId].byLocation.push({
        locId: s.locationId,
        locName: loc?.name || s.locationId,
        qty: s.quantity,
      });
    });

    return map;
  }, [stock, locations]);

  // Filtrar productos
  const filtered = useMemo(() => {
    let list = products;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.id_venta.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.id_fabrica && p.id_fabrica.toLowerCase().includes(q))
      );
    }

    if (showLowStock) {
      list = list.filter(p => {
        const s = productStock[p.id_venta];
        const total = s?.total || 0;
        const min = p.minStock || 0;
        return total <= min;
      });
    }

    return list;
  }, [products, search, showLowStock, productStock]);

  const selected = selectedProduct ? products.find(p => p.id_venta === selectedProduct) : null;
  const selectedStock = selectedProduct ? productStock[selectedProduct] : null;

  const exportToCSV = () => {
    const headers = ['ID Venta', 'ID Fábrica', 'Descripción', 'Precio', 'Costo', 'Stock Total', 'Stock Mínimo', 'Categoría'];
    const rows = filtered.map(p => {
      const s = productStock[p.id_venta];
      return [
        p.id_venta,
        p.id_fabrica || '',
        p.description,
        p.price,
        p.cost,
        s?.total || 0,
        p.minStock || '',
        p.category || '',
      ];
    });

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facore-inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lowStockCount = useMemo(() => {
    return products.filter(p => {
      const s = productStock[p.id_venta];
      return (s?.total || 0) <= (p.minStock || 0);
    }).length;
  }, [products, productStock]);

  return (
    <div className="page-container animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="page-title">Catálogo</h2>
          <p className="page-subtitle">{products.length} productos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportToCSV}>
            <Download size={14} className="mr-1" />
            Excel
          </Button>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código o descripción..."
            className="pl-9"
          />
        </div>
        <Button
          variant={showLowStock ? 'danger' : 'secondary'}
          size="md"
          onClick={() => setShowLowStock(!showLowStock)}
        >
          <AlertTriangle size={14} className="mr-1" />
          Stock bajo ({lowStockCount})
        </Button>
      </div>

      {/* Tabla */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="facore-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Mín</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const s = productStock[p.id_venta];
                const total = s?.total || 0;
                const min = p.minStock || 0;
                const isLow = total <= min;

                return (
                  <tr key={p.id_venta} className="cursor-pointer" onClick={() => setSelectedProduct(selectedProduct === p.id_venta ? null : p.id_venta)}>
                    <td className="font-mono text-xs">{p.id_venta}</td>
                    <td>{p.description}</td>
                    <td className="text-right">${Number(p.price).toLocaleString('es-CL')}</td>
                    <td className="text-right">
                      <span className={isLow ? 'text-brick font-semibold' : ''}>{total}</span>
                    </td>
                    <td className="text-right text-text-muted text-xs">{min || '—'}</td>
                    <td>
                      {isLow && <AlertTriangle size={14} className="text-brick" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-text-muted text-sm">
            {search ? 'Sin resultados para tu búsqueda' : 'No hay productos registrados'}
          </div>
        )}
      </Card>

      {/* Detalle de producto seleccionado */}
      {selected && (
        <Card title={`${selected.id_venta} — ${selected.description}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider">Precio venta</p>
              <p className="font-semibold">${Number(selected.price).toLocaleString('es-CL')}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider">Costo</p>
              <p className="font-semibold">${Number(selected.cost).toLocaleString('es-CL')}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider">Stock total</p>
              <p className="font-semibold">{selectedStock?.total || 0}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider">Stock mínimo</p>
              <p className="font-semibold">{selected.minStock || '—'}</p>
            </div>
            {selected.id_fabrica && (
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">ID Fábrica</p>
                <p className="font-mono text-sm">{selected.id_fabrica}</p>
              </div>
            )}
            {selected.category && (
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">Categoría</p>
                <p>{selected.category}</p>
              </div>
            )}
          </div>

          {/* Stock por ubicación */}
          {selectedStock && selectedStock.byLocation.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Stock por ubicación
              </p>
              <div className="space-y-1">
                {selectedStock.byLocation.map(loc => (
                  <div key={loc.locId} className="flex justify-between text-sm py-1 border-b border-border-light last:border-0">
                    <span>{loc.locName}</span>
                    <span className="font-medium">{loc.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default InventoryPage;
