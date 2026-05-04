# Fase 2: Ventas + Aprobación — Plan de Implementación

> **Para Hermes:** Usar subagent-driven-development para implementar tarea por tarea.

**Goal:** Implementar el flujo vendedora→admin: registrar ventas desde celular, dejarlas pendientes de aprobación, y permitir al admin aprobar/rechazar con descuento de stock automático.

**Architecture:** Express API REST con PostgreSQL. Backend en `server/routes/sales.ts` (endpoints). Frontend React con Tailwind en `pages/SalesPage.tsx` (vendedora) y `pages/ApprovalsPage.tsx` (admin). DB ya tiene tabla `pending_sales`. Tipos ya definidos en `types.ts`. AppContext ya tiene stubs.

**Tech Stack:** TypeScript, Express 5, React 19, PostgreSQL (pg), Tailwind CSS 4, bcrypt, JWT

---

## Contexto del flujo (definido por Mario)

1. **Vendedora** (rol `vendedora`) desde su celular entra a la app
2. Ve la pantalla de ventas → selecciona producto, cantidad, precio
3. Registra la venta → queda en estado `pending`
4. **Admin** (rol `admin`) entra al panel de aprobaciones
5. Ve todas las ventas pendientes de todas las vendedoras
6. Puede **aprobar** (→ crea movimiento SALE, descuenta stock) o **rechazar** (con notas)
7. La vendedora puede ver el estado de sus ventas

---

## Backend — server/routes/sales.ts

### Task 1: POST /api/sales — Registrar venta pendiente

**Objective:** Permitir a una vendedora registrar una venta que queda pendiente de aprobación

**Files:**
- Modify: `server/routes/sales.ts`

**Step 1: Escribir el endpoint**

```typescript
// POST /api/sales — vendedora registra venta (queda pendiente)
router.post('/', requireRole('vendedora', 'admin'), async (req, res) => {
  try {
    const { productId, locationId, quantity, price } = req.body;
    const sellerUsername = req.user!.username;

    // Validaciones
    if (!productId || !locationId || !quantity || !price) {
      res.status(400).json({ error: 'Faltan campos: productId, locationId, quantity, price' });
      return;
    }
    if (quantity <= 0 || price <= 0) {
      res.status(400).json({ error: 'Cantidad y precio deben ser positivos' });
      return;
    }

    // Verificar stock disponible
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    const stockCheck = await pool.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2',
      [productId, locationId]
    );
    const available = stockCheck.rows[0] ? Number(stockCheck.rows[0].quantity) : 0;
    if (available < quantity) {
      res.status(400).json({ 
        error: `Stock insuficiente. Disponible: ${available}, solicitado: ${quantity}` 
      });
      return;
    }

    // Crear venta pendiente
    const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO pending_sales (id, product_id, location_id, quantity, price, seller_username, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [id, productId, locationId, quantity, price, sellerUsername]
    );

    await logAudit('INFO', 'sales', `Venta pendiente creada: ${id}`, {
      productId, locationId, quantity, price, sellerUsername
    });

    res.status(201).json({ id, status: 'pending', message: 'Venta registrada — pendiente de aprobación' });
  } catch (err: any) {
    console.error('Error creando venta pendiente:', err);
    res.status(500).json({ error: 'Error al registrar la venta' });
  }
});
```

**Step 2: Probar con curl (requiere servidor corriendo y token)**

```bash
# Login como vendedora
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"vendedora1","password":"test123"}' -c cookies.txt

# Registrar venta
curl -X POST http://localhost:3000/api/sales \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"productId":"VT-001","locationId":"LOC-01","quantity":2,"price":15000}'
```

**Verification:** Respuesta 201 con `{ id, status: 'pending' }`. Verificar en DB: `SELECT * FROM pending_sales WHERE status='pending'`.

---

### Task 2: GET /api/sales/pending — Listar ventas pendientes

**Objective:** Admin ve todas las pendientes; vendedora solo las suyas

**Files:**
- Modify: `server/routes/sales.ts`

**Step 1: Escribir el endpoint**

```typescript
// GET /api/sales/pending — listar pendientes (admin: todas, vendedora: las suyas)
router.get('/pending', requireRole('vendedora', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    let query = `
      SELECT ps.*, p.description as product_description, l.name as location_name
      FROM pending_sales ps
      JOIN products p ON ps.product_id = p.id_venta
      JOIN locations l ON ps.location_id = l.id
    `;
    const params: any[] = [];

    if (req.user!.role === 'vendedora') {
      query += ' WHERE ps.seller_username = $1';
      params.push(req.user!.username);
    }

    query += ' ORDER BY ps.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error listando ventas pendientes:', err);
    res.status(500).json({ error: 'Error al listar ventas pendientes' });
  }
});
```

