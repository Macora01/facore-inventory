import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Button from '../components/Button';
import Card from '../components/Card';

const SalesPage: React.FC = () => {
  const { products, stock, locations, currentUser, pendingSales, fetchData, createEntity } = useApp();
  const { addToast } = useToast();

  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(currentUser?.locationId || '');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Cargar datos al montar
  useEffect(() => {
    fetchData('products');
    fetchData('locations');
    fetchData('sales/pending');
    fetchData('stock');
  }, []);

  // Actualizar precio al seleccionar producto
  useEffect(() => {
    const product = products.find(p => p.id_venta === selectedProduct);
    if (product) setPrice(product.price);
  }, [selectedProduct, products]);

  // Filtrar ubicaciones — admin ve todas, vendedora solo la suya
  const myLocations = currentUser?.role === 'admin'
    ? locations.filter(l => l.isActive !== false)
    : locations.filter(l => l.id === currentUser?.locationId);

  // Stock disponible en ubicación seleccionada
  const availableStock = stock.find(
    s => s.productId === selectedProduct && s.locationId === selectedLocation
  );
  const available = availableStock ? availableStock.quantity : 0;

  const isValid = selectedProduct && selectedLocation && quantity > 0 && price > 0;
  const canSubmit = isValid && quantity <= available;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (quantity > available) {
        addToast(`Stock insuficiente. Disponible: ${available}`, 'error');
      } else {
        addToast('Completa todos los campos', 'error');
      }
      return;
    }

    setSubmitting(true);
    try {
      const result = await createEntity('sales', {
        productId: selectedProduct,
        locationId: selectedLocation,
        quantity,
        price,
      });
      if (result.id) {
        addToast('Venta registrada — pendiente de aprobación', 'success');
        setSelectedProduct('');
        setQuantity(1);
        setPrice(0);
        fetchData('sales/pending');
        fetchData('stock');
      } else {
        addToast(result.error || 'Error al registrar', 'error');
      }
    } catch {
      addToast('Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Mis ventas recientes (pendientes + últimas procesadas)
  const mySales = pendingSales
    .filter(s => s.sellerUsername === currentUser?.username)
    .slice(0, 10);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sage-lighter text-sage">Aprobada</span>;
      case 'rejected':
        return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brick-light text-brick">Rechazada</span>;
      default:
        return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-light text-amber">Pendiente</span>;
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <h2 className="page-title">Nueva Venta</h2>
      <p className="page-subtitle">Registra una venta — quedará pendiente de aprobación</p>

      <Card padding="lg">
        <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
          {/* Producto */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Producto</label>
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              required
            >
              <option value="">Seleccionar producto...</option>
              {products.map(p => (
                <option key={p.id_venta} value={p.id_venta}>
                  {p.id_venta} — {p.description} (${p.price.toLocaleString('es-CL')})
                </option>
              ))}
            </select>
          </div>

          {/* Ubicación */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Ubicación</label>
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              required
            >
              <option value="">Seleccionar ubicación...</option>
              {myLocations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Cantidad
              {selectedProduct && selectedLocation && (
                <span className="ml-2 text-xs font-normal text-text-muted">
                  (Stock disponible: {available})
                </span>
              )}
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 0)}
              required
            />
          </div>

          {/* Precio */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Precio unitario</label>
            <input
              type="number"
              min={0}
              value={price}
              onChange={e => setPrice(parseInt(e.target.value) || 0)}
              required
            />
            {quantity > 0 && price > 0 && (
              <p className="text-sm text-text-muted mt-1">
                Total: ${(quantity * price).toLocaleString('es-CL')}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!canSubmit}
            className="w-full"
          >
            {submitting ? 'Registrando...' : 'Registrar Venta'}
          </Button>
        </form>
      </Card>

      {/* Mis ventas recientes */}
      <Card title={`Mis ventas recientes`} padding="none">
        {mySales.length === 0 ? (
          <div className="p-5 text-center text-sm text-text-muted">
            No tienes ventas registradas aún
          </div>
        ) : (
          <div className="divide-y divide-border">
            {mySales.map(sale => (
              <div key={sale.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{sale.productId}</p>
                  <p className="text-xs text-text-muted">
                    {sale.quantity} × ${Number(sale.price).toLocaleString('es-CL')}
                    {' · '}
                    Total: ${(Number(sale.quantity) * Number(sale.price)).toLocaleString('es-CL')}
                  </p>
                  <p className="text-xs text-text-muted">
                    {new Date(sale.createdAt).toLocaleString('es-CL')}
                  </p>
                </div>
                {statusBadge(sale.status)}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default SalesPage;
