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
  // Intentar ; primero, luego , luego tab
  for (const delim of [';', ',', '\t']) {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: delim });
    if (parsed.data.length > 0) {
      const keys = Object.keys(parsed.data[0] as any);
      if (keys.length >= 2) return parsed.data as any[];
    }
  }
  // Fallback: coma
  return Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ',' }).data as any[];
}

/** Parsear XLSX (base64 o buffer) a array de objetos */
function parseXLSX(input: string): any[] {
  const workbook = XLSX.read(input, { type: 'base64' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

/** Parsear cualquier entrada: CSV string o XLSX base64 */
function parseInput(body: any): { data: any[]; error?: string } {
  if (body.csv && typeof body.csv === 'string') {
    return { data: parseCSV(body.csv) };
  }
  if (body.xlsx && typeof body.xlsx === 'string') {
    try {
      return { data: parseXLSX(body.xlsx) };
    } catch (err: any) {
      return { data: [], error: `Error leyendo XLSX: ${err.message}` };
    }
  }
  return { data: [], error: 'Se requiere csv (texto) o xlsx (base64)' };
}

/** Limpiar valor numérico: quita $, espacios, y separadores de miles (. ,) */
function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  let s = String(val).trim();
  // Quitar símbolo de moneda
  s = s.replace(/[$€£]/g, '');
  // Si tiene coma decimal y punto de miles (estilo chileno/europeo: 14.009,50)
  if (s.includes(',') && s.includes('.')) {
    // Asumir que el punto es separador de miles y la coma es decimal
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Limpiar valor entero */
function cleanInt(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Math.round(cleanNum(val));
  return isNaN(n) ? fallback : n;
}

// ── POST /api/upload/products ──
router.post('/products', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = parseInput(req.body);
  if (error) { fail(res, error); return; }

  const pool = req.db!;
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of data) {
    try {
      const idVenta = row.id_venta || row.codigo || row.cod_venta;
      const idFabrica = row.id_fabrica || row.cod_fabrica || '';
      const description = row.description || row.descripcion || row.producto || '';
      const price = cleanNum(row.price || row.precio);
      const cost = cleanNum(row.cost || row.costo);
      const minStock = cleanInt(row.min_stock || row.stock_minimo, 2);
      const category = row.category || row.categoria || '';
      const qty = cleanInt(row.qty || row.cantidad || row.stock);

      if (!idVenta || !description) {
        errors.push(`Fila ${created + skipped + 1}: falta código o descripción`);
        continue;
      }

      // Verificar si ya existe
      const exists = await pool.query('SELECT id_venta FROM products WHERE id_venta = $1', [idVenta]);
      if (exists.rows.length > 0) {
        skipped++;
        continue;
      }

      await pool.query(
        `INSERT INTO products (id_venta, id_fabrica, description, price, cost, min_stock, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [idVenta, idFabrica, description, price, cost, minStock, category]
      );

      // ── Stock inicial si se especificó qty ──
      if (qty > 0) {
        await pool.query(
          `INSERT INTO stock (product_id, location_id, quantity)
           VALUES ($1, 'BODCENT', $2)
           ON CONFLICT (product_id, location_id)
           DO UPDATE SET quantity = stock.quantity + $2`,
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
    } catch (err: any) {
      errors.push(`Error fila ${created + 1}: ${err.message}`);
    }
  }

  await logAudit('INFO', 'upload', `Carga productos: ${created} nuevos, ${skipped} existentes saltados`);
  ok(res, { created, skipped, errors: errors.slice(0, 10) }, 201);
}));

// ── POST /api/upload/transfers ──
router.post('/transfers', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = parseInput(req.body);
  if (error) { fail(res, error); return; }

  const pool = req.db!;
  let count = 0;
  const errors: string[] = [];

  for (const row of data) {
    try {
      const idVenta = row.id_venta || row.codigo || row.cod_venta;
      const fromLocation = row.sitio_inicial || row.desde || row.origen;
      const toLocation = row.sitio_final || row.hasta || row.destino;
      const qty = parseInt(row.qty || row.cantidad || '0');

      if (!idVenta || !fromLocation || !toLocation || !qty) {
        errors.push(`Fila ${count + 1}: faltan campos`); continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const stockFrom = await client.query(
          'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2 FOR UPDATE',
          [idVenta, fromLocation]
        );
        const available = stockFrom.rows[0] ? Number(stockFrom.rows[0].quantity) : 0;
        if (available < qty) {
          errors.push(`Fila ${count + 1}: stock insuficiente en ${fromLocation} (${idVenta}: ${available})`);
          await client.query('ROLLBACK'); continue;
        }

        const ts = new Date().toISOString();
        await client.query(
          `INSERT INTO movements (id, product_id, from_location_id, to_location_id, quantity, type, timestamp, created_by)
           VALUES ($1, $2, $3, $4, $5, 'TRANSFER_OUT', $6, $7)`,
          [`mov-${Date.now()}-${count}-out`, idVenta, fromLocation, toLocation, qty, ts, req.user!.username]
        );
        await client.query(
          'UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3',
          [qty, idVenta, fromLocation]
        );
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
    } catch (err: any) {
      errors.push(`Error fila ${count + 1}: ${err.message}`);
    }
  }

  await logAudit('INFO', 'upload', `Transferencias: ${count} procesadas`);
  ok(res, { count, errors: errors.slice(0, 10) });
}));

// ── POST /api/upload/sales ──
router.post('/sales', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = parseInput(req.body);
  if (error) { fail(res, error); return; }

  const pool = req.db!;
  let count = 0;
  const errors: string[] = [];

  for (const row of data) {
    try {
      const idVenta = row.id_venta || row.cod_venta || row.codigo;
      const locationId = row.lugar || row.location_id || row.ubicacion;
      const price = parseFloat(row.precio || row.price || '0');
      const qty = parseInt(row.qty || row.cantidad || '1');
      const timestamp = row.timestamp || row.fecha || new Date().toISOString();

      if (!idVenta || !locationId) {
        errors.push(`Fila ${count + 1}: falta código o ubicación`); continue;
      }

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
          `INSERT INTO movements (id, product_id, from_location_id, quantity, type, timestamp, price, created_by)
           VALUES ($1, $2, $3, $4, 'SALE', $5, $6, $7)`,
          [`mov-sale-bulk-${Date.now()}-${count}`, idVenta, locationId, qty, timestamp, price, req.user!.username]
        );
        await client.query(
          `UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3`,
          [qty, idVenta, locationId]
        );
        await client.query('COMMIT'); count++;
      } catch (txErr) { await client.query('ROLLBACK'); throw txErr; }
      finally { client.release(); }
    } catch (err: any) {
      errors.push(`Error fila ${count + 1} (${row.id_venta || '?'}): ${err.message}`);
    }
  }

  await logAudit('INFO', 'upload', `Ventas masivas: ${count} procesadas`);
  ok(res, { count, errors: errors.slice(0, 10) });
}));

export default router;
