const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const categorias = [
            { _id: '1', nome: 'Arduino', icone: 'bi-cpu', status: 'ativo', slug: 'arduino' },
            { _id: '2', nome: 'ESP32', icone: 'bi-wifi', status: 'ativo', slug: 'esp32' },
            { _id: '3', nome: 'Raspberry Pi', icone: 'bi-pc-display', status: 'ativo', slug: 'raspberry-pi' },
            { _id: '4', nome: 'Sensores', icone: 'bi-thermometer', status: 'ativo', slug: 'sensores' },
            { _id: '5', nome: 'Componentes', icone: 'bi-grid-3x3', status: 'ativo', slug: 'componentes' },
            { _id: '6', nome: 'Cabos e Conectores', icone: 'bi-plug', status: 'ativo', slug: 'cabos-conectores' }
        ];
        res.json({ success: true, categorias });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        res.json({ success: true, categoria: { _id: req.params.id, nome: 'Categoria Teste' } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        res.status(201).json({ success: true, categoria: req.body });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        res.json({ success: true, categoria: req.body });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        res.json({ success: true, message: 'Categoria excluída' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
