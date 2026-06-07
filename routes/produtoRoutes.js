const express = require('express');
const router = express.Router();

// Listar produtos
router.get('/', async (req, res) => {
    try {
        // Produtos mockados para teste
        const produtos = [
            { _id: '1', nome: 'Arduino Uno R3', sku: 'ARDUINO-001', preco: 89.90, quantidade: 50, status: 'ativo' },
            { _id: '2', nome: 'ESP32 DevKit', sku: 'ESP32-001', preco: 49.90, quantidade: 100, status: 'ativo' },
            { _id: '3', nome: 'Raspberry Pi 4', sku: 'RPI-001', preco: 399.90, quantidade: 25, status: 'ativo' },
            { _id: '4', nome: 'Sensor DHT22', sku: 'SENSOR-001', preco: 29.90, quantidade: 200, status: 'ativo' }
        ];
        res.json({ success: true, produtos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        res.json({ success: true, produto: { _id: req.params.id, nome: 'Produto Teste', preco: 99.90 } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        res.status(201).json({ success: true, produto: req.body });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        res.json({ success: true, produto: req.body });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        res.json({ success: true, message: 'Produto excluído' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
