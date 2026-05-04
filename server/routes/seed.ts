import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../config/database.js';
import bcrypt from 'bcrypt';

const router = Router();
router.use(requireDb);

// ── POST /api/seed — Datos de prueba ──
router.post('/', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const pool = req.db!;

  // Ubicaciones de prueba
  const locations = [
    { id: 'BODCENT', name: 'Bodega Central', type: 'WAREHOUSE' },
    { id: 'TIENDA1', name: 'Tienda Principal', type: 'FIXED_STORE_PERMANENT' },
    { id: 'TIENDA2', name: 'Tienda Mall', type: 'FIXED_STORE_PERMANENT' },
    { id: 'TEMP1', name: 'Feria Fin de Semana', type: 'FIXED_STORE_TEMPORARY' },
    { id: 'IND1', name: 'Distribuidor Norte', type: 'INDIRECT_STORE' },
    { id: 'WEB', name: 'Tienda Online', type: 'ONLINE_STORE' },
    { id: 'CASA', name: 'Depósito Casa', type: 'HOME_STORE' },
  ];

  for (const loc of locations) {
    await pool.query(
      `INSERT INTO locations (id, name, type) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = $2, type = $3`,
      [loc.id, loc.name, loc.type]
    );
  }

  // Productos de prueba (ropa)
  const products = [
    { id: 'VT-001', fab: 'FAB-001', desc: 'Blusa Seda Natural', price: 15900, cost: 8000, cat: 'Blusas', min: 5 },
    { id: 'VT-002', fab: 'FAB-001', desc: 'Blusa Algodón Premium', price: 12900, cost: 6500, cat: 'Blusas', min: 5 },
    { id: 'VT-003', fab: 'FAB-002', desc: 'Vestido Primavera Estampado', price: 24900, cost: 14000, cat: 'Vestidos', min: 3 },
    { id: 'VT-004', fab: 'FAB-002', desc: 'Vestido Cóctel Negro', price: 35900, cost: 20000, cat: 'Vestidos', min: 3 },
    { id: 'VT-005', fab: 'FAB-003', desc: 'Falda Plisada Larga', price: 18900, cost: 10000, cat: 'Faldas', min: 4 },
    { id: 'VT-006', fab: 'FAB-003', desc: 'Falda Lápiz Oficina', price: 16900, cost: 9000, cat: 'Faldas', min: 3 },
    { id: 'VT-007', fab: 'FAB-004', desc: 'Pantalón Palazzo Lino', price: 22900, cost: 13000, cat: 'Pantalones', min: 4 },
    { id: 'VT-008', fab: 'FAB-004', desc: 'Pantalón Cargo Algodón', price: 19900, cost: 11000, cat: 'Pantalones', min: 4 },
    { id: 'VT-009', fab: 'FAB-005', desc: 'Chaqueta Entretiempo Beige', price: 39900, cost: 24000, cat: 'Chaquetas', min: 3 },
    { id: 'VT-010', fab: 'FAB-005', desc: 'Chaqueta Denim Oversize', price: 34900, cost: 20000, cat: 'Chaquetas', min: 3 },
    { id: 'VT-011', fab: 'FAB-006', desc: 'Camiseta Básica Algodón Blanco', price: 7900, cost: 3500, cat: 'Básicos', min: 10 },
    { id: 'VT-012', fab: 'FAB-006', desc: 'Camiseta Básica Algodón Negro', price: 7900, cost: 3500, cat: 'Básicos', min: 10 },
    { id: 'VT-013', fab: 'FAB-007', desc: 'Suéter Cachemira Cuello V', price: 45900, cost: 28000, cat: 'Suéteres', min: 3 },
    { id: 'VT-014', fab: 'FAB-007', desc: 'Suéter Lana Merino Crewneck', price: 39900, cost: 24000, cat: 'Suéteres', min: 3 },
    { id: 'VT-015', fab: 'FAB-008', desc: 'Abrigo Largo Paño', price: 69900, cost: 42000, cat: 'Abrigos', min: 2 },
    { id: 'VT-016', fab: 'FAB-008', desc: 'Abrigo Trench Clásico', price: 59900, cost: 36000, cat: 'Abrigos', min: 2 },
    { id: 'VT-017', fab: 'FAB-009', desc: 'Bufanda Cashmere Gris', price: 29900, cost: 16000, cat: 'Accesorios', min: 5 },
    { id: 'VT-018', fab: 'FAB-009', desc: 'Cinturón Piel Italiana', price: 25900, cost: 14000, cat: 'Accesorios', min: 5 },
    { id: 'VT-019', fab: 'FAB-010', desc: 'Polera Manga Larga Rayas', price: 13900, cost: 7000, cat: 'Básicos', min: 6 },
    { id: 'VT-020', fab: 'FAB-010', desc: 'Polerón Algodón Felpado', price: 19900, cost: 11000, cat: 'Básicos', min: 5 },
  ];

  let prodCount = 0;
  for (const p of products) {
    await pool.query(
      `INSERT INTO products (id_venta, id_fabrica, description, price, cost, min_stock, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id_venta) DO UPDATE SET description = $3, price = $4, cost = $5, min_stock = $6, category = $7`,
      [p.id, p.fab, p.desc, p.price, p.cost, p.min, p.cat]
    );
    prodCount++;
  }

  // Stock inicial en BODCENT
  let stockCount = 0;
  for (const p of products) {
    const qty = p.min * 3 + Math.floor(Math.random() * 10);
    await pool.query(
      `INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, 'BODCENT', $2)
       ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock.quantity + $2`,
      [p.id, qty]
    );
    stockCount++;
  }

  // Stock en otras ubicaciones
  const extraStock = [
    { prod: 'VT-001', loc: 'TIENDA1', qty: 8 },
    { prod: 'VT-002', loc: 'TIENDA1', qty: 6 },
    { prod: 'VT-003', loc: 'TIENDA1', qty: 4 },
    { prod: 'VT-005', loc: 'TIENDA2', qty: 5 },
    { prod: 'VT-007', loc: 'TIENDA2', qty: 4 },
    { prod: 'VT-011', loc: 'TIENDA1', qty: 15 },
    { prod: 'VT-012', loc: 'TIENDA1', qty: 12 },
    { prod: 'VT-011', loc: 'TIENDA2', qty: 8 },
    { prod: 'VT-012', loc: 'TIENDA2', qty: 10 },
    { prod: 'VT-001', loc: 'TEMP1', qty: 3 },
    { prod: 'VT-006', loc: 'TEMP1', qty: 2 },
    { prod: 'VT-009', loc: 'IND1', qty: 4 },
  ];

  for (const s of extraStock) {
    await pool.query(
      `INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock.quantity + $3`,
      [s.prod, s.loc, s.qty]
    );
    stockCount++;
  }

  // Usuarios de prueba
  const users = [
    { id: 'usr-admin', user: 'admin', pass: 'admin123', role: 'admin', name: 'Administrador' },
    { id: 'usr-op', user: 'operador', pass: 'oper123', role: 'operador', name: 'Operador' },
    { id: 'usr-vend', user: 'vendedora', pass: 'vend123', role: 'vendedora', name: 'Vendedora Tienda 1', loc: 'TIENDA1' },
    { id: 'usr-visita', user: 'visita', pass: 'visi123', role: 'visita', name: 'Visita' },
  ];

  let userCount = 0;
  for (const u of users) {
    const hash = await bcrypt.hash(u.pass, 12);
    await pool.query(
      `INSERT INTO users (id, username, password, role, display_name, location_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET password = $3, role = $4, display_name = $5`,
      [u.id, u.user, hash, u.role, u.name, u.loc || null]
    );
    userCount++;
  }

  await logAudit('INFO', 'seed', `Datos de prueba: ${prodCount} productos, ${stockCount} stock, ${userCount} usuarios`);
  ok(res, {
    message: 'Datos de prueba generados',
    products: prodCount,
    stock: stockCount,
    locations: locations.length,
    users: userCount,
    credentials: [
      { user: 'admin', pass: 'admin123', role: 'admin' },
      { user: 'operador', pass: 'oper123', role: 'operador' },
      { user: 'vendedora', pass: 'vend123', role: 'vendedora' },
      { user: 'visita', pass: 'visi123', role: 'visita' },
    ],
  });
}));

export default router;
