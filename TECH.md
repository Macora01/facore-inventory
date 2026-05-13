# Facore Inventory v2.5.8 — Documento Técnico de Reconstrucción

> Prompt-ready: este documento contiene toda la información necesaria para reconstruir
> la aplicación desde cero. Estructura, endpoints, esquema DB, flujos, convenciones,
> bugs resueltos y pitfalls.

---

## 1. Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React + TypeScript | 19 |
| Bundler | Vite | 6 |
| CSS | Tailwind CSS | 4 |
| Gráficos | Recharts | 2 |
| Iconos | Lucide React | latest |
| QR Scanner | html5-qrcode | latest |
| CSV | papaparse | latest |
| Excel | xlsx | latest |
| PDF | jspdf + jspdf-autotable | latest |
| Backend | Express + TypeScript | 5 (tsx runtime) |
| Auth | jsonwebtoken + bcrypt | latest |
| DB driver | pg | latest |
| Base de datos | PostgreSQL | 16 Alpine |
| Deploy | Docker multi-stage | node:22-slim |
| Plataforma | Coolify | latest |
| Dominio | inv.facore.cl | HTTPS |

---

## 2. Estructura del proyecto

```
facore-inventory/
├── TECH.md                    # Este documento
├── README.md                  # Descripción funcional
├── package.json               # version: 2.0.0 (nominal), real: 2.5.8
├── version.ts                 # export const APP_VERSION = '2.5.8'
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── Dockerfile                 # Multi-stage: build (Vite) → runtime (tsx)
├── docker-compose.yml         # App + PostgreSQL 16
├── .env.production.example
├── .dockerignore
├── index.html
├── index.css                  # Design tokens (@theme) + estilos globales
├── App.tsx                    # Hash router, mobile-first layout
├── types.ts                   # Tipos compartidos
├── public/
│   └── logo.png
├── components/
│   ├── Button.tsx              # variant: primary|secondary|danger|ghost, size: sm|md|lg
│   ├── Card.tsx                # title, action, padding: none|sm|md|lg
│   └── Sidebar.tsx             # Responsive overlay móvil + fijo desktop (lg:1024px)
├── context/
│   └── AppContext.tsx          # useApp(): currentUser, products, stock, fetchData, CRUD
├── hooks/
│   ├── useToast.tsx            # addToast(message, type) — type: success|error|info
│   └── useHashNavigation.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx       # 4 KPIs, 2 gráficos (torta/barras), proyecciones, panel AI
│   ├── InventoryPage.tsx       # Catálogo CRUD + stock por ubicación + exportar CSV
│   ├── SalesPage.tsx           # Vendedora + escáner QR (html5-qrcode, cámara frontal)
│   ├── ApprovalsPage.tsx       # Admin aprueba/rechaza ventas
│   ├── MovementsPage.tsx       # Historial de movimientos con filtros
│   ├── TraceabilityPage.tsx    # Timeline LIFO por producto (id_venta o id_fabrica)
│   ├── ReportsPage.tsx         # 3 tabs: Ventas/Productos/Stock + exportar CSV/XLSX/PDF
│   ├── PurchasesPage.tsx       # Órdenes de compra
│   ├── UploadPage.tsx          # Carga masiva CSV/XLSX (3 tipos)
│   └── SettingsPage.tsx        # 3 tabs: General/Usuarios/Ubicaciones + Backup/Restore
├── server/
│   ├── index.ts                # Express server + endpoints emergencia
│   ├── config/
│   │   └── database.ts         # Pool PG, initDb(), logAudit()
│   ├── lib/
│   │   ├── db.ts               # requireDb middleware
│   │   └── response.ts         # ok(), fail(), notFound()
│   ├── middleware/
│   │   ├── auth.ts             # JWT, authenticateToken, requireRole
│   │   ├── security.ts         # Helmet, CORS, rate-limit
│   │   └── errorHandler.ts     # asyncHandler + globalErrorHandler
│   └── routes/
│       ├── auth.ts             # login, register, me
│       ├── products.ts         # CRUD + stock inicial
│       ├── stock.ts            # GET (con filtro locationId)
│       ├── movements.ts        # GET (con filtros type, productId, locationId)
│       ├── sales.ts            # Flujo vendedora: crear pendiente, aprobar, rechazar
│       ├── purchases.ts        # Órdenes de compra
│       ├── locations.ts        # GET/POST/PUT/DELETE
│       ├── traceability.ts     # GET /:productId (timeline LIFO)
│       ├── reports.ts          # sales-summary, top-products, stock-status, stock-detail, dashboard-summary
│       ├── upload.ts           # products, transfers, sales (validación estricta)
│       ├── settings.ts         # Config, CRUD users/locations, backup/restore/clean
│       ├── seed.ts             # Datos de prueba
│       └── ai.ts               # POST /analyze (OpenAI-compatible, solo admin)
└── dist/                       # Build de Vite (generado)
```

