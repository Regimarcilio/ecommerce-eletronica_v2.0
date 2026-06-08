const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ========== SCHEMAS ==========
const UsuarioSchema = new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: String, telefone: String,
    role: { type: String, default: 'user' }, status: { type: String, default: 'ativo' }
}, { timestamps: true });

const ProdutoSchema = new mongoose.Schema({
    nome: String, sku: { type: String, unique: true }, preco: Number, quantidade: Number,
    status: { type: String, default: 'ativo' }, destaque: { type: Boolean, default: false },
    descricaoCurta: String
}, { timestamps: true });

const CategoriaSchema = new mongoose.Schema({
    nome: { type: String, unique: true }, slug: String, icone: String, status: { type: String, default: 'ativo' }
}, { timestamps: true });

const PedidoSchema = new mongoose.Schema({
    numero: String, cliente: Object, endereco: Object, pagamento: String,
    items: Array, subtotal: Number, frete: Number, desconto: Number,
    total: Number, status: { type: String, default: 'pendente' }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Produto = mongoose.model('Produto', ProdutoSchema);
const Categoria = mongoose.model('Categoria', CategoriaSchema);
const Pedido = mongoose.model('Pedido', PedidoSchema);

// ========== ROTAS DE AUTH ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, telefone, password } = req.body;
        const exists = await Usuario.findOne({ email });
        if (exists) return res.status(400).json({ success: false, message: 'Email já cadastrado' });
        const hash = await bcrypt.hash(password, 10);
        const user = await Usuario.create({ nome, email, telefone, password: hash, role: 'user' });
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, 'secret', { expiresIn: '7d' });
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
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, 'secret', { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, nome: user.nome, email: user.email, role: user.role } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ========== ROTAS DE PRODUTOS ==========
app.get('/api/produtos', async (req, res) => {
    try {
        const produtos = await Produto.find().sort({ createdAt: -1 });
        res.json({ success: true, produtos });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/produtos/:id', async (req, res) => {
    try {
        const produto = await Produto.findById(req.params.id);
        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        res.json({ success: true, produto });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/produtos', async (req, res) => {
    try {
        const produto = await Produto.create(req.body);
        res.status(201).json({ success: true, produto });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/produtos/:id', async (req, res) => {
    try {
        const produto = await Produto.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        res.json({ success: true, produto });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/produtos/:id', async (req, res) => {
    try {
        const produto = await Produto.findByIdAndDelete(req.params.id);
        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        res.json({ success: true, message: 'Produto excluído' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ========== ROTAS DE CATEGORIAS ==========
app.get('/api/categorias', async (req, res) => {
    try {
        const categorias = await Categoria.find().sort({ createdAt: -1 });
        res.json({ success: true, categorias });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/categorias/:id', async (req, res) => {
    try {
        const categoria = await Categoria.findById(req.params.id);
        if (!categoria) return res.status(404).json({ success: false, message: 'Categoria não encontrada' });
        res.json({ success: true, categoria });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/categorias', async (req, res) => {
    try {
        const categoria = await Categoria.create(req.body);
        res.status(201).json({ success: true, categoria });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/categorias/:id', async (req, res) => {
    try {
        const categoria = await Categoria.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!categoria) return res.status(404).json({ success: false, message: 'Categoria não encontrada' });
        res.json({ success: true, categoria });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/categorias/:id', async (req, res) => {
    try {
        const categoria = await Categoria.findByIdAndDelete(req.params.id);
        if (!categoria) return res.status(404).json({ success: false, message: 'Categoria não encontrada' });
        res.json({ success: true, message: 'Categoria excluída' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ========== ROTAS DE PEDIDOS ==========
app.get('/api/pedidos', async (req, res) => {
    try {
        const pedidos = await Pedido.find().sort({ createdAt: -1 });
        res.json({ success: true, pedidos });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/pedidos', async (req, res) => {
    try {
        const pedido = await Pedido.create(req.body);
        res.status(201).json({ success: true, pedido });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/pedidos/:id/status', async (req, res) => {
    try {
        const pedido = await Pedido.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        if (!pedido) return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
        res.json({ success: true, pedido });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ========== ROTAS DE CLIENTES ==========
app.get('/api/clientes', async (req, res) => {
    try {
        const clientes = await Usuario.find({ role: 'user' });
        res.json({ success: true, clientes });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ========== DASHBOARD STATS ==========
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalProdutos = await Produto.countDocuments();
        const totalCategorias = await Categoria.countDocuments();
        const totalClientes = await Usuario.countDocuments({ role: 'user' });
        const totalPedidos = await Pedido.countDocuments();
        const pedidos = await Pedido.find();
        const vendasTotal = pedidos.reduce((sum, p) => sum + p.total, 0);
        res.json({ success: true, stats: { totalProdutos, totalCategorias, totalClientes, totalPedidos, vendasTotal } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

// ========== INICIALIZAÇÃO ==========
async function init() {
    // Criar admin
    const admin = await Usuario.findOne({ email: 'admin@techstore.com.br' });
    if (!admin) {
        const hash = await bcrypt.hash('***REMOVED***', 10);
        await Usuario.create({
            nome: 'Administrador', email: 'admin@techstore.com.br', password: hash,
            telefone: '11999999999', role: 'admin', status: 'ativo'
        });
        console.log('✅ Admin criado');
    }
    
    // Criar produtos exemplo
    const produtosCount = await Produto.countDocuments();
    if (produtosCount === 0) {
        await Produto.create([
            { nome: 'Arduino Uno R3', sku: 'ARDUINO-001', preco: 89.90, quantidade: 50, status: 'ativo', destaque: true },
            { nome: 'ESP32 DevKit', sku: 'ESP32-001', preco: 49.90, quantidade: 100, status: 'ativo', destaque: true },
            { nome: 'Raspberry Pi 4 4GB', sku: 'RPI-001', preco: 399.90, quantidade: 25, status: 'ativo', destaque: true }
        ]);
        console.log('✅ Produtos exemplo criados');
    }
    
    // Criar categorias exemplo
    const catsCount = await Categoria.countDocuments();
    if (catsCount === 0) {
        await Categoria.create([
            { nome: 'Arduino', slug: 'arduino', icone: 'bi-cpu', status: 'ativo' },
            { nome: 'ESP32', slug: 'esp32', icone: 'bi-wifi', status: 'ativo' },
            { nome: 'Raspberry Pi', slug: 'raspberry-pi', icone: 'bi-pc-display', status: 'ativo' },
            { nome: 'Sensores', slug: 'sensores', icone: 'bi-thermometer', status: 'ativo' }
        ]);
        console.log('✅ Categorias exemplo criadas');
    }
}

mongoose.connect('mongodb://admin:***REMOVED***@localhost:27017/ecommerce?authSource=admin')
    .then(async () => {
        console.log('✅ MongoDB conectado');
        await init();
        console.log('\n🚀 Servidor rodando na porta 5000');
        console.log('📍 http://localhost:5000');
        console.log('🔑 Admin: admin@techstore.com.br / ***REMOVED***\n');
    })
    .catch(err => console.error('❌ MongoDB erro:', err.message));

app.listen(5000, () => console.log('✅ Backend ativo na porta 5000'));
