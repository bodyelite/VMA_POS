const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────────────────────
//  DISCO PERSISTENTE
//  Render monta un disco en /var/data que sobrevive reinicios.
//  En desarrollo local (sin ese directorio) cae al __dirname.
// ──────────────────────────────────────────────────────────────
const PERSIST_DIR = (() => {
    const renderDisk = '/var/data';
    if (fs.existsSync(renderDisk)) {
        console.log(`Disco persistente: ${renderDisk}`);
        return renderDisk;
    }
    console.log(`Modo local: ${__dirname}`);
    return __dirname;
})();

const STATIC_DIR = __dirname;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(STATIC_DIR));

process.on('uncaughtException', (err) => {
    console.error('Error contenido:', err.message);
});

// ── Archivos mutables (van al disco persistente) ─────────────
const MUTABLE = new Set([
    'stock.json', 'ventas.json', 'ingresos.json',
    'ajustes_inventario.json', 'clientes.csv',
    'vma_insumos.csv', 'vma_recetas.csv', 'vma_precios_matriz.csv'
]);

const dataPath = (file) =>
    MUTABLE.has(file) ? path.join(PERSIST_DIR, file) : path.join(STATIC_DIR, file);

// Al arrancar: copia archivos semilla al disco persistente si no existen aún.
['vma_precios_matriz.csv', 'vma_insumos.csv', 'vma_recetas.csv', 'clientes.csv'].forEach(file => {
    const dest = path.join(PERSIST_DIR, file);
    const src  = path.join(STATIC_DIR, file);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Semilla copiada: ${file}`);
    }
});

// ── Helpers JSON ─────────────────────────────────────────────
const getJSON = (file, isObject = false) => {
    try {
        const p = dataPath(file);
        if (!fs.existsSync(p)) return isObject ? {} : [];
        const raw = fs.readFileSync(p, 'utf8');
        return raw ? JSON.parse(raw) : (isObject ? {} : []);
    } catch { return isObject ? {} : []; }
};

const saveJSON = (file, data) =>
    fs.writeFileSync(dataPath(file), JSON.stringify(data, null, 2));

// ── Helpers CSV ──────────────────────────────────────────────
const readCSV = (file) => {
    const p = dataPath(file);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

const parseCSV = (text) => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                      .split('\n').filter(l => l.trim());
    if (!lines.length) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj  = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
        return obj;
    });
    return { headers, rows };
};

const toCSV = (headers, rows) => {
    const esc = v => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return headers.map(esc).join(',') + '\n'
         + rows.map(r => headers.map(h => esc(r[h] ?? '')).join(',')).join('\n') + '\n';
};

const writeCSV = (file, headers, rows) =>
    fs.writeFileSync(dataPath(file), toCSV(headers, rows));

// ══════════════════════════════════════════════════════════════
//  GET ENDPOINTS
// ══════════════════════════════════════════════════════════════
app.get('/api/stock',      (req, res) => res.json(getJSON('stock.json', true)));
app.get('/api/ingresos',   (req, res) => res.json(getJSON('ingresos.json')));
app.get('/api/ventas',     (req, res) => res.json(getJSON('ventas.json')));
// ── Clientes — lee y escribe clientes.csv ────────────────────
app.get('/api/clientes', (req, res) => {
    try {
        const text = readCSV('clientes.csv');
        if (!text) return res.json([]);
        const { rows } = parseCSV(text);
        res.json(rows);
    } catch { res.json([]); }
});

app.post('/api/clientes', (req, res) => {
    try {
        const nuevo = req.body || {};
        if (!nuevo.NOMBRE) return res.status(400).json({ error: 'NOMBRE requerido' });

        const CLIENTES_FILE = 'clientes.csv';
        const text = readCSV(CLIENTES_FILE);
        let { headers, rows } = parseCSV(text);

        if (!headers.length) headers = ['NOMBRE','CELULAR_ID','EMAIL','DIRECCION'];
        // Asegurar columnas del payload
        Object.keys(nuevo).forEach(k => { if (!headers.includes(k)) headers.push(k); });

        // Actualizar si existe (por nombre o celular), insertar si no
        const idx = rows.findIndex(r =>
            r.NOMBRE?.toLowerCase() === nuevo.NOMBRE?.toLowerCase() ||
            (nuevo.CELULAR_ID && r.CELULAR_ID === nuevo.CELULAR_ID)
        );
        if (idx >= 0) rows[idx] = { ...rows[idx], ...nuevo };
        else rows.push(nuevo);

        writeCSV(CLIENTES_FILE, headers, rows);
        res.json({ ok: true, accion: idx >= 0 ? 'actualizado' : 'creado' });
    } catch (err) {
        console.error('/api/clientes POST:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/vendedores', (req, res) => res.json([]));
app.get('/api/precios',    (req, res) => res.json([]));

// ══════════════════════════════════════════════════════════════
//  BODEGA — Ingreso de stock
// ══════════════════════════════════════════════════════════════
app.post('/api/ingresos', (req, res) => {
    try {
        const { items = [], folio, vendedor } = req.body || {};
        const ingresos = getJSON('ingresos.json');
        const stock    = getJSON('stock.json', true);

        ingresos.push({ id: Date.now(), folio: folio || 'S/N',
            vendedor: vendedor || 'Admin', items,
            timestamp: new Date().toISOString() });

        items.forEach(({ colegio, prenda, talla, cantidad }) => {
            const qty = parseInt(cantidad || 0);
            if (colegio && prenda && talla && qty > 0) {
                const k = `${colegio}||${prenda}||${talla}`;
                stock[k] = (stock[k] || 0) + qty;
            }
        });

        saveJSON('stock.json', stock);
        saveJSON('ingresos.json', ingresos);
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/ingresos:', err.message);
        res.status(500).json({ error: 'Error guardando ingreso' });
    }
});

// ══════════════════════════════════════════════════════════════
//  CAJA — Venta y descuento de stock
// ══════════════════════════════════════════════════════════════
app.post('/api/ventas', (req, res) => {
    try {
        const { items = [], folio, vendedor, cliente, pago } = req.body || {};
        const ventas = getJSON('ventas.json');
        const stock  = getJSON('stock.json', true);

        ventas.push({ id: Date.now(), folio: folio || `V-${Date.now()}`,
            vendedor: vendedor || 'Admin', cliente: cliente || 'Anónimo',
            pago: pago || '', items, timestamp: new Date().toISOString() });

        items.forEach(({ colegio, prenda, talla, cantidad }) => {
            const qty = parseInt(cantidad || 0);
            if (colegio && prenda && talla && qty > 0) {
                const k = `${colegio}||${prenda}||${talla}`;
                if (stock[k] !== undefined) stock[k] = Math.max(0, stock[k] - qty);
            }
        });

        saveJSON('stock.json', stock);
        saveJSON('ventas.json', ventas);
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/ventas:', err.message);
        res.status(500).json({ error: 'Error procesando venta' });
    }
});

// ══════════════════════════════════════════════════════════════
//  FÁBRICA — Guarda escandallo en vma_recetas.csv
// ══════════════════════════════════════════════════════════════
app.post('/api/guardar-receta', (req, res) => {
    try {
        const { producto, rows } = req.body || {};
        if (!producto || !Array.isArray(rows))
            return res.status(400).json({ error: 'Payload inválido' });

        let { headers, rows: prev } = parseCSV(readCSV('vma_recetas.csv'));
        if (!headers.length)
            headers = ['id_receta','producto','talla','id_insumo','nombre_insumo',
                       'cantidad','unidad','merma_pct','cantidad_con_merma',
                       'costo_unitario_pmp','costo_total','tipo_componente'];

        rows.forEach(r => Object.keys(r).forEach(k => {
            if (!headers.includes(k)) headers.push(k);
        }));

        const merged = prev.filter(r => (r.producto||'').trim() !== producto.trim());
        merged.push(...rows);
        writeCSV('vma_recetas.csv', headers, merged);
        res.json({ ok: true, lineas: rows.length });
    } catch (err) {
        console.error('/api/guardar-receta:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  FÁBRICA — Actualiza COSTO + SKU en vma_precios_matriz.csv
// ══════════════════════════════════════════════════════════════
app.post('/api/actualizar-matriz', (req, res) => {
    try {
        const { colegio, prenda, costos = {}, skuBase, skus = {} } = req.body || {};
        if (!colegio || !prenda)
            return res.status(400).json({ error: 'Faltan colegio o prenda' });

        const raw = readCSV('vma_precios_matriz.csv');
        if (!raw) return res.status(404).json({ error: 'Archivo no encontrado' });

        let { headers, rows } = parseCSV(raw);
        if (!headers.includes('COSTO')) headers.push('COSTO');
        if (!headers.includes('SKU'))   headers.push('SKU');

        const vals  = Object.values(costos).filter(v => v > 0);
        const prom  = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;

        rows = rows.map(r => {
            if ((r.COLEGIO||'').trim() !== colegio.trim() ||
                (r.PRENDA ||'').trim() !== prenda.trim()) return r;
            const talla = (r.TALLA || r.talla || '').toString().trim();
            if (talla && costos[talla] > 0) {
                r.COSTO = costos[talla];
                r.SKU   = skus[talla] || skuBase;
            } else {
                r.COSTO = prom || r.COSTO || '';
                r.SKU   = skuBase;
            }
            return r;
        });

        writeCSV('vma_precios_matriz.csv', headers, rows);
        res.json({ ok: true, costoPromedio: prom });
    } catch (err) {
        console.error('/api/actualizar-matriz:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  FÁBRICA — Guarda insumos con PMP recalculado
// ══════════════════════════════════════════════════════════════
app.post('/api/guardar-compra', (req, res) => {
    try {
        const { insumos } = req.body || {};
        if (!Array.isArray(insumos))
            return res.status(400).json({ error: 'Payload inválido' });

        let { headers } = parseCSV(readCSV('vma_insumos.csv'));
        if (!headers.length)
            headers = ['id_insumo','nombre','categoria','unidad','stock_actual',
                       'costo_pmp','ultimo_costo','proveedor',
                       'fecha_ultima_compra','merma_pct','notas'];

        writeCSV('vma_insumos.csv', headers, insumos);
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/guardar-compra:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  AJUSTE DE INVENTARIO — lee y escribe con log de auditoría
// ══════════════════════════════════════════════════════════════
app.get('/api/ajuste-inventario', (req, res) => {
    res.json(getJSON('ajustes_inventario.json'));
});

app.post('/api/ajuste-inventario', (req, res) => {
    try {
        const { fecha, vendedor, obs, lineas } = req.body || {};
        if (!Array.isArray(lineas) || !lineas.length)
            return res.status(400).json({ error: 'Sin líneas' });

        // Actualizar stock: REEMPLAZA (no suma) el valor por producto
        const stock = getJSON('stock.json', true);
        lineas.forEach(({ key, nuevo }) => {
            if (key && nuevo !== undefined) stock[key] = parseInt(nuevo) || 0;
        });
        saveJSON('stock.json', stock);

        // Log de auditoría
        const ajustes = getJSON('ajustes_inventario.json');
        ajustes.push({
            id: Date.now(),
            fecha: fecha || new Date().toISOString().split('T')[0],
            vendedor: vendedor || 'Admin',
            obs: obs || '',
            lineas,
            timestamp: new Date().toISOString()
        });
        saveJSON('ajustes_inventario.json', ajustes);

        res.json({ ok: true, actualizados: lineas.length });
    } catch (err) {
        console.error('/api/ajuste-inventario:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  ✅ VMA ERP SERVER — puerto ${String(PORT).padEnd(13)}║`);
    console.log(`║  💾 Persistencia: ${PERSIST_DIR === '/var/data' ? '/var/data (Render) ' : 'local (__dirname)  '}║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
});
