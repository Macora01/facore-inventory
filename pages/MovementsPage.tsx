import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { MOVEMENT_TYPE_LABEL, MovementType } from '../types';

const movementTypes = Object.entries(MOVEMENT_TYPE_LABEL);

const MovementsPage: React.FC = () => {
  const { movements, fetchData } = useApp();
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    fetchData('movements');
  }, []);

  const filtered = useMemo(() => {
    if (!typeFilter) return movements;
    return movements.filter(m => m.type === typeFilter);
  }, [movements, typeFilter]);

  return (
    <div className="page-container animate-fade-in">
      <h2 className="page-title">Movimientos</h2>
      <p className="page-subtitle">{movements.length} movimientos registrados</p>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter('')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
            ${!typeFilter ? 'bg-clay text-white' : 'bg-canvas text-text-secondary border border-border hover:border-clay-light'}`}
        >
          Todos
        </button>
        {movementTypes.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
              ${typeFilter === key ? 'bg-clay text-white' : 'bg-canvas text-text-secondary border border-border hover:border-clay-light'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="facore-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Producto</th>
                <th className="text-right">Cantidad</th>
                <th>Origen</th>
                <th>Destino</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id}>
                  <td className="text-xs whitespace-nowrap">
                    {new Date(m.timestamp).toLocaleString('es-CL', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-clay-lighter/40 text-clay-dark">
                      {MOVEMENT_TYPE_LABEL[m.type as MovementType] || m.type}
                    </span>
                  </td>
                  <td className="text-sm">
                    <span className="font-medium">{m.productId}</span>
                    {m.productDescription && <span className="text-xs text-text-muted ml-1">— {m.productDescription}</span>}
                  </td>
                  <td className="text-right font-medium">{m.quantity}</td>
                  <td className="text-xs text-text-muted">{m.fromLocationId || '—'}</td>
                  <td className="text-xs text-text-muted">{m.toLocationId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-text-muted text-sm">
            No hay movimientos registrados
          </div>
        )}
      </Card>
    </div>
  );
};

export default MovementsPage;
