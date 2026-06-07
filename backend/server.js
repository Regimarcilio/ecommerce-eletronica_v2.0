const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Models
const UsuarioSchema = new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: String, telefone: String,
    role: { type: String, default: 'user' }, status: { type: String, default: 'ativo' }
}, { timestamps: true });
const Usuario = mongoose.model('Usuario', UsuarioSchema);

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, telefone, password } = req.body;
        const exists = await Usuario.findOne({ email });
        if (exists) return res.status(400).json({ success: false, message: 'Email já cadastrado' });
        const hash = await bcrypt.hash(password, 10);
        const user = await Usuario.create({ nome, email, telefone, password: hash });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, nome: user.nome, email: user.email, role: user.role } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Usuario.findOne({ email });
        if (!user) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, nome: user.nome, email: user.email, role: user.role } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

mongoose.connect('mongodb://admin:***REMOVED***@mongodb:27017/ecommerce?authSource=admin')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

const PORT = 5000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