---

## 3. Esquema de base de datos

### 3.1 Tablas (11)

```sql
-- ⚠️ ORDEN DE CREACIÓN OBLIGATORIO (FK dependencies)

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('WAREHOUSE','FIXED_STORE_PERMANENT','FIXED_STORE_TEMPORARY','INDIRECT_STORE','ONLINE_STORE','HOME_STORE')),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operador','vendedora','visita')),
  display_name TEXT,
  location_id TEXT REFERENCES locations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id_venta TEXT PRIMARY KEY,
  id_fabrica TEXT,
  description TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  min_stock NUMERIC DEFAULT 2,
  image TEXT,
  category TEXT,
  supplier_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock (
  product_id TEXT REFERENCES products(id_venta) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (product_id, location_id)
);

CREATE TABLE movements (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id_venta),
  from_location_id TEXT,
  to_location_id TEXT,
  quantity NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INITIAL_LOAD','PURCHASE','TRANSFER_OUT','TRANSFER_IN','SALE','ADJUSTMENT')),
  reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  related_file TEXT,
  price NUMERIC,
  cost NUMERIC,
  created_by TEXT
);

CREATE TABLE pending_sales (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id_venta),
  location_id TEXT REFERENCES locations(id),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  seller_username TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  supplier TEXT,
  status TEXT DEFAULT 'draft',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id_venta),
  quantity NUMERIC,
  cost NUMERIC
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  level TEXT,
  category TEXT,
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE factory_images (
  id_fabrica TEXT PRIMARY KEY,
  image_url TEXT
);
```

### 3.2 Datos semilla (initDb)

- Ubicaciones base: BODCENT (WAREHOUSE)
- Usuario admin: admin / admin123 (bcrypt, 12 rounds)
- Se insertan solo si no existen (ON CONFLICT DO NOTHING o verificación previa)

---

## 4. Roles y permisos

| Página | admin | operador | vendedora | visita |
|--------|:-----:|:--------:|:---------:|:------:|
| Dashboard | ✅ | ✅ | — | ✅ |
| Catálogo | ✅ | ✅ | ✅ | ✅ |
| Vender | ✅ | ✅ | ✅ | — |
| Aprobaciones | ✅ | ✅ | — | — |
| Compras | ✅ | ✅ | — | — |
| Movimientos | ✅ | ✅ | — | ✅ |
| Trazabilidad | ✅ | ✅ | — | ✅ |
| Reportes | ✅ | ✅ | — | ✅ |
| Carga Masiva | ✅ | ✅ | — | — |
| Configuración | ✅ | — | — | — |

---

## 5. Convenciones de código

### Backend
- `router.use(requireDb)` al inicio → `req.db!` en handlers (siempre existe)
- `asyncHandler(fn)` envuelve todos los handlers (no try/catch manual)
- `ok(res, data)`, `fail(res, msg, code?)`, `notFound(res, msg?)` — nunca `res.status().json()`
- `requireRole('admin', 'operador', ...)` lista TODOS los roles con acceso
- `requireDb` va en cada router (inyecta pool)
- `getPool()` en server/index.ts (sin requireDb)
- `logAudit(level, category, message, details?)` para auditoría
- Transacciones: `const client = await pool.connect()` + `BEGIN/COMMIT/ROLLBACK` + `finally { client.release() }`

### Frontend
- `useApp()` del AppContext: currentUser, products, stock, locations, fetchData, createEntity, etc.
- `addToast(msg, type)` — NO `showToast`
- `<Button variant="primary|secondary|danger|ghost" size="sm|md|lg" loading={bool} />`
- `<Card title="..." action={<Button/>} padding="none|sm|md|lg">...</Card>`
- Inputs/selects/textarea: estilos globales por tag, NO clases como `input-field`
- Tablas: `<table className="facore-table">`
- `fetchData('entity')` después de mutaciones
- Lucide icons NO aceptan `className` — usar `<div className="text-..."><Icon/></div>`
- Recharts Pie `label`: usa `{ name, value }`, no las keys del data
- Recharts Tooltip `formatter`: `(value: any) => ...`
- `html5-qrcode`: `await import('html5-qrcode')` (import dinámico, no estático)
- `xlsx` en frontend: `await import('xlsx')` sin `.default`
- `jspdf`: `(await import('jspdf')).default`

