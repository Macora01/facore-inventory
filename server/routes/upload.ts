import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../config/database.js';
import Papa from 'papaparse';
import XLSX from 'xlsx';

const router = Router();
router.use(requireDb);

/** Auto-detectar separador y parsear CSV */
function parseCSV(text: string): any[] {
  for (const delim of [';', ',', '\t']) {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: delim });
    if (parsed.data.length > 0) {
      const keys = Object.keys(parsed.data[0] as any);
      if (keys.length >= 2) return parsed.data as any[];
    }
  }
  return Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ',' }).data as any[];
}

/** Convierte fecha chilena (dd-mm-aa), ISO, o número serial de Excel a ISO 8601 */
function parseTimestamp(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const s = String(raw).trim();
  if (!s) return new Date().toISOString();
  if (/^\d{4,6}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial >= 40000 && serial <= 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (year >= 2000 && year <= 2100) {
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
    return d.toISOString();
  }
  return new Date().toISOString();
}

function parseXLSX(input: string): any[] {
  const workbook = XLSX.read(input, { type: 'base64' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

function parseInput(body: any): { data: any[]; error?: string } {
  if (body.csv && typeof body.csv === 'string') {
    return { data: parseCSV(body.csv) };
  }
  if (body.xlsx && typeof body.xlsx === 'string') {
    try { return { data: parseXLSX(body.xlsx) }; }
    catch (err: any) { return { data: [], error: `Error leyendo XLSX: ${err.message}` }; }
  }
  return { data: [], error: 'Se requiere csv (texto) o xlsx (base64)' };
}

function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  let s = String(val).trim();
  s = s.replace(/[$€£]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function cleanInt(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Math.round(cleanNum(val));
  return isNaN(n) ? fallback : n;
}

// ═══════════════════════════════════════════════════════════
// Validación estricta: todo o nada
// ═══════════════════════════════════════════════════════════

// ── POST /api/upload/products ──
router.post('/products', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = parseInput(req.body);
  if (error) { fail(res, error); return; }
  if (!data || data.length === 0) { fail(res, 'El archivo está vacío'); return; }

  const pool = req.db!;
  const errors: string[] = [];

  // ── Fase 1: validar todo ──
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const idVenta = row.id_venta || row.codigo || row.cod_venta;
    const description = row.description || row.descripcion || row.producto;
    if (!idVenta) errors.push(`Fila ${i + 1}: falta código (id_venta)`);
    if (!description) errors.push(`Fila ${i + 1}: falta descripción`);
  }
  if (errors.length > 0) { fail(res, `Formato inválido. No se procesó nada.`, 400); return; }

  // ── Fase 2: procesar ──
  let created = 0;
  let skipped = 0;
  for (const row of data) {
    const idVenta = row.id_venta || row.codigo || row.cod_venta;
    const idFabrica = row.id_fabrica || row.cod_fabrica || '';
    const description = row.description || row.descripcion || row.producto || '';
    const price = cleanNum(row.price || row.precio);
    const cost = cleanNum(row.cost || row.costo);
    const minStock = cleanInt(row.min_stock || row.stock_minimo, 2);
    const category = row.category || row.categoria || '';
    const qty = cleanInt(row.qty || row.cantidad || row.stock);

    const exists = await pool.query('SELECT id_venta FROM products WHERE id_venta = $1', [idVenta]);
    if (exists.rows.length > 0) { skipped++; continue; }

    await pool.query(
      `INSERT INTO products (id_venta, id_fabrica, description, price, cost, min_stock, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [idVenta, idFabrica, description, price, cost, minStock, category]
    );
    if (qty > 0) {
      await pool.query(
        `INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, 'BODCENT', $2)
         ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock.quantity + $2`,
        [idVenta, qty]
      );
      const movId = `MOV-BULK-${Date.now()}-${created}-${Math.random().toString(36).slice(2, 6)}`;
      await pool.query(
        `INSERT INTO movements (id, product_id, to_location_id, quantity, type, timestamp, created_by)
         VALUES ($1, $2, 'BODCENT', $3, 'INITIAL_LOAD', $4, 'carga_masiva')`,
        [movId, idVenta, qty, new Date().toISOString()]
      );
    }
    created++;
  }

  await logAudit('INFO', 'upload', `Carga productos: ${created} nuevos, ${skipped} existentes saltados`);
  ok(res, { created, skipped }, 201);
}));

// ── POST /api/upload/transfers ──
router.post('/transfers', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = parseInput(req.body);
  if (error) { fail(res, error); return; }
  if (!data || data.length === 0) { fail(res, 'El archivo está vacío'); return; }

  const pool = req.db!;
  const errors: string[] = [];

  // ── Fase 1: validar todo ──
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const idVenta = row.id_venta || row.codigo || row.cod_venta;
    const fromLoc = row.sitio_inicial || row.desde || row.origen;
    const toLoc = row.sitio_final || row.hasta || row.destino;
    const qty = parseInt(row.qty || row.cantidad || '0');
    if (!idVenta) errors.push(`Fila ${i + 1}: falta código`);
    if (!fromLoc) errors.push(`Fila ${i + 1}: falta sitio_inicial`);
    if (!toLoc) errors.push(`Fila ${i + 1}: falta sitio_final`);
    if (!qty || qty <= 0) errors.push(`Fila ${i + 1}: cantidad inválida`);
  }
  if (errors.length > 0) { fail(res, `Formato inválido. No se procesó nada.\n${errors.join('\n')}`, 400); return; }

  // Validar que productos y ubicaciones existan
  const allIds = [...new Set(data.map((r: any) => r.id_venta || r.codigo || r.cod_venta))];
  const allLocs = [...new Set([
    ...data.map((r: any) => r.sitio_inicial || r.desde || r.origen),
    ...data.map((r: any) => r.sitio_final || r.hasta || r.destino),
  ])];

  const prodResult = await pool.query('SELECT id_venta FROM products WHERE id_venta = ANY($1)', [allIds]);
  const existingProds = new Set(prodResult.rows.map((r: any) => r.id_venta));
  const locResult = await pool.query('SELECT id FROM locations WHERE id = ANY($1)', [allLocs]);
  const existingLocs = new Set(locResult.rows.map((r: any) => r.id));

  for (const id of allIds) { if (!existingProds.has(id)) errors.push(`Producto no existe: ${id}`); }
  for (const id of allLocs) { if (!existingLocs.has(id)) errors.push(`Ubicación no existe: ${id}`); }
  if (errors.length > 0) { fail(res, `Validación fallida. No se procesó nada.\n${errors.join('\n')}`, 400); return; }

  // Validar stock suficiente en origen
  const stockMap = new Map<string, number>();
  for (const row of data) {
    const idVenta = row.id_venta || row.codigo || row.cod_venta;
    const fromLoc = row.sitio_inicial || row.desde || row.origen;
    const qty = parseInt(row.qty || row.cantidad || '0');
    const key = `${idVenta}::${fromLoc}`;
    stockMap.set(key, (stockMap.get(key) || 0) + qty);
  }
  for (const [key, needed] of stockMap) {
    const [idVenta, fromLoc] = key.split('::');
    const r = await pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2', [idVenta, fromLoc]);
    const available = r.rows[0] ? Number(r.rows[0].quantity) : 0;
    if (available < needed) errors.push(`Stock insuficiente en ${fromLoc}: ${idVenta} (necesita ${needed}, tiene ${available})`);
  }
  if (errors.length > 0) { fail(res, `Stock insuficiente. No se procesó nada.\n${errors.join('\n')}`, 400); return; }

  // ── Fase 2: procesar ──
  let count = 0;
  for (const row of data) {
    const idVenta = row.id_venta || row.codigo || row.cod_venta;
    const fromLocation = row.sitio_inicial || row.desde || row.origen;
    const toLocation = row.sitio_final || row.hasta || row.destino;
    const qty = parseInt(row.qty || row.cantidad || '0');
    const ts = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO movements (id, product_id, from_location_id, to_location_id, quantity, type, timestamp, created_by)
         VALUES ($1, $2, $3, $4, $5, 'TRANSFER_OUT', $6, $7)`,
        [`mov-${Date.now()}-${count}-out`, idVenta, fromLocation, toLocation, qty, ts, req.user!.username]
      );
      await client.query('UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3', [qty, idVenta, fromLocation]);
      await client.query(
        `INSERT INTO movements (id, product_id, from_location_id, to_location_id, quantity, type, timestamp, created_by)
         VALUES ($1, $2, $3, $4, $5, 'TRANSFER_IN', $6, $7)`,
        [`mov-${Date.now()}-${count}-in`, idVenta, fromLocation, toLocation, qty, ts, req.user!.username]
      );
      await client.query(
        `INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock.quantity + $3, updated_at = NOW()`,
        [idVenta, toLocation, qty]
      );
      await client.query('COMMIT'); count++;
    } catch (txErr) { await client.query('ROLLBACK'); throw txErr; }
    finally { client.release(); }
  }

  await logAudit('INFO', 'upload', `Transferencias: ${count} procesadas`);
  ok(res, { count });
}));

