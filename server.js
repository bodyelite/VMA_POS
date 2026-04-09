const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Endpoint de prueba para verificar conexión
app.get('/api/status', (req, res) => {
    res.json({ status: "Backend local de VMA operando al 100%" });
});

app.listen(PORT, () => {
    console.log(`Servidor local VMA corriendo en http://localhost:${PORT}`);
});
