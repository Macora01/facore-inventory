import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../config/database.js';
import Papa from 'papaparse';

const router = Router();
router.use(requireDb);

// ── POST /api/upload/products — Carga masiva de productos ──
router.post('/products', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    fail(res, 'Se requiere el campo csv con el contenido del archivo');
    return;
  }

  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true, delimiter: ';' });
  // Intentar con coma si no hay columnas con ;
  const data = parsed.data.length > 0 && Object.keys(parsed.data[0] as any).length > 1
    ? parsed.data
    : Papa.parse(csv, { header: true, skipEmptyLines: true, delimiter: ',' }).data;

  const pool = req.db!;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of data as any[]) {
    try {
      const idVenta = row.id_venta || row.codigo || row.cod_venta;
      const idFabrica = row.id_fabrica || row.cod_fabrica || '';
      const description = row.description || row.descripcion || row.producto || '';
      const price = parseFloat(row.price || row.precio || '0');
      const cost = parseFloat(row.cost || row.costo || '0');
      const minStock = parseInt(row.min_stock || row.stock_minimo || '2');
      const category = row.category || row.categoria || '';

      if (!idVenta || !description) {
        errors.push(`Fila ${created + updated + 1}: falta código o descripción`);
        continue;
      }

      await pool.query(
        `INSERT INTO products (id_venta, id_fabrica, description, price, cost, min_stock, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id_venta) DO UPDATE SET
           id_fabrica = $2, description = $3, price = $4, cost = $5,
           min_stock = $6, category = $7`,
        [idVenta, idFabrica, description, price, cost, minStock, category]
      );
      created++;
    } catch (err: any) {
      errors.push(`Error en fila ${created + updated + 1}: ${err.message}`);
    }
  }

  await logAudit('INFO', 'upload', `Carga masiva productos: ${created} creados/actualizados`);

  ok(res, { created, updated, errors: errors.slice(0, 10) }, 201);
}));

// ── POST /api/upload/transfers — Transferencias masivas ──
router.post('/transfers', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    fail(res, 'Se requiere el campo csv');
    return;
  }

  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const data = parsed.data.length > 0 && Object.keys(parsed.data[0] as any).length > 1
    ? parsed.data
    : Papa.parse(csv, { header: true, skipEmptyLines: true, delimiter: ';' }).data;

  const pool = req.db!;
  let count = 0;
  const errors: string[] = [];

  for (const row of data as any[]) {
    try {
      const idVenta = row.id_venta || row.codigo || row.cod_venta;
      const fromLocation = row.sitio_inicial || row.desde || row.origen;
      const toLocation = row.sitio_final || row.hasta || row.destino;
      const qty = parseInt(row.qty || row.cantidad || '0');

      if (!idVenta || !fromLocation || !toLocation || !qty) {
        errors.push(`Fila ${count + 1}: faltan campos`);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Verificar stock origen
        const stockFrom = await client.query(
          'SELECT quantity FROM stock WHERE product_id = $1 AND location_id = $2 FOR UPDATE',
          [idVenta, fromLocation]
        );
        const available = stockFrom.rows[0] ? Number(stockFrom.rows[0].quantity) : 0;
        if (available < qty) {
          errors.push(`Fila ${count + 1}: stock insuficiente en ${fromLocation} (${idVenta}: ${available})`);
          await client.query('ROLLBACK');
          continue;
        }

        // Salida
        const outId = `mov-${Date.now()}-${count}-out`;
        await client.query(
          `INSERT INTO movements (id, product_id, from_location_id, to_location_id, quantity, type, timestamp, created_by)
           VALUES ($1, $2, $3, $4, $5, 'TRANSFER_OUT', $6, $7)`,
          [outId, idVenta, fromLocation, toLocation, qty, new Date().toISOString(), req.user!.username]
        );
        await client.query(
          'UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3',
          [qty, idVenta, fromLocation]
        );

        // Entrada
        const inId = `mov-${Date.now()}-${count}-in`;
        await client.query(
          `INSERT INTO movements (id, product_id, from_location_id, to_location_id, quantity, type, timestamp, created_by)
           VALUES ($1, $2, $3, $4, $5, 'TRANSFER_IN', $6, $7)`,
          [inId, idVenta, fromLocation, toLocation, qty, new Date().toISOString(), req.user!.username]
        );
        await client.query(
          `INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, $2, $3)
           ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock.quantity + $3, updated_at = NOW()`,
          [idVenta, toLocation, qty]
        );

        await client.query('COMMIT');
        count++;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      errors.push(`Error en fila ${count + 1}: ${err.message}`);
    }
  }

  await logAudit('INFO', 'upload', `Transferencias masivas: ${count} procesadas`);

  ok(res, { count, errors: errors.slice(0, 10) });
}));

// ── POST /api/upload/sales — Ventas masivas ──
router.post('/sales', requireRole('admin', 'operador'), asyncHandler(async (req: Request, res: Response) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    fail(res, 'Se requiere el campo csv');
    return;
  }

  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const data = parsed.data.length > 0 && Object.keys(parsed.data[0] as any).length > 1
    ? parsed.data
    : Papa.parse(csv, { header: true, skipEmptyLines: true, delimiter: ';' }).data;

  const pool = req.db!;
  let count = 0;
  const errors: string[] = [];

  for (const row of data as any[]) {
    try {
      const idVenta = row.id_venta || row.cod_venta || row.codigo;
      const locationId = row.lugar || row.location_id || row.ubicacion;
      const price = parseFloat(row.precio || row.price || '0');
      const qty = parseInt(row.qty || row.cantidad || '1');
      const timestamp = row.timestamp || row.fecha || new Date().toISOString();

      if (!idVenta || !locationId) {
        errors.push(`Fila ${count + 1}: falta código o ubicación`);
        continue;
      }

      const saleId = `sale-bulk-${Date.now()}-${count}`;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Crear venta pendiente y aprobarla automáticamente
        await client.query(
          `INSERT INTO pending_sales (id, product_id, location_id, quantity, price, seller_username, status, approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5, 'admin', 'approved', 'admin', NOW())`,
          [saleId, idVenta, locationId, qty, price]
        );

        // Movimiento SALE
        const movId = `mov-sale-bulk-${Date.now()}-${count}`;
        await client.query(
          `INSERT INTO movements (id, product_id, from_location_id, quantity, type, timestamp, price, created_by)
           VALUES ($1, $2, $3, $4, 'SALE', $5, $6, $7)`,
          [movId, idVenta, locationId, qty, timestamp, price, req.user!.username]
        );

        // Descontar stock
        await client.query(
          `UPDATE stock SET quantity = quantity - $1, updated_at = NOW()
           WHERE product_id = $2 AND location_id = $3`,
          [qty, idVenta, locationId]
        );

        await client.query('COMMIT');
        count++;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      errors.push(`Error en fila ${count + 1} (${row.id_venta || '?'}): ${err.message}`);
    }
  }

  await logAudit('INFO', 'upload', `Ventas masivas: ${count} procesadas`);

  ok(res, { count, errors: errors.slice(0, 10) });
}));

export default router;