### CSS — Design Tokens (index.css @theme)
```
canvas: #FAFAF8    surface: #FFFFFF    text: #1C1C1C
clay: #7D6B5C      sage: #5C7D6B       amber: #C49B5C
brick: #A65D5D     sidebar: #2B2520
```
- Mobile-first: breakpoint `lg` (1024px)
- Touch targets: inputs/selects/textarea min-height 44px, botones 48px
- Anti-zoom iOS: `font-size: 16px !important` en inputs móviles

---

## 6. Endpoints API

### 6.1 Auth
```
POST /api/auth/login     { username, password } → { user, token }
POST /api/auth/register  { username, password, role } → { user }  (admin only)
GET  /api/auth/me        → { user }
```

### 6.2 Products
```
GET    /api/products?search=X&lowStock=true  → [{ id_venta, id_fabrica, description, price, cost, minStock, total_stock, category, ... }]
GET    /api/products/:id                     → { ...product, stock: [...] }
POST   /api/products       { id_venta, description, price, cost, min_stock, category, initialStock?, initialLocation? }
PUT    /api/products/:id   { ...campos }
DELETE /api/products/:id
```

### 6.3 Stock
```
GET /api/stock?locationId=X  → [{ productId, locationId, quantity, locationName }]
```

### 6.4 Movements
```
GET /api/movements?type=SALE&productId=X&locationId=Y&limit=50
  → [{ id, productId, fromLocationId, toLocationId, quantity, type, timestamp, price, cost, ... }]
```

### 6.5 Reports
```
GET /api/reports/sales-summary?period=day|week|month&from=X&to=Y&locations=A,B
  → [{ period, totalSales, totalQuantity, totalRevenue, totalCost, margin }]

GET /api/reports/top-products?limit=15&locations=A,B
  → [{ productId, productDescription, totalSold, totalRevenue, saleCount }]

GET /api/reports/stock-status?locations=A,B
  → { lowStock: [...], distribution: [...], productsWithStock, grandTotal }

GET /api/reports/stock-detail?locations=A,B
  → [{ productId, productDescription, factoryId, category, quantity, locationName, ... }]

GET /api/reports/dashboard-summary
  → { totalProducts, totalStock, sales30d, revenue30d, cost30d, margin30d, marginPercent,
      pendingCount, lowStockCount, inventoryCost, inventoryValue,
      revenueNeto, marginNeto, marginNetoPercent, inventoryValueNeto,
      projected100, projected95, projected90, stockDistribution, sales7d }
```

**Filtro multi-ubicación:** `?locations=id1,id2,id3`. Usa `IN ($1, $2, ...)` con parámetros individuales expandidos. **NUNCA `ANY($1::text[])`** — no es confiable con el driver `pg`.

**CRÍTICO:** movements usa `from_location_id` para filtrar ventas. Stock usa `location_id`.

### 6.6 Upload (carga masiva) — validación estricta v2.5.8
```
POST /api/upload/products    { csv } o { xlsx }
POST /api/upload/transfers   { csv } o { xlsx }
POST /api/upload/sales       { csv } o { xlsx }
```

**Validación estricta (todo o nada):**
1. Fase 1: validar TODAS las filas (columnas requeridas, FK, stock)
2. Si hay ≥1 error → 400 con lista completa, no se procesa nada
3. Si todo OK → procesar en lote

**Formato productos:** `id_venta;id_fabrica;description;price;cost;min_stock;category;qty`
- `qty` > 0 crea stock en BODCENT + INITIAL_LOAD
- `min_stock` vacío → fallback 2
- Números se limpian ($, espacios, separadores de miles)

**Formato transferencias:** `id_venta;sitio_inicial;sitio_final;qty`
- Verifica stock suficiente en origen (acumulado por producto)

**Formato ventas:** `id_venta;lugar;precio;qty;timestamp`
- Guarda costo del producto en el movimiento
- timestamp acepta: dd-mm-aa, dd/mm/aa, ISO, serial Excel (40000-80000)

