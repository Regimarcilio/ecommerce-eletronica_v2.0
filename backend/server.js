const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Schemas
const UsuarioSchema = new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: String, telefone: String,
    role: { type: String, default: 'user' }, status: { type: String, default: 'ativo' }
}, { timestamps: true });

const ProdutoSchema = new mongoose.Schema({
    nome: String, sku: { type: String, unique: true }, preco: Number, quantidade: Number,
    status: { type: String, default: 'ativo' }, destaque: { type: Boolean, default: false },
    categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria' }
}, { timestamps: true });

const CategoriaSchema = new mongoose.Schema({
    nome: { type: String, unique: true }, slug: String, icone: String, status: { type: String, default: 'ativo' }
}, { timestamps: true });

const PedidoSchema = new mongoose.Schema({
    numero: String,
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    cliente: Object,
    endereco: Object,
    pagamento: String,
    items: Array,
    subtotal: Number,
    frete: Number,
    desconto: Number,
    total: Number,
    status: { type: String, default: 'pendente' }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Produto = mongoose.model('Produto', ProdutoSchema);
const Categoria = mongoose.model('Categoria', CategoriaSchema);
const Pedido = mongoose.model('Pedido', PedidoSchema);

// Middleware de autenticação
const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });
        const decoded = jwt.verify(token, 'secret');
        req.usuarioId = decoded.id;
        req.usuarioRole = decoded.role;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Token inválido' });
    }
};

// ========== ROTAS DE AUTH ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, telefone, password } = req.body;
        const exists = await Usuario.findOne({ email });
        if (exists) return res.status(400).json({ success: false, message: 'Email já cadastrado' });
        const hash = await bcrypt.hash(password, 10);
        const user = await Usuario.create({ nome, email, telefone, password: hash });
        const token = jwt.sign({ id: user._id, email, role: 'user' }, 'secret', { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, nome, email, role: 'user' } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Usuario.findOne({ email });
        if (!user) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        const token = jwt.sign({ id: user._id, email, role: user.role }, 'secret', { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, nome: user.nome, email, role: user.role } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/auth/me', auth, async (req, res) => {
    const user = await Usuario.findById(req.usuarioId).select('-password');
    res.json({ success: true, user });
});

// ========== ROTAS DE PRODUTOS ==========
app.get('/api/produtos', async (req, res) => {
    const produtos = await Produto.find().sort({ createdAt: -1 });
    res.json({ success: true, produtos });
});

app.get('/api/produtos/:id', async (req, res) => {
    const produto = await Produto.findById(req.params.id);
    res.json({ success: true, produto });
});

app.post('/api/produtos', async (req, res) => {
    const produto = await Produto.create(req.body);
    res.json({ success: true, produto });
});

app.put('/api/produtos/:id', async (req, res) => {
    const produto = await Produto.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, produto });
});

app.delete('/api/produtos/:id', async (req, res) => {
    await Produto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ========== ROTAS DE CATEGORIAS ==========
app.get('/api/categorias', async (req, res) => {
    const categorias = await Categoria.find().sort({ createdAt: -1 });
    res.json({ success: true, categorias });
});

app.get('/api/categorias/:id', async (req, res) => {
    const categoria = await Categoria.findById(req.params.id);
    res.json({ success: true, categoria });
});

app.post('/api/categorias', async (req, res) => {
    const categoria = await Categoria.create(req.body);
    res.json({ success: true, categoria });
});

app.put('/api/categorias/:id', async (req, res) => {
    const categoria = await Categoria.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, categoria });
});

app.delete('/api/categorias/:id', async (req, res) => {
    await Categoria.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ========== ROTAS DE PEDIDOS ==========
// Listar pedidos do usuário logado
app.get('/api/pedidos', auth, async (req, res) => {
    try {
        let query = { usuarioId: req.usuarioId };
        // Admin vê todos os pedidos
        if (req.usuarioRole === 'admin') query = {};
        const pedidos = await Pedido.find(query).sort({ createdAt: -1 });
        res.json({ success: true, pedidos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Buscar pedido por ID (só se for do usuário ou admin)
app.get('/api/pedidos/:id', auth, async (req, res) => {
    try {
        const pedido = await Pedido.findById(req.params.id);
        if (!pedido) return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
        if (pedido.usuarioId.toString() !== req.usuarioId && req.usuarioRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Acesso negado' });
        }
        res.json({ success: true, pedido });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Criar pedido
app.post('/api/pedidos', auth, async (req, res) => {
    try {
        const pedido = await Pedido.create({
            ...req.body,
            usuarioId: req.usuarioId
        });
        res.status(201).json({ success: true, pedido });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Atualizar status do pedido (admin apenas)
app.put('/api/pedidos/:id/status', auth, async (req, res) => {
    if (req.usuarioRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
    }
    try {
        const pedido = await Pedido.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        res.json({ success: true, pedido });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== ROTAS DE CLIENTES ==========
app.get('/api/clientes', auth, async (req, res) => {
    if (req.usuarioRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
    }
    const clientes = await Usuario.find({ role: 'user' });
    res.json({ success: true, clientes });
});

// ========== DASHBOARD STATS ==========
app.get('/api/dashboard/stats', auth, async (req, res) => {
    if (req.usuarioRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
    }
    const totalProdutos = await Produto.countDocuments();
    const totalCategorias = await Categoria.countDocuments();
    const totalClientes = await Usuario.countDocuments({ role: 'user' });
    const totalPedidos = await Pedido.countDocuments();
    const pedidos = await Pedido.find();
    const vendasTotal = pedidos.reduce((sum, p) => sum + p.total, 0);
    res.json({ success: true, stats: { totalProdutos, totalCategorias, totalClientes, totalPedidos, vendasTotal } });
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

// ========== INICIALIZAÇÃO ==========
async function init() {
    const admin = await Usuario.findOne({ email: 'admin@techstore.com.br' });
    if (!admin) {
        const hash = await bcrypt.hash('***REMOVED***', 10);
        await Usuario.create({
            nome: 'Administrador', email: 'admin@techstore.com.br', password: hash,
            telefone: '11999999999', role: 'admin'
        });
        console.log('Admin criado');
    }
}

mongoose.connect('mongodb://admin:***REMOVED***@localhost:27017/ecommerce?authSource=admin')
    .then(async () => { console.log('MongoDB conectado'); await init(); app.listen(5000, () => console.log('Servidor na porta 5000')); })
    .catch(err => console.error('MongoDB erro:', err));
