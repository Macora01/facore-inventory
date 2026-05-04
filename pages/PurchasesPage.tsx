import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { PURCHASE_STATUS_LABEL, PurchaseOrderStatus } from '../types';

const statuses = Object.entries(PURCHASE_STATUS_LABEL);

const PurchasesPage: React.FC = () => {
  const { purchaseOrders, fetchData } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchData('purchases');
  }, []);

  return (
    <div className="page-container animate-fade-in">
      <h2 className="page-title">Órdenes de Compra</h2>
      <p className="page-subtitle">{purchaseOrders.length} órdenes registradas</p>

      {purchaseOrders.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-text-muted">
            <p className="text-lg font-medium">Sin órdenes de compra</p>
            <p className="text-sm mt-2">Usa la carga masiva por CSV para registrar productos y movimientos</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {purchaseOrders.map(po => {
            const items = (po as any).items || [];
            const statusKey = po.status as PurchaseOrderStatus;

            return (
              <Card key={po.id} padding="md">
                <div
                  className="flex justify-between items-start cursor-pointer"
                  onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                >
                  <div>
                    <p className="font-medium">{po.supplierName}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {po.orderDate && `Pedido: ${po.orderDate}`}
                      {po.expectedArrival && ` · Llegada: ${po.expectedArrival}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {po.totalCost && (
                      <span className="text-sm font-medium">
                        ${Number(po.totalCost).toLocaleString('es-CL')}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      statusKey === 'received' ? 'bg-sage-lighter text-sage' :
                      statusKey === 'cancelled' ? 'bg-brick-light text-brick' :
                      statusKey === 'shipped' ? 'bg-amber-light text-amber' :
                      'bg-clay-lighter text-clay-dark'
                    }`}>
                      {PURCHASE_STATUS_LABEL[statusKey] || po.status}
                    </span>
                  </div>
                </div>

                {expanded === po.id && items.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <table className="facore-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th className="text-right">Pedido</th>
                          <th className="text-right">Recibido</th>
                          <th className="text-right">Costo unit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any, i: number) => (
                          <tr key={i}>
                            <td className="text-sm">{item.productId}</td>
                            <td className="text-right">{item.quantityOrdered}</td>
                            <td className="text-right">{item.quantityReceived}</td>
                            <td className="text-right">
                              {item.unitCost ? `$${Number(item.unitCost).toLocaleString('es-CL')}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {po.notes && (
                  <p className="mt-2 text-xs text-text-muted italic">{po.notes}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PurchasesPage;
