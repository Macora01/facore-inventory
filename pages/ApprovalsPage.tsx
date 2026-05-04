import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import Button from '../components/Button';
import Card from '../components/Card';

const ApprovalsPage: React.FC = () => {
  const { pendingSales, products, locations, approveSale, rejectSale, fetchData } = useApp();
  const { addToast } = useToast();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchData('sales/pending');
    fetchData('products');
    fetchData('locations');
  }, []);

  // Solo pendientes
  const pending = pendingSales.filter(s => s.status === 'pending');

  const getProductInfo = (productId: string) => {
    const p = products.find(p => p.id_venta === productId);
    return p ? `${p.id_venta} — ${p.description}` : productId;
  };

  const getLocationName = (locationId: string) => {
    const l = locations.find(l => l.id === locationId);
    return l ? l.name : locationId;
  };

  const handleApprove = async (saleId: string) => {
    setProcessing(saleId);
    try {
      await approveSale(saleId);
      addToast('Venta aprobada — stock descontado', 'success');
      fetchData('sales/pending');
      fetchData('stock');
    } catch {
      addToast('Error al aprobar', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    setProcessing(rejectingId);
    try {
      await rejectSale(rejectingId, rejectNotes || undefined);
      addToast('Venta rechazada', 'success');
      setRejectingId(null);
      setRejectNotes('');
      fetchData('sales/pending');
    } catch {
      addToast('Error al rechazar', 'error');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Aprobaciones Pendientes</h2>
          <p className="page-subtitle">
            {pending.length} venta{pending.length !== 1 ? 's' : ''} esperando revisión
          </p>
        </div>
      </div>

      {pending.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-text-muted">
            <p className="text-lg font-medium">Sin pendientes</p>
            <p className="text-sm mt-2">Todas las ventas han sido revisadas</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map(sale => (
            <Card key={sale.id} padding="lg">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text">{getProductInfo(sale.productId)}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-text-secondary">
                    <span>
                      Cantidad: <strong className="text-text">{sale.quantity}</strong>
                    </span>
                    <span>
                      Precio:{' '}
                      <strong className="text-text">
                        ${Number(sale.price).toLocaleString('es-CL')}
                      </strong>
                    </span>
                    <span>
                      Total:{' '}
                      <strong className="text-text">
                        ${(Number(sale.quantity) * Number(sale.price)).toLocaleString('es-CL')}
                      </strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-text-muted">
                    <span>Vendedora: {sale.sellerUsername}</span>
                    <span>Ubicación: {getLocationName(sale.locationId)}</span>
                    <span>{new Date(sale.createdAt).toLocaleString('es-CL')}</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={processing === sale.id && rejectingId !== sale.id}
                    disabled={processing !== null}
                    onClick={() => handleApprove(sale.id)}
                  >
                    Aprobar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={processing !== null}
                    onClick={() => {
                      setRejectingId(sale.id);
                      setRejectNotes('');
                    }}
                  >
                    Rechazar
                  </Button>
                </div>
              </div>

              {/* Panel de rechazo */}
              {rejectingId === sale.id && (
                <div className="mt-4 p-4 bg-brick-light/30 border border-brick/20 rounded-lg">
                  <p className="text-sm font-medium text-brick mb-2">
                    Motivo del rechazo (opcional)
                  </p>
                  <textarea
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    className="w-full"
                    rows={2}
                    placeholder="Ej: Precio incorrecto, stock no coincide..."
                    autoFocus
                  />
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={processing === sale.id}
                      disabled={processing !== null}
                      onClick={handleReject}
                    >
                      Confirmar rechazo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={processing === sale.id}
                      onClick={() => {
                        setRejectingId(null);
                        setRejectNotes('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApprovalsPage;
