const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('fast-csv');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const PATH_CLIENTES = path.join(__dirname, 'VMA_Estructura.xlsx - CLIENTES.csv');
const PATH_PRODUCTOS = path.join(__dirname, 'VMA_Estructura.xlsx - MAESTRO_PRODUCTOS.csv');
const PATH_VENTAS_CAB = path.join(__dirname, 'VMA_Estructura.xlsx - VENTAS_CABECERA.csv');

// Leer Clientes
app.get('/api/clientes', (req, res) => {
    const results = [];
    fs.createReadStream(PATH_CLIENTES)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => res.json(results));
});

// Leer Productos
app.get('/api/productos', (req, res) => {
    const results = [];
    fs.createReadStream(PATH_PRODUCTOS)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => res.json(results));
});

// Procesar Venta (Escribir en CSV)
app.post('/api/venta', (req, res) => {
    const { cabecera, detalle } = req.body;
    
    // Aquí iría la lógica para append en los CSV de Ventas
    // y la actualización de stock en MAESTRO_PRODUCTOS
    console.log("Venta recibida:", cabecera);
    
    res.json({ success: true, message: "Venta registrada en archivos locales" });
});

app.listen(PORT, () => {
    console.log(`Servidor VMA corriendo en puerto ${PORT}`);
});