// ── POST /api/upload/sales ──
router.post('/sales', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = parseInput(req.body);
  if (error) { fail(res, error); return; }
  if (!data || data.length === 0) { fail(res, 'El archivo está vacío'); return; }

  const pool = req.db!;
  const errors: string[] = [];

  // ── Fase 1: validar todo ──
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const idVenta = row.id_venta || row.cod_venta || row.codigo;
    const locationId = row.lugar || row.location_id || row.ubicacion;
    const price = parseFloat(row.precio || row.price || '0');
    const qty = parseInt(row.qty || row.cantidad || '0');
    if (!idVenta) errors.push(`Fila ${i + 1}: falta código`);
    if (!locationId) errors.push(`Fila ${i + 1}: falta lugar/ubicación`);
    if (!price || price <= 0) errors.push(`Fila ${i + 1}: precio inválido`);
    if (!qty || qty <= 0) errors.push(`Fila ${i + 1}: cantidad inválida`);
  }
  if (errors.length > 0) { fail(res, `Formato inválido. No se procesó nada.\n${errors.join('\n')}`, 400); return; }

  // Validar productos y ubicaciones
  const allIds = [...new Set(data.map((r: any) => r.id_venta || r.cod_venta || r.codigo))];
  const allLocs = [...new Set(data.map((r: any) => r.lugar || r.location_id || r.ubicacion))];
  const prodResult = await pool.query('SELECT id_venta FROM products WHERE id_venta = ANY($1)', [allIds]);
  const existingProds = new Set(prodResult.rows.map((r: any) => r.id_venta));
  const locResult = await pool.query('SELECT id FROM locations WHERE id = ANY($1)', [allLocs]);
  const existingLocs = new Set(locResult.rows.map((r: any) => r.id));
  for (const id of allIds) { if (!existingProds.has(id)) errors.push(`Producto no existe: ${id}`); }
  for (const id of allLocs) { if (!existingLocs.has(id)) errors.push(`Ubicación no existe: ${id}`); }
  if (errors.length > 0) { fail(res, `Validación fallida. No se procesó nada.\n${errors.join('\n')}`, 400); return; }

  // ── Fase 2: procesar ──
  let count = 0;
  for (const row of data) {
    const idVenta = row.id_venta || row.cod_venta || row.codigo;
    const locationId = row.lugar || row.location_id || row.ubicacion;
    const price = parseFloat(row.precio || row.price || '0');
    const qty = parseInt(row.qty || row.cantidad || '1');
    const timestamp = parseTimestamp(row.timestamp || row.fecha);
    const prod = await pool.query('SELECT cost FROM products WHERE id_venta = $1', [idVenta]);
    const cost = prod.rows[0]?.cost ? parseFloat(prod.rows[0].cost) : 0;

    const saleId = `sale-bulk-${Date.now()}-${count}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO pending_sales (id, product_id, location_id, quantity, price, seller_username, status, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, 'admin', 'approved', 'admin', NOW())`,
        [saleId, idVenta, locationId, qty, price]
      );
      await client.query(
        `INSERT INTO movements (id, product_id, from_location_id, quantity, type, timestamp, price, cost, created_by)
         VALUES ($1, $2, $3, $4, 'SALE', $5, $6, $7, $8)`,
        [`mov-sale-bulk-${Date.now()}-${count}`, idVenta, locationId, qty, timestamp, price, cost, req.user!.username]
      );
      await client.query(
        `UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3`,
        [qty, idVenta, locationId]
      );
      await client.query('COMMIT'); count++;
    } catch (txErr) { await client.query('ROLLBACK'); throw txErr; }
    finally { client.release(); }
  }

  await logAudit('INFO', 'upload', `Ventas masivas: ${count} procesadas`);
  ok(res, { count });
}));

export default router;