**Step 2: Probar**

```bash
# Admin ve todas
curl http://localhost:3000/api/sales/pending -b cookies_admin.txt

# Vendedora solo ve las suyas
curl http://localhost:3000/api/sales/pending -b cookies_vendedora.txt
```

**Verification:** Admin recibe todas las pendientes. Vendedora solo recibe las de su `seller_username`.

---

### Task 3: POST /api/sales/:id/approve — Aprobar venta

**Objective:** Admin aprueba → crea movimiento SALE + descuenta stock

**Files:**
- Modify: `server/routes/sales.ts`

**Step 1: Escribir el endpoint**

```typescript
// POST /api/sales/:id/approve — admin aprueba venta pendiente
router.post('/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    // Buscar venta pendiente
    const sale = await pool.query(
      'SELECT * FROM pending_sales WHERE id = $1 AND status = $2',
      [id, 'pending']
    );
    if (sale.rows.length === 0) {
      res.status(404).json({ error: 'Venta pendiente no encontrada o ya procesada' });
      return;
    }

    const s = sale.rows[0];

    // Verificar stock nuevamente
    const stockCheck = await pool.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2',
      [s.product_id, s.location_id]
    );
    const available = stockCheck.rows[0] ? Number(stockCheck.rows[0].quantity) : 0;
    if (available < Number(s.quantity)) {
      res.status(400).json({ error: `Stock insuficiente. Disponible: ${available}` });
      return;
    }

    // Transacción: aprobar + movimiento + descuento
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Actualizar pending_sale
      await client.query(
        `UPDATE pending_sales SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2`,
        [req.user!.username, id]
      );

      // 2. Crear movimiento de tipo SALE
      const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await client.query(
        `INSERT INTO movements (id, product_id, from_location_id, quantity, type, timestamp, price, cost, created_by)
         VALUES ($1, $2, $3, $4, 'SALE', $5, $6, $7, $8)`,
        [
          movementId,
          s.product_id,
          s.location_id,
          s.quantity,
          new Date().toISOString(),
          s.price,
          0, // cost se puede calcular después
          req.user!.username
        ]
      );

      // 3. Descontar stock
      await client.query(
        `UPDATE stock SET quantity = quantity - $1, updated_at = NOW()
         WHERE product_id = $2 AND location_id = $3`,
        [s.quantity, s.product_id, s.location_id]
      );

      await client.query('COMMIT');

      await logAudit('INFO', 'sales', `Venta aprobada: ${id}`, {
        productId: s.product_id, quantity: s.quantity, approvedBy: req.user!.username
      });

      res.json({ id, status: 'approved', movementId, message: 'Venta aprobada y stock descontado' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error aprobando venta:', err);
    res.status(500).json({ error: 'Error al aprobar la venta' });
  }
});
```

**Step 2: Probar**

```bash
curl -X POST http://localhost:3000/api/sales/sale-xxx/approve -b cookies_admin.txt
```

**Verification:** Respuesta 200 con `status: 'approved'` y `movementId`. Verificar en DB que el stock se descontó y el movimiento SALE existe.

---

### Task 4: POST /api/sales/:id/reject — Rechazar venta

**Objective:** Admin rechaza venta pendiente con notas opcionales

**Files:**
- Modify: `server/routes/sales.ts`

**Step 1: Escribir el endpoint**

```typescript
// POST /api/sales/:id/reject — admin rechaza venta pendiente
router.post('/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    const result = await pool.query(
      `UPDATE pending_sales SET status = 'rejected', approved_by = $1, approved_at = NOW(), notes = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [req.user!.username, notes || null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Venta pendiente no encontrada o ya procesada' });
      return;
    }

    await logAudit('INFO', 'sales', `Venta rechazada: ${id}`, {
      rejectedBy: req.user!.username, notes
    });

    res.json({ id, status: 'rejected', message: 'Venta rechazada' });
  } catch (err: any) {
    console.error('Error rechazando venta:', err);
    res.status(500).json({ error: 'Error al rechazar la venta' });
  }
});
```

**Step 2: Probar**

```bash
curl -X POST http://localhost:3000/api/sales/sale-xxx/reject \
  -H "Content-Type: application/json" \
  -b cookies_admin.txt \
  -d '{"notes":"Precio incorrecto"}'
