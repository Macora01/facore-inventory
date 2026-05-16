import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Card from '../components/Card';
import { Search, AlertTriangle, Download, Plus, Trash2, Save, Wrench } from 'lucide-react';
import { useToast } from '../hooks/useToast';

const InventoryPage: React.FC = () => {
  const { products, stock, locations, fetchData } = useApp();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    id_venta: '',
    id_fabrica: '',
    description: '',
    price: '',
    cost: '',
    min_stock: '',
    category: '',
    initial_stock: '',
  });
  const [saving, setSaving] = useState(false);

  // ── Ajuste manual ──
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustProductDesc, setAdjustProductDesc] = useState('');
  const [adjustLocationId, setAdjustLocationId] = useState('');
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT_OUT' | 'ADJUSTMENT_IN'>('ADJUSTMENT_OUT');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

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
      map[s.productId].total += Number(s.quantity);
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

  // ── CRUD ──
  const resetForm = () => {
    setEditingId(null);
    setForm({ id_venta: '', id_fabrica: '', description: '', price: '', cost: '', min_stock: '', category: '', initial_stock: '' });
    setShowForm(false);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ id_venta: '', id_fabrica: '', description: '', price: '', cost: '', min_stock: '', category: '', initial_stock: '' });
    setShowForm(true);
  };

  const openEdit = (p: typeof products[0]) => {
    setEditingId(p.id_venta);
    setForm({
      id_venta: p.id_venta,
      id_fabrica: p.id_fabrica || '',
      description: p.description,
      price: String(p.price),
      cost: String(p.cost),
      min_stock: p.minStock != null ? String(p.minStock) : '',
      category: p.category || '',
      initial_stock: '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.id_venta.trim() || !form.description.trim()) {
      addToast('Código y descripción son obligatorios', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        id_venta: form.id_venta.trim(),
        id_fabrica: form.id_fabrica.trim() || form.id_venta.trim(),
        description: form.description.trim(),
        price: Number(form.price) || 0,
        cost: Number(form.cost) || 0,
        min_stock: form.min_stock ? Number(form.min_stock) : null,
        category: form.category.trim() || null,
        initialStock: form.initial_stock ? Number(form.initial_stock) : 0,
      };

      if (editingId) {
        // Editar
        const res = await fetch(`/api/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Error al actualizar');
        addToast('Producto actualizado', 'success');
      } else {
        // Crear
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Error al crear');
        addToast('Producto creado', 'success');
      }
      resetForm();
      fetchData('products');
    } catch (err: any) {
      addToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`¿Eliminar el producto ${id}?`)) return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Error al eliminar');
      addToast('Producto eliminado', 'success');
      fetchData('products');
      if (selectedProduct === id) setSelectedProduct(null);
    } catch (err: any) {
      addToast(err.message || 'Error al eliminar', 'error');
    }
  };

  // ── Ajuste ──
  const openAdjust = (p: typeof products[0]) => {
    setAdjustProductId(p.id_venta);
    setAdjustProductDesc(p.description);
    setAdjustLocationId('BODCENT');
    setAdjustType('ADJUSTMENT_OUT');
    setAdjustQuantity('');
    setAdjustReason('');
    setShowAdjust(true);
  };

  const handleAdjustSubmit = async () => {
    const qty = Number(adjustQuantity);
    if (!qty || qty <= 0) { addToast('Cantidad debe ser un número positivo', 'error'); return; }
    if (!adjustReason.trim()) { addToast('El motivo es obligatorio', 'error'); return; }

    setAdjustSaving(true);
    try {
      const res = await fetch('/api/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: adjustProductId,
          locationId: adjustLocationId,
          quantity: qty,
          type: adjustType,
          reason: adjustReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar ajuste');
      }
      addToast('Ajuste registrado', 'success');
      setShowAdjust(false);
      fetchData('stock');
    } catch (err: any) {
      addToast(err.message || 'Error al guardar ajuste', 'error');
    } finally {
      setAdjustSaving(false);
    }
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
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus size={14} className="mr-1" />
            Nuevo
          </Button>
          <Button variant="secondary" size="sm" onClick={exportToCSV}>
            <Download size={14} className="mr-1" />
            Excel
          </Button>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código o descripción..."
            className="pr-9"
          />
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
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

      {/* Formulario de edición */}
      {showForm && (
        <Card title={editingId ? `Editar ${editingId}` : 'Nuevo producto'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Código</label>
              <input
                type="text"
                value={form.id_venta}
                onChange={e => setForm({ ...form, id_venta: e.target.value })}
                disabled={!!editingId}
                className={editingId ? 'opacity-60' : ''}
                placeholder="Ej: PROD-001"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">ID Fábrica</label>
              <input
                type="text"
                value={form.id_fabrica}
                onChange={e => setForm({ ...form, id_fabrica: e.target.value })}
                placeholder="Ej: FAB-001"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Descripción</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Nombre del producto"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Precio</label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Costo</label>
              <input
                type="number"
                value={form.cost}
                onChange={e => setForm({ ...form, cost: e.target.value })}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Stock mínimo</label>
              <input
                type="number"
                value={form.min_stock}
                onChange={e => setForm({ ...form, min_stock: e.target.value })}
                placeholder="0"
                min="0"
              />
            </div>
            {!editingId && (
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">
                  Stock inicial <span className="text-text-muted font-normal">(BODCENT)</span>
                </label>
                <input
                  type="number"
                  value={form.initial_stock}
                  onChange={e => setForm({ ...form, initial_stock: e.target.value })}
                  placeholder="0"
                  min="0"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Categoría</label>
              <input
                type="text"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="Ej: Lencería"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              <Save size={14} className="mr-1" />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button variant="secondary" size="sm" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

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
                <th className="w-20">Acciones</th>
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
                    <td>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          className="p-1 rounded text-text-muted hover:text-clay hover:bg-surface transition-colors"
                          title="Ajustar stock"
                          onClick={() => openAdjust(p)}
                        >
                          <Wrench size={14} />
                        </button>
                        <button
                          className="p-1 rounded text-text-muted hover:text-clay hover:bg-surface transition-colors"
                          title="Editar"
                          onClick={() => openEdit(p)}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          className="p-1 rounded text-text-muted hover:text-brick hover:bg-surface transition-colors"
                          title="Eliminar"
                          onClick={() => handleDelete(p.id_venta)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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

      {/* Modal de ajuste */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdjust(false)} />
          <Card title={`Ajustar stock — ${adjustProductId}`} className="relative z-10 w-full max-w-md mx-4">
            <p className="text-sm text-text-secondary mb-4">{adjustProductDesc}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Tipo</label>
                <select value={adjustType} onChange={e => setAdjustType(e.target.value as any)}>
                  <option value="ADJUSTMENT_OUT">Baja (pérdida, estropeo)</option>
                  <option value="ADJUSTMENT_IN">Alta (recuperación, devolución)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Ubicación</label>
                <select value={adjustLocationId} onChange={e => setAdjustLocationId(e.target.value)}>
                  {locations.filter(l => l.isActive !== false).map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  value={adjustQuantity}
                  onChange={e => setAdjustQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">
                  Motivo <span className="text-brick">*</span>
                </label>
                <textarea
                  rows={2}
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="Ej: prenda estropeada en lavado, pérdida en traslado..."
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant={adjustType === 'ADJUSTMENT_OUT' ? 'danger' : 'primary'}
                size="md"
                onClick={handleAdjustSubmit}
                disabled={adjustSaving}
              >
                {adjustSaving ? 'Guardando...' : adjustType === 'ADJUSTMENT_OUT' ? 'Registrar baja' : 'Registrar alta'}
              </Button>
              <Button variant="secondary" size="md" onClick={() => setShowAdjust(false)}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}

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
