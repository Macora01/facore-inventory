# Facore Inventory

Sistema de gestión de inventario para Facore (Boa Ideia), empresa chilena de ropa.

**URL:** https://inv.facore.cl
**Versión:** 2.5.8

## ¿Qué hace?

- **Catálogo de productos** — 417 referencias con código, descripción, precio, costo, stock mínimo
- **Control de stock** — inventario en tiempo real por ubicación (bodega central, tiendas, puntos temporales)
- **Carga masiva** — importa productos, transferencias y ventas desde archivos CSV o Excel
- **Ventas** — registro de ventas con escáner QR (cámara del celular) o carga masiva
- **Dashboard** — KPIs financieros con IVA 19%: ingresos, costo inventario, margen bruto, proyecciones
- **Reportes** — ventas por período, productos más vendidos, exportación CSV/Excel/PDF
- **Trazabilidad** — historial completo de cada producto (entradas, transferencias, ventas)
- **4 roles** — admin, operador, vendedora, visita (solo lectura)

## Flujo de trabajo

1. **Cargar productos** — archivo CSV/Excel con `id_venta;id_fabrica;description;price;cost;min_stock;category;qty`
2. **Abastecer tiendas** — transferir stock desde Bodega Central a puntos de venta
3. **Registrar ventas** — carga masiva de ventas semanales/quincenales
4. **Dashboard** — ver ingresos, márgenes, proyecciones

## Roles

| | admin | operador | vendedora | visita |
|---|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | | ✅ |
| Catálogo | ✅ | ✅ | ✅ | ✅ |
| Vender | ✅ | ✅ | ✅ | |
| Carga Masiva | ✅ | ✅ | | |
| Reportes | ✅ | ✅ | | ✅ |
| Configuración | ✅ | | | |

## Usuarios

- **admin** / admin123 — acceso total
- **maroto** — administrador

## Ubicaciones

- **BODCENT** — Bodega Central (stock principal)
- **BAZVLT** — Bazar Vivo Los Trapenses
- **ALMVLT** — Vivo Los Trapences
- **ALMDGO** — Tienda Santo Domingo
- **ALMCAS** — nuevo punto

## Stack técnico

React 19 · Express 5 · PostgreSQL 16 · Tailwind CSS 4 · Docker · Coolify · VPS Hostinger

## Documentación técnica

Ver [TECH.md](./TECH.md) para documentación completa de desarrollo, endpoints, esquema DB y reconstrucción.
