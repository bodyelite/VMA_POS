const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const PATH_CLIENTES = path.join(__dirname, 'VMA_Estructura.xlsx - CLIENTES.csv');
const PATH_PRODUCTOS = path.join(__dirname, 'VMA_Estructura.xlsx - MAESTRO_PRODUCTOS.csv');

app.get('/api/clientes', (req, res) => {
    const results = [];
    fs.createReadStream(PATH_CLIENTES)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => res.json(results));
});

app.get('/api/productos', (req, res) => {
    const results = [];
    fs.createReadStream(PATH_PRODUCTOS)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => res.json(results));
});

app.listen(PORT, () => {
    console.log('✅ SERVIDOR VMA CON DATOS CARGADOS');
});