```

**Verification:** Respuesta 200 con `status: 'rejected'`. No se descuenta stock.

---

### Task 5: GET /api/sales — Historial de ventas (aprobadas/rechazadas)

**Objective:** Listar historial de ventas para ambos roles

**Files:**
- Modify: `server/routes/sales.ts`

**Step 1: Escribir el endpoint**

```typescript
// GET /api/sales — historial de ventas
router.get('/', requireRole('vendedora', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'Base de datos no disponible' });
      return;
    }

    // Parámetros opcionales: status filter
    const status = req.query.status as string | undefined;
    let query = `
      SELECT ps.*, p.description as product_description, l.name as location_name
      FROM pending_sales ps
      JOIN products p ON ps.product_id = p.id_venta
      JOIN locations l ON ps.location_id = l.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (req.user!.role === 'vendedora') {
      conditions.push(`ps.seller_username = $${params.length + 1}`);
      params.push(req.user!.username);
    }

    if (status) {
      conditions.push(`ps.status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY ps.created_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error listando ventas:', err);
    res.status(500).json({ error: 'Error al listar ventas' });
  }
});
```

**Step 2: Commit del backend completo**

```bash
git add server/routes/sales.ts
git commit -m "feat(backend): implementar endpoints de ventas y aprobación (Fase 2)"
```

---

## Frontend — Páginas React

### Task 6: SalesPage.tsx — Pantalla de ventas para vendedora

**Objective:** Formulario mobile-first para que la vendedora registre una venta

**Files:**
- Create: `pages/SalesPage.tsx`
- Modify: `App.tsx` (reemplazar placeholder)

**Step 1: Crear la página**

```tsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';