### 6.7 Settings
```
GET    /api/settings          → { key: value, ... }
PUT    /api/settings          { key: value, ... }
GET    /api/settings/users    → [{ id, username, role, displayName, locationId }]
POST   /api/settings/users    { username, password, role, ... }
PUT    /api/settings/users/:id
DELETE /api/settings/users/:id  (no se puede eliminar usr-admin)
POST   /api/settings/locations { id, name, type, address? }
PUT    /api/settings/locations/:id
DELETE /api/settings/locations/:id  (no se puede eliminar BODCENT)
POST   /api/settings/backup    → { backup: {...}, timestamp }
POST   /api/settings/restore   { backup, adminPassword }
POST   /api/settings/clean     { adminPassword, targets: ["products","movements"] }
                               → backup automático antes de borrar
```

**Clean targets:** products, stock, movements, pending_sales, purchases, locations, users, settings, audit_logs, factory_images, all

### 6.8 Emergencia (server/index.ts)
```
POST /api/emergency/delete-bazvlt-sales       — borrar ventas BAZVLT
POST /api/emergency/restore-bazvlt-stock      — stock +1 para 23 productos
POST /api/emergency/check-bazvlt              — diagnóstico stock BAZVLT
POST /api/emergency/delete-corrupt-sales      — borrar ventas año > 4000
POST /api/emergency/reconcile-bazvlt-stock    — stock -= ventas en BAZVLT
POST /api/emergency/reset-bazvlt-stock        — BAZVLT stock = 0
POST /api/emergency/fix-bazvlt-transfers      — crea TRANSFER_IN faltantes
POST /api/emergency/deduct-sales-from-bodcent — descuenta ventas BAZVLT de BODCENT
POST /api/emergency/deduct-all-sales          — descuenta TODAS las ventas de BODCENT
```
**Usar solo en recuperación. Borrar después.**

---

## 7. Flujos de negocio

### 7.1 Carga inicial de productos
1. Carga Masiva → Productos → archivo CSV/XLSX con columna `qty`
2. Backend: INSERT products + INSERT stock BODCENT + INITIAL_LOAD

### 7.2 Venta en punto temporal
1. Transferencia BODCENT → ubicación temporal
2. Se vende (carga masiva de ventas o venta individual)
3. Sobrante vuelve a BODCENT
4. Reportes → filtrar ubicación → exportar XLSX
5. XLSX se usa como carga masiva de ventas

### 7.3 Métricas financieras (IVA Chile 19%)
- `revenue30d`: SUM(price * quantity) con IVA
- `revenueNeto`: revenue30d / 1.19
- `cost30d`: SUM(cost * quantity)
- `marginNeto`: revenueNeto - cost30d (Margen Bruto real)
- `projected100`: inventoryValueNeto - inventoryCost
- `projected95`: projected100 * 0.95
- `projected90`: projected100 * 0.90

---

## 8. Deploy — Coolify

### 8.1 Dockerfile (multi-stage)
```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/types.ts ./
COPY --from=build /app/version.ts ./
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', ...)"
CMD ["./node_modules/.bin/tsx", "server/index.ts"]
```

### 8.2 Variables de entorno
```
DATABASE_URL=postgres://facore:facore@db:5432/facore
JWT_SECRET=<generado>
JWT_EXPIRES_IN=24h
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
ALLOWED_ORIGINS=https://inv.facore.cl
PORT=3000
```

### 8.3 Troubleshooting
- **No sincroniza GitHub:** Source → main→main2→guardar→main→Deploy
- **504 con contenedor healthy:** `docker restart NOMBRE_CONTENEDOR`
- **504 múltiples apps:** Coolify → Servers → Restart Proxy
- **Credenciales DB:** docker-compose.yml → POSTGRES_USER/PASSWORD
- **Crash loop:** revisar logs en Coolify → pestaña Logs

---

## 9. parseTimestamp — parseo de fechas chilenas

```typescript
function parseTimestamp(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const s = String(raw).trim();
  if (!s) return new Date().toISOString();

  // Serial Excel (40000-80000 = años 2010-2120)
  if (/^\d{4,6}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial >= 40000 && serial <= 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  // ISO: 2026-05-13...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();

  // Chileno: dd-mm-aa, dd/mm/aaaa
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

  // Fallback con validación de año
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
    return d.toISOString();
  }

  return new Date().toISOString(); // último recurso
}
```

