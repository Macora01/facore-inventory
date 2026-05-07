import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireDb } from '../lib/db.js';
import { ok, fail } from '../lib/response.js';

const router = Router();
router.use(requireDb);

// ── POST /api/ai/analyze — Análisis AI del inventario ──
router.post(
  '/analyze',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.db!;
    const { apiKey, baseUrl, model } = req.body;

    if (!apiKey) {
      return fail(res, 'Se requiere API Key', 400);
    }

    const aiBaseUrl = baseUrl || 'https://api.openai.com/v1';
    const aiModel = model || 'gpt-4o';

    // ── 1. Recopilar datos del inventario ──

    // Productos con stock bajo
    const lowStock = await pool.query(`
      SELECT p.id_venta, p.description, p.category,
             p.min_stock as "minStock",
             COALESCE(SUM(s.quantity), 0) as stock
      FROM products p
      LEFT JOIN stock s ON p.id_venta = s.product_id
      GROUP BY p.id_venta, p.description, p.category, p.min_stock
      HAVING COALESCE(SUM(s.quantity), 0) <= p.min_stock
      ORDER BY stock ASC
      LIMIT 10
    `);

    // Top 10 productos más vendidos (últimos 60 días)
    const topProducts = await pool.query(`
      SELECT p.description, p.category, SUM(m.quantity) as vendidos,
             SUM(m.price * m.quantity) as ingresos
      FROM movements m
      JOIN products p ON m.product_id = p.id_venta
      WHERE m.type = 'SALE'
        AND m.timestamp::date >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY p.description, p.category
      ORDER BY vendidos DESC
      LIMIT 10
    `);

    // Ventas últimos 30 días (diario)
    const salesTrend = await pool.query(`
      SELECT m.timestamp::date as fecha, COUNT(*)::int as ventas,
             SUM(m.quantity) as unidades,
             SUM(m.price * m.quantity) as ingresos
      FROM movements m
      WHERE m.type = 'SALE'
        AND m.timestamp::date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY m.timestamp::date
      ORDER BY fecha
    `);

    // Stock total por ubicación
    const stockByLocation = await pool.query(`
      SELECT l.name as ubicacion, COUNT(DISTINCT s.product_id)::int as productos,
             SUM(s.quantity) as total_items
      FROM stock s
      JOIN locations l ON s.location_id = l.id
      WHERE s.quantity > 0 AND l.is_active = true
      GROUP BY l.name
      ORDER BY total_items DESC
    `);

    // Totales generales
    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM products) as "totalProducts",
        (SELECT COALESCE(SUM(quantity), 0) FROM stock WHERE quantity > 0) as "totalStock",
        (SELECT COUNT(*)::int FROM movements WHERE type = 'SALE'
         AND timestamp::date >= CURRENT_DATE - INTERVAL '30 days') as "sales30d",
        (SELECT COALESCE(SUM(price * quantity), 0) FROM movements WHERE type = 'SALE'
         AND timestamp::date >= CURRENT_DATE - INTERVAL '30 days') as "revenue30d"
    `);

    // ── 2. Construir el prompt ──
    const data = {
      totalProducts: totals.rows[0].totalProducts,
      totalStock: Number(totals.rows[0].totalStock),
      sales30d: totals.rows[0].sales30d,
      revenue30d: Number(totals.rows[0].revenue30d),
      lowStock: lowStock.rows,
      topProducts: topProducts.rows,
      stockByLocation: stockByLocation.rows,
      salesTrend: salesTrend.rows,
    };

    const prompt = `Eres un analista de inventario para una empresa chilena de ropa llamada Facore.
Tienes acceso a los siguientes datos reales del sistema:

📦 DATOS GENERALES:
- Total productos: ${data.totalProducts}
- Stock total (unidades): ${data.totalStock}
- Ventas últimos 30 días: ${data.sales30d} transacciones
- Ingresos últimos 30 días: $${data.revenue30d.toLocaleString('es-CL')}

⚠️ PRODUCTOS CON STOCK BAJO O AGOTADO:
${data.lowStock.length === 0 ? 'Ninguno — todos los productos están sobre su stock mínimo.' : 
data.lowStock.map((p: any) => `- ${p.description} (${p.id_venta}) | Cat: ${p.category || 'N/A'} | Stock: ${p.stock} | Mín: ${p.minStock}`).join('\n')}

🏆 TOP 10 PRODUCTOS MÁS VENDIDOS (60 días):
${data.topProducts.map((p: any) => `- ${p.description} (${p.category || 'N/A'}): ${p.vendidos} uds. — $${Number(p.ingresos).toLocaleString('es-CL')}`).join('\n')}

📍 STOCK POR UBICACIÓN:
${data.stockByLocation.map((l: any) => `- ${l.ubicacion}: ${l.productos} productos, ${l.total_items} unidades`).join('\n')}

📈 TENDENCIA DE VENTAS (últimos 30 días):
${data.salesTrend.map((d: any) => `${d.fecha}: ${d.ventas} ventas, ${d.unidades} uds., $${Number(d.ingresos).toLocaleString('es-CL')}`).join('\n')}

───

Con esta información, necesito que generes un informe en español chileno (tuteo, sin voseo) con la siguiente estructura:

## 1. Análisis de la Situación Actual
Un resumen ejecutivo de 2-3 párrafos sobre el estado del inventario: qué está funcionando bien, qué preocupa, patrones que observes.

## 2. Sugerencias Concretas
Lista numerada de 4-6 acciones específicas y accionables. Para cada una, explica brevemente por qué y el impacto esperado.

## 3. Predicción a 30 Días — Escenario A (siguiendo las sugerencias)
Describe cómo evolucionaría el inventario si se implementan todas las sugerencias. Sé específico: menciona productos, ubicaciones y cifras estimadas.

## 4. Predicción a 30 Días — Escenario B (sin seguir las sugerencias)
Describe qué pasaría si no se toma ninguna acción. Sé honesto pero constructivo. Menciona riesgos concretos (quiebres de stock, sobrestock, pérdida de ventas).

Usa lenguaje directo, sin adornos innecesarios. El dueño es un ingeniero de 64 años que valora la claridad y los datos duros. Responde en formato Markdown para que se renderice correctamente.`;

    // ── 3. Llamar a la API de AI ──
    try {
      const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: 'system', content: 'Eres un analista experto en gestión de inventarios para retail de ropa. Respondes en español chileno (tú, no vos). Eres directo, basado en datos, y das sugerencias accionables. Formato Markdown.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 2500,
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        let errMsg = `Error ${aiResponse.status} de la API`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errMsg;
        } catch {}
        return fail(res, errMsg, aiResponse.status);
      }

      const aiData: any = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;

      if (!content) {
        return fail(res, 'La API no devolvió contenido', 502);
      }

      ok(res, {
        analysis: content,
        model: aiData.model,
        usage: aiData.usage,
      });
    } catch (err: any) {
      return fail(res, `Error de conexión: ${err.message}`, 503);
    }
  })
);

export default router;
