const fs = require('fs');
try {
    const csv = fs.readFileSync('vma_precios_matriz.csv', 'utf-8');
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
    const tallas = headers.slice(2);
    const stock = {};
    lines.slice(1).forEach(line => {
        const cols = line.split(',').map(c => c.trim());
        const colegio = cols[0];
        const prenda = cols[1];
        if(!colegio || !prenda) return;
        tallas.forEach((tal, idx) => {
            const raw = cols[2 + idx];
            if (raw && raw !== '' && raw.toUpperCase() !== 'NO') {
                const precio = parseInt(raw.replace(/\D/g, ''));
                if (!isNaN(precio) && precio > 0) {
                    stock[`${colegio}||${prenda}||${tal}`] = 6;
                }
            }
        });
    });
    fs.writeFileSync('stock.json', JSON.stringify(stock, null, 2));
    fs.writeFileSync('ventas.json', '[]');
    fs.writeFileSync('ingresos.json', '[]');
    console.log('✅ BBDD LIMPIA: Ventas/Ingresos en 0, Stock general en 6 unidades.');
} catch(e) {
    console.log('Error:', e.message);
}
