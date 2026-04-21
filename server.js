'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const Papa    = require('papaparse');

const app  = express();
const PORT = process.env.PORT || 3000;

// EL PARCHE DE ORO: Si existe el disco de Render (/var/data), lo usa. Si no, usa la carpeta local.
const DATA = fs.existsSync('/var/data') ? '/var/data' : __dirname; 

app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname)); 

function readCSV(filename) {
  const fp = path.join(DATA, filename);
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, 'utf8');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data;
}

function writeCSV(filename, rows) {
  if (!rows.length) return; 
  const csv = Papa.unparse(rows);
  fs.writeFileSync(path.join(DATA, filename), csv, 'utf8');
}

app.post('/api/guardar-compra', (req, res) => {
  try {
    const { insumos } = req.body;
    if (!Array.isArray(insumos) || !insumos.length) return res.status(400).json({ ok: false, error: 'insumos vacíos o ausentes' });
    writeCSV('vma_insumos.csv', insumos);
    console.log(`[guardar-compra] vma_insumos.csv → ${insumos.length} filas`);
    res.json({ ok: true, rows: insumos.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/guardar-receta', (req, res) => {
  try {
    const { producto, rows } = req.body;
    if (!producto || !Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'producto y rows son requeridos' });
    let existentes = readCSV('vma_recetas.csv');
    existentes = existentes.filter(r => r.producto !== producto);
    const nuevas = [...existentes, ...rows];
    writeCSV('vma_recetas.csv', nuevas);
    res.json({ ok: true, insertadas: rows.length, total: nuevas.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/actualizar-matriz', (req, res) => {
  try {
    const { colegio, prenda, costos, skuBase, skus } = req.body;
    if (!colegio || !prenda || !costos || typeof costos !== 'object') return res.status(400).json({ ok: false, error: 'datos insuficientes' });
    const costoVals = Object.values(costos).filter(v => Number(v) > 0);
    const costoPromedio = costoVals.length ? Math.round(costoVals.reduce((a, b) => a + Number(b), 0) / costoVals.length) : 0;
    let matriz = readCSV('vma_precios_matriz.csv');
    let actualizadas = 0;
    matriz = matriz.map(row => {
      if ((row.COLEGIO || '').trim() === colegio.trim() && (row.PRENDA || '').trim() === prenda.trim()) {
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
    res.json({ ok: true, actualizadas, costoPromedio, skuBase });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.use((req, res) => { res.status(404).json({ ok: false, error: `Ruta no encontrada` }); });

app.listen(PORT, () => {
  console.log(`  VMA ERP corriendo en el puerto ${PORT}`);
  console.log(`  Directorio de datos en uso: ${DATA}`);
});