const SalesPage: React.FC = () => {
  const { products, stock, locations, currentUser, pendingSales, fetchData, createEntity } = useApp();
  const { showToast } = useToast();

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
  }, []);

  // Actualizar precio al seleccionar producto
  useEffect(() => {
    const product = products.find(p => p.id_venta === selectedProduct);
    if (product) setPrice(product.price);
  }, [selectedProduct, products]);

  // Filtrar ubicaciones de la vendedora
  const myLocations = currentUser?.role === 'admin'
    ? locations
    : locations.filter(l => l.id === currentUser?.locationId);

  // Stock disponible en ubicación seleccionada
  const availableStock = stock.find(
    s => s.productId === selectedProduct && s.locationId === selectedLocation
  );
  const available = availableStock ? availableStock.quantity : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedLocation || quantity <= 0 || price <= 0) {
      showToast('Completa todos los campos', 'error');
      return;
    }
    if (quantity > available) {
      showToast(`Stock insuficiente. Disponible: ${available}`, 'error');
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
        showToast('✅ Venta registrada — pendiente de aprobación', 'success');
        setSelectedProduct('');
        setQuantity(1);
        setPrice(0);
        fetchData('sales/pending');
      } else {
        showToast(result.error || 'Error al registrar', 'error');
      }
    } catch {
      showToast('Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <h2 className="page-title">Nueva Venta</h2>
      <p className="page-subtitle">Registra una venta — quedará pendiente de aprobación</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 max-w-lg">
        {/* Producto */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Producto</label>
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            className="input-field w-full"
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
            className="input-field w-full"
            required
          >
            <option value="">Seleccionar ubicación...</option>
            {myLocations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Cantidad y stock */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Cantidad
            {selectedProduct && selectedLocation && (
              <span className="ml-2 text-xs text-text-muted">
                (Stock: {available})
              </span>
            )}
          </label>
          <input
            type="number"
            min={1}
            max={available || undefined}
            value={quantity}
            onChange={e => setQuantity(parseInt(e.target.value) || 0)}
            className="input-field w-full"
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
            className="input-field w-full"
            required
          />
          {quantity > 0 && price > 0 && (
            <p className="text-sm text-text-muted mt-1">
              Total: ${(quantity * price).toLocaleString('es-CL')}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedProduct || !selectedLocation || quantity <= 0 || quantity > available}
          className="btn-primary w-full py-3 text-base"
        >
          {submitting ? 'Registrando...' : 'Registrar Venta'}
        </button>
      </form>

      {/* Mis ventas recientes */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-text mb-3">Mis ventas recientes</h3>
        <div className="space-y-2">
          {pendingSales.filter(s => s.sellerUsername === currentUser?.username).slice(0, 10).map(sale => (
            <div key={sale.id} className="card p-3 flex justify-between items-center">
              <div>
                <p className="font-medium text-sm">{sale.productId}</p>
                <p className="text-xs text-text-muted">
                  {sale.quantity} × ${Number(sale.price).toLocaleString('es-CL')}
                </p>
              </div>
              <span className={`badge text-xs ${
                sale.status === 'approved' ? 'badge-green' :
                sale.status === 'rejected' ? 'badge-red' : 'badge-yellow'
              }`}>
                {sale.status === 'pending' ? 'Pendiente' :
                 sale.status === 'approved' ? 'Aprobada' : 'Rechazada'}
              </span>
            </div>
          ))}
          {pendingSales.filter(s => s.sellerUsername === currentUser?.username).length === 0 && (
            <p className="text-sm text-text-muted">No tienes ventas registradas aún</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesPage;
```

**Step 2: Integrar en App.tsx — reemplazar placeholder de #/sales**

```typescript
import SalesPage from './pages/SalesPage';

// En renderPage():
case '#/sales': return <SalesPage />;
```

**Step 3: Commit**

```bash
git add pages/SalesPage.tsx App.tsx
git commit -m "feat(frontend): página de ventas para vendedora (Fase 2)"
```

---

### Task 7: ApprovalsPage.tsx — Panel de aprobación para admin

**Objective:** Admin ve todas las ventas pendientes y puede aprobar/rechazar

**Files:**
- Create: `pages/ApprovalsPage.tsx`
- Modify: `App.tsx` (reemplazar placeholder)

**Step 1: Crear la página**

```tsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';

const ApprovalsPage: React.FC = () => {
  const { pendingSales, products, approveSale, rejectSale, fetchData } = useApp();
  const { showToast } = useToast();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  useEffect(() => {
    fetchData('sales/pending');
    fetchData('products');
  }, []);

  // Solo mostrar pendientes
  const pending = pendingSales.filter(s => s.status === 'pending');

  const handleApprove = async (saleId: string) => {
    try {
      await approveSale(saleId);
      showToast('✅ Venta aprobada — stock descontado', 'success');
      fetchData('sales/pending');
    } catch {
      showToast('Error al aprobar', 'error');
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    try {
      await rejectSale(rejectId, rejectNotes || undefined);
      showToast('Venta rechazada', 'success');
      setRejectId(null);
      setRejectNotes('');
      fetchData('sales/pending');
    } catch {
      showToast('Error al rechazar', 'error');
    }
  };

  const getProductDesc = (productId: string) => {
    const p = products.find(p => p.id_venta === productId);
    return p ? `${p.id_venta} — ${p.description}` : productId;
  };

  return (
    <div className="page-container animate-fade-in">
      <h2 className="page-title">Aprobaciones Pendientes</h2>
      <p className="page-subtitle">
        {pending.length} venta{pending.length !== 1 ? 's' : ''} esperando revisión
      </p>

      {pending.length === 0 ? (
        <div className="mt-8 p-12 border-2 border-dashed border-border rounded-xl text-center text-text-muted">
          <p className="text-lg font-medium">Sin pendientes</p>
          <p className="text-sm mt-2">Todas las ventas han sido revisadas</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {pending.map(sale => (
            <div key={sale.id} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                <div className="flex-1">
                  <p className="font-medium">{getProductDesc(sale.productId)}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-text-muted">
                    <span>Cantidad: <strong>{sale.quantity}</strong></span>
                    <span>Precio: <strong>${Number(sale.price).toLocaleString('es-CL')}</strong></span>
                    <span>Total: <strong>${(Number(sale.quantity) * Number(sale.price)).toLocaleString('es-CL')}</strong></span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    Vendedora: {sale.sellerUsername} · {new Date(sale.createdAt).toLocaleString('es-CL')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(sale.id)}
                    className="btn-primary text-sm py-2 px-4"
                  >
                    ✓ Aprobar
                  </button>
                  <button
                    onClick={() => setRejectId(sale.id)}
                    className="btn-danger text-sm py-2 px-4"
                  >
                    ✗ Rechazar
                  </button>
                </div>
              </div>

              {/* Modal de rechazo */}
              {rejectId === sale.id && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800 mb-2">Motivo del rechazo (opcional)</p>
                  <textarea
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    className="input-field w-full text-sm"
                    rows={2}
                    placeholder="Ej: Precio incorrecto, stock no coincide..."
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleReject} className="btn-danger text-sm py-2 px-4">
                      Confirmar rechazo
                    </button>
                    <button
                      onClick={() => { setRejectId(null); setRejectNotes(''); }}
                      className="btn-ghost text-sm py-2 px-4"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApprovalsPage;
```

**Step 2: Integrar en App.tsx**

```typescript
import ApprovalsPage from './pages/ApprovalsPage';

// En renderPage():
case '#/approvals': return <ApprovalsPage />;
```

**Step 3: Commit**

```bash
git add pages/ApprovalsPage.tsx App.tsx
git commit -m "feat(frontend): panel de aprobaciones para admin (Fase 2)"
```

---

### Task 8: Prueba de integración completa

**Objective:** Verificar el flujo completo vendedora→admin

**Step 1: Levantar servidor**

```bash
cd /opt/data/facore-inventory && npm run dev
```

**Step 2: Probar flujo completo**

```bash
# 1. Login como vendedora
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c /tmp/cookies_v.txt \
  -d '{"username":"vendedora","password":"test123"}'

# 2. Registrar venta
curl -X POST http://localhost:3000/api/sales \
  -H "Content-Type: application/json" \
  -b /tmp/cookies_v.txt \
  -d '{"productId":"existing-product","locationId":"BODCENT","quantity":1,"price":10000}'

# 3. Login como admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c /tmp/cookies_a.txt \
  -d '{"username":"admin","password":"admin123"}'

# 4. Ver pendientes
curl http://localhost:3000/api/sales/pending -b /tmp/cookies_a.txt

# 5. Aprobar
curl -X POST http://localhost:3000/api/sales/{id}/approve -b /tmp/cookies_a.txt

# 6. Verificar stock descontado
curl http://localhost:3000/api/stock -b /tmp/cookies_a.txt
```

**Verification:** El stock del producto en la ubicación debe haberse reducido en la cantidad vendida.

---

### Task 9: Commit final de Fase 2

```bash
git add -A
git commit -m "feat: Fase 2 completa — Ventas + Aprobación (vendedora→admin)"
```

---

## Resumen de tareas

| # | Tarea | Archivo | Tipo |
|---|-------|---------|------|
| 1 | POST /api/sales | `server/routes/sales.ts` | Backend |
| 2 | GET /api/sales/pending | `server/routes/sales.ts` | Backend |
| 3 | POST /api/sales/:id/approve | `server/routes/sales.ts` | Backend |
| 4 | POST /api/sales/:id/reject | `server/routes/sales.ts` | Backend |
| 5 | GET /api/sales (historial) | `server/routes/sales.ts` | Backend |
| 6 | SalesPage.tsx | `pages/SalesPage.tsx` + `App.tsx` | Frontend |
| 7 | ApprovalsPage.tsx | `pages/ApprovalsPage.tsx` + `App.tsx` | Frontend |
| 8 | Prueba integración | — | QA |
| 9 | Commit final | — | Git |

---

## Componentes existentes (usar en vez de clases custom)

- **`<Button variant="primary|secondary|danger|ghost" size="sm|md|lg" loading>`** — `components/Button.tsx`
- **`<Card title="..." action={...} padding="none|sm|md|lg">`** — `components/Card.tsx`

Los inputs/selects/textarea ya tienen estilos globales desde `index.css` (líneas 124-137). No usar clases inventadas como `btn-*`, `card`, `input-field`.

## Riesgos

- **Stock insuficiente entre registro y aprobación:** Se valida stock al registrar Y al aprobar. Si otra venta consumió el stock, la aprobación falla.
- **Roles:** `requireRole` ya existe y funciona. La vendedora solo ve sus ventas, el admin ve todas.
- **Badges de estado:** No existe componente badge. Usar spans con clases Tailwind directamente: `bg-sage-lighter text-sage` para aprobado, `bg-amber-light text-amber` para pendiente, `bg-brick-light text-brick` para rechazado.

## Verificación final

- [ ] Vendedora puede registrar venta → queda pendiente
- [ ] Admin ve todas las pendientes
- [ ] Admin puede aprobar → stock descontado, movimiento SALE creado
- [ ] Admin puede rechazar con notas → stock intacto
- [ ] Vendedora solo ve sus propias ventas
- [ ] Stock insuficiente muestra error claro
