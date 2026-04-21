'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const Papa    = require('papaparse');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA = __dirname; // todos los CSV viven junto al server.js

app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname)); // sirve vma_fabrica.html y los CSV estáticos

// ── Helpers CSV ──────────────────────────────────────────────────────────────

function readCSV(filename) {
  const fp = path.join(DATA, filename);
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, 'utf8');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data;
}

function writeCSV(filename, rows) {
  if (!rows.length) return; // nunca truncar con archivo vacío por error
  const csv = Papa.unparse(rows);
  fs.writeFileSync(path.join(DATA, filename), csv, 'utf8');
}

// ── POST /api/guardar-compra ─────────────────────────────────────────────────
// Recibe el array completo de insumos (ya con PMP/stock recalculado en el browser)
// y sobreescribe vma_insumos.csv íntegramente.
//
// Body: { insumos: [ {id_insumo, nombre, categoria, unidad, stock_actual,
//                     costo_pmp, ultimo_costo, merma_pct, proveedor,
//                     fecha_ultima_compra, notas}, … ] }
app.post('/api/guardar-compra', (req, res) => {
  try {
    const { insumos } = req.body;
    if (!Array.isArray(insumos) || !insumos.length)
      return res.status(400).json({ ok: false, error: 'insumos vacíos o ausentes' });

    writeCSV('vma_insumos.csv', insumos);
    console.log(`[guardar-compra] vma_insumos.csv → ${insumos.length} filas`);
    res.json({ ok: true, rows: insumos.length });
  } catch (e) {
    console.error('[guardar-compra]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/guardar-receta ─────────────────────────────────────────────────
// Recibe las líneas del escandallo de UN producto (todas las tallas con qty > 0).
// Elimina del CSV las filas previas de ese producto y agrega las nuevas.
//
// Body: { producto: "Colegio X — Polera Piqué",
//         rows: [ {id_receta, producto, talla, id_insumo, nombre_insumo,
//                  cantidad, unidad, merma_pct, cantidad_con_merma,
//                  costo_unitario_pmp, costo_total, tipo_componente}, … ] }
app.post('/api/guardar-receta', (req, res) => {
  try {
    const { producto, rows } = req.body;
    if (!producto || !Array.isArray(rows))
      return res.status(400).json({ ok: false, error: 'producto y rows son requeridos' });

    // Leer existentes, quitar las del mismo producto y agregar las nuevas
    let existentes = readCSV('vma_recetas.csv');
    existentes = existentes.filter(r => r.producto !== producto);
    const nuevas = [...existentes, ...rows];

    writeCSV('vma_recetas.csv', nuevas);
    console.log(`[guardar-receta] "${producto}" → ${rows.length} líneas nuevas · total CSV: ${nuevas.length}`);
    res.json({ ok: true, insertadas: rows.length, total: nuevas.length });
  } catch (e) {
    console.error('[guardar-receta]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/actualizar-matriz ──────────────────────────────────────────────
// Actualiza las columnas COSTO y SKU en vma_precios_matriz.csv para el par
// COLEGIO+PRENDA. El CSV es formato WIDE: COLEGIO,PRENDA,T3,T4,T6,...
// Se agrega/actualiza:
//   COSTO  → promedio de los costos calculados por fábrica (número puro)
//   SKU    → SKU base del producto (sin sufijo de talla)
//
// Body: { colegio, prenda, costos:{S:n,M:n,...}, skuBase:"DUN-CAL", skus:{S:"DUN-CAL-TS",...} }
app.post('/api/actualizar-matriz', (req, res) => {
  try {
    const { colegio, prenda, costos, skuBase, skus } = req.body;
    if (!colegio || !prenda || !costos || typeof costos !== 'object')
      return res.status(400).json({ ok: false, error: 'colegio, prenda y costos son requeridos' });

    const costoVals = Object.values(costos).filter(v => Number(v) > 0);
    const costoPromedio = costoVals.length
      ? Math.round(costoVals.reduce((a, b) => a + Number(b), 0) / costoVals.length)
      : 0;

    let matriz = readCSV('vma_precios_matriz.csv');
    let actualizadas = 0;

    matriz = matriz.map(row => {
      const rowCol = (row.COLEGIO || '').trim();
      const rowPren = (row.PRENDA  || '').trim();
      if (rowCol === colegio.trim() && rowPren === prenda.trim()) {
        actualizadas++;
        const updated = { ...row, COSTO: costoPromedio };
        if (skuBase) updated.SKU = skuBase;
        return updated;
      }
      return row;
    });

    if (actualizadas === 0) {
      const newRow = { COLEGIO: colegio, PRENDA: prenda, COSTO: costoPromedio };
      if (skuBase) newRow.SKU = skuBase;
      matriz.push(newRow);
    }

    writeCSV('vma_precios_matriz.csv', matriz);
    console.log(`[actualizar-matriz] "${colegio} — ${prenda}" · COSTO: $${costoPromedio} · SKU: ${skuBase || '—'} · filas afectadas: ${actualizadas}`);
    res.json({ ok: true, actualizadas, costoPromedio, skuBase });
  } catch (e) {
    console.error('[actualizar-matriz]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Catch-all: 404 limpio para rutas desconocidas ────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ── Arranque ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ██╗   ██╗███╗   ███╗ █████╗     ███████╗██████╗ ██████╗ ');
  console.log('  ██║   ██║████╗ ████║██╔══██╗    ██╔════╝██╔══██╗██╔══██╗');
  console.log('  ██║   ██║██╔████╔██║███████║    █████╗  ██████╔╝██████╔╝');
  console.log('  ╚██╗ ██╔╝██║╚██╔╝██║██╔══██║    ██╔══╝  ██╔══██╗██╔═══╝ ');
  console.log('   ╚████╔╝ ██║ ╚═╝ ██║██║  ██║    ███████╗██║  ██║██║     ');
  console.log('    ╚═══╝  ╚═╝     ╚═╝╚═╝  ╚═╝    ╚══════╝╚═╝  ╚═╝╚═╝     ');
  console.log('');
  console.log(`  VMA ERP · Fábrica Server corriendo en http://localhost:${PORT}`);
  console.log(`  Directorio de datos: ${DATA}`);
  console.log('');
  console.log('  Endpoints activos:');
  console.log('    POST /api/guardar-compra    → sobreescribe vma_insumos.csv');
  console.log('    POST /api/guardar-receta    → upsert en vma_recetas.csv');
  console.log('    POST /api/actualizar-matriz → actualiza COSTO+SKU en vma_precios_matriz.csv (formato WIDE)');
  console.log('');
});
