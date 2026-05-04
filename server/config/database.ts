import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isPgActive = false;

export function getPool(): pg.Pool | null {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export function isDatabaseActive(): boolean {
  return isPgActive;
}

export async function initDb(): Promise<boolean> {
  console.log('── Database Init ──');
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn('DATABASE_URL no definida. Modo JSON fallback.');
    return false;
  }

  try {
    const p = getPool();
    if (!p) return false;

    const client = await p.connect();
    try {
      console.log('PostgreSQL conectado. Creando tablas...');

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'vendedora',
          display_name TEXT,
          location_id TEXT REFERENCES locations(id),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS products (
          id_venta TEXT PRIMARY KEY,
          id_fabrica TEXT,
          description TEXT NOT NULL,
          price NUMERIC NOT NULL DEFAULT 0,
          cost NUMERIC NOT NULL DEFAULT 0,
          min_stock NUMERIC DEFAULT 2,
          image TEXT,
          category TEXT,
          supplier_id TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS locations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'FIXED_STORE_PERMANENT',
          address TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS stock (
          product_id TEXT REFERENCES products(id_venta) ON DELETE CASCADE,
          location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
          quantity NUMERIC NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (product_id, location_id)
        );

        CREATE TABLE IF NOT EXISTS movements (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          from_location_id TEXT,
          to_location_id TEXT,
          quantity NUMERIC NOT NULL,
          type TEXT NOT NULL,
          reason TEXT,
          timestamp TEXT NOT NULL,
          related_file TEXT,
          price NUMERIC,
          cost NUMERIC,
          created_by TEXT
        );

        CREATE TABLE IF NOT EXISTS purchase_orders (
          id TEXT PRIMARY KEY,
          supplier_name TEXT NOT NULL,
          order_date DATE,
          expected_arrival DATE,
          received_date DATE,
          status TEXT DEFAULT 'ordered',
          total_cost NUMERIC,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS purchase_order_items (
          order_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
          product_id TEXT REFERENCES products(id_venta) ON DELETE CASCADE,
          quantity_ordered NUMERIC NOT NULL,
          quantity_received NUMERIC DEFAULT 0,
          unit_cost NUMERIC,
          PRIMARY KEY (order_id, product_id)
        );

        CREATE TABLE IF NOT EXISTS pending_sales (
          id TEXT PRIMARY KEY,
          product_id TEXT REFERENCES products(id_venta),
          location_id TEXT REFERENCES locations(id),
          quantity NUMERIC NOT NULL,
          price NUMERIC NOT NULL,
          seller_username TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          approved_by TEXT,
          approved_at TIMESTAMPTZ,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          level TEXT NOT NULL,
          category TEXT NOT NULL,
          message TEXT NOT NULL,
          details JSONB
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS factory_images (
          factory_id TEXT PRIMARY KEY,
          image_data TEXT
        );
      `);

      // ── BODCENT ──
      const bodcentCheck = await client.query("SELECT id FROM locations WHERE id = 'BODCENT'");
      if (bodcentCheck.rows.length === 0) {
        await client.query(
          "INSERT INTO locations (id, name, type) VALUES ('BODCENT', 'Bodega Central', 'WAREHOUSE')"
        );
      }

      // ── Admin default si no existe ──
      const adminCheck = await client.query("SELECT id FROM users WHERE username = 'admin'");
      if (adminCheck.rows.length === 0) {
        const adminUser = process.env.ADMIN_USER || 'admin';
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
        const hash = await bcrypt.hash(adminPass, 12);
        await client.query(
          "INSERT INTO users (id, username, password, role, display_name) VALUES ($1, $2, $3, 'admin', 'Administrador')",
          [`usr-admin`, adminUser, hash]
        );
        console.log(`  ✓ Usuario admin creado: ${adminUser}`);
      }

      // ── Migrar passwords existentes a bcrypt si es necesario ──
      const plainUsers = await client.query(
        "SELECT id, password FROM users WHERE password NOT LIKE '$2b$%' AND password NOT LIKE '$2a$%'"
      );
      for (const u of plainUsers.rows) {
        const hash = await bcrypt.hash(u.password, 12);
        await client.query('UPDATE users SET password = $1 WHERE id = $2', [hash, u.id]);
        console.log(`  ✓ Password migrado a bcrypt: ${u.id}`);
      }

      console.log('  ✓ Tablas inicializadas');
      isPgActive = true;
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error conectando a PostgreSQL:', err.message);
    return false;
  }
}

/* ── Audit Log ── */
export async function logAudit(
  level: 'INFO' | 'WARNING' | 'ERROR',
  category: string,
  message: string,
  details: any = null
) {
  const p = getPool();
  if (!p || !isPgActive) return;
  try {
    await p.query(
      'INSERT INTO audit_logs (level, category, message, details) VALUES ($1, $2, $3, $4)',
      [level, category, message, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