---

## 10. Pitfalls y bugs resueltos

| Bug | Causa | Fix |
|-----|-------|-----|
| Dashboard en blanco (500) | Ventas con timestamp año 46152 (serial Excel) rompen `::date` en PG | parseTimestamp: detectar seriales 40000-80000, validar año 2000-2100 |
| Stock catálogo "0132" | PG NUMERIC → JS string, `0 + "132"` = `"0132"` | `Number(s.quantity)` en useMemo |
| Margen Bruto = ingreso bruto | Mostraba margin30d (c/IVA), costo=0 en ventas masivas | Mostrar marginNeto (s/IVA) + guardar costo en ventas |
| Ventas no descuentan stock | Stock origen = 0, UPDATE afecta 0 filas | Validación previa + flujo: abastecer antes de vender |
| Clean borra sin backup | Endpoint original solo truncaba | Backup automático antes de TRUNCATE, devuelto en respuesta |
| TRANSFER_OUT sin TRANSFER_IN | Bug en upload/transfers: IN fallaba, OUT persistía | Fix en endpoint + endpoint emergencia fix-bazvlt-transfers |
| `ANY($1::text[])` no filtra | Driver pg no confiable con arrays | Usar `IN ($1, $2, ...)` con parámetros expandidos |
| movements.location_id no existe | Columna real: from_location_id | Usar from_location_id para filtrar ventas |
| asyncHandler no definido en index.ts | Falta import | `import { asyncHandler } from './middleware/errorHandler.js'` |
| jwt.sign is not a function | ESM + jsonwebtoken CJS | `import jwt from 'jsonwebtoken'` (default import) |
| Express 5 wildcard `*` roto | path-to-regexp v8 requiere nombre | `'/{*path}'` en vez de `'*'` |
| Cookies secure no persisten | Detrás de proxy (HTTP interno) | `app.set('trust proxy', 1)` |
| cleanInt ignora fallback | cleanNum(null)→0, isNaN(0)=false | Verificar null/undefined/'' antes de cleanNum |
| XLSX dynamic import .default undefined | Vite bundle | `await import('xlsx')` sin `.default` |
| Lucide icons className | No aceptan la prop | `<div className="text-..."><Icon/></div>` |
| Recharts Pie label | Espera { name, value }, no keys del data | Usar name/value en label callback |

---

## 11. Versiones

| Versión | Cambios |
|---------|---------|
| 2.5.8 | Validación estricta carga masiva, costo ventas, Margen Bruto s/IVA, stock catálogo fix, clean multi-target, endpoints emergencia |
| 2.5.7 | Parseo fechas chilenas, LIMIT 365, columna Código, from_location_id fix, XLSX import |
| 2.5.6 | LIMIT 90→365 en sales-summary |
| 2.5.5 | Columna Código (id_venta) en tablas |
| 2.5.4 | Fix m.location_id → m.from_location_id + XLSX |
| 2.5.3 | Exportación inventario completo |
| 2.5.2 | Filtro ubicación Reportes |
| 2.5.1 | totalPurchased excluye TRANSFER_IN |

---

## 12. Comandos frecuentes

```bash
# Build
cd /opt/data/facore-inventory && npm run build

# Deploy (Coolify auto-deploy en push a main)
git push origin main

# Forzar deploy en Coolify
# Source → cambiar branch main→main2→guardar→main→Deploy

# Push con PAT (token GitHub)
echo 'https://Macora01:TOKEN@github.com' > /tmp/git-credentials-facore
git -c credential.helper="store --file /tmp/git-credentials-facore" push origin main
rm -f /tmp/git-credentials-facore

# Health check
curl https://inv.facore.cl/api/health

# Login API
curl -X POST https://inv.facore.cl/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

# Dashboard
curl -H "Authorization: Bearer TOKEN" \
  https://inv.facore.cl/api/reports/dashboard-summary
```

---

## 13. Estado actual (13 mayo 2026)

- **Stock total:** 5886
- **Productos:** 417
- **Ventas 30d:** 39
- **Usuarios:** admin, maroto (admin)
- **Ubicaciones:** BODCENT, BAZVLT, ALMVLT, ALMDGO, ALMCAS (5)
- **Dashboard:** funcional, métricas correctas
- **Último deploy:** commit efe5de8 (v2.5.8)
