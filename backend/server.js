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
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    telefone: { type: String },
    role: { type: String, default: 'user' },
    status: { type: String, default: 'ativo' }
}, { timestamps: true });

const ProdutoSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    preco: { type: Number, required: true },
    precoPromocional: { type: Number, default: null },
    quantidade: { type: Number, default: 0 },
    descricaoCurta: { type: String },
    descricaoCompleta: { type: String },
    marca: { type: String },
    categoria: { type: String },
    imagens: [{ url: String }],
    destaque: { type: Boolean, default: false },
    status: { type: String, default: 'ativo' }
}, { timestamps: true });

const CategoriaSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    icone: { type: String, default: 'bi-folder' },
    descricao: { type: String },
    ordem: { type: Number, default: 0 },
    status: { type: String, default: 'ativo' }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Produto = mongoose.model('Produto', ProdutoSchema);
const Categoria = mongoose.model('Categoria', CategoriaSchema);

// ========== ROTAS DE AUTENTICAÇÃO ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, telefone, password } = req.body;
        
        const userExists = await Usuario.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'Email já cadastrado' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const user = await Usuario.create({
            nome,
            email,
            telefone,
            password: hashedPassword,
            role: email === 'admin@techstore.com.br' ? 'admin' : 'user'
        });
        
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            'secretkey123',
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await Usuario.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
        }
        
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
        }
        
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            'secretkey123',
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== ROTAS DE PRODUTOS ==========
// GET - Listar produtos (com filtro de destaque)
app.get('/api/produtos', async (req, res) => {
    try {
        const { destaque, limit = 20 } = req.query;
        let query = {};
        
        // Filtrar por destaque se o parâmetro for 'true'
        if (destaque === 'true') {
            query.destaque = true;
        }
        
        // Filtrar apenas produtos ativos
        query.status = 'ativo';
        
        const produtos = await Produto.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
            
        res.json({ success: true, produtos });
    } catch (error) {
        console.error('Erro ao listar produtos:', error);
        res.status(500).json({ success: false, message: error.message, produtos: [] });
    }
});

// GET - Produto por ID
app.get('/api/produtos/:id', async (req, res) => {
    try {
        const produto = await Produto.findById(req.params.id);
        if (!produto) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        }
        res.json({ success: true, produto });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST - Criar produto
app.post('/api/produtos', async (req, res) => {
    try {
        const produto = await Produto.create(req.body);
        res.status(201).json({ success: true, produto });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT - Atualizar produto
app.put('/api/produtos/:id', async (req, res) => {
    try {
        const produto = await Produto.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, produto });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE - Excluir produto
app.delete('/api/produtos/:id', async (req, res) => {
    try {
        await Produto.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Produto excluído' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== ROTAS DE CATEGORIAS ==========
app.get('/api/categorias', async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status === 'ativo') query.status = 'ativo';
        
        const categorias = await Categoria.find(query).sort({ ordem: 1 });
        res.json({ success: true, categorias });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message, categorias: [] });
    }
});

app.get('/api/categorias/:id', async (req, res) => {
    try {
        const categoria = await Categoria.findById(req.params.id);
        if (!categoria) {
            return res.status(404).json({ success: false, message: 'Categoria não encontrada' });
        }
        res.json({ success: true, categoria });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/categorias', async (req, res) => {
    try {
        const categoria = await Categoria.create(req.body);
        res.status(201).json({ success: true, categoria });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/categorias/:id', async (req, res) => {
    try {
        const categoria = await Categoria.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, categoria });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/categorias/:id', async (req, res) => {
    try {
        await Categoria.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Categoria excluída' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== DASHBOARD ==========
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalProdutos = await Produto.countDocuments();
        const totalCategorias = await Categoria.countDocuments();
        const totalClientes = await Usuario.countDocuments({ role: 'user' });
        
        res.json({
            success: true,
            stats: {
                totalProdutos,
                totalCategorias,
                totalClientes,
                totalPedidos: 0,
                vendasTotal: 0,
                produtosMaisVendidos: [],
                vendasPorDia: []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== CLIENTES ==========
app.get('/api/clientes', async (req, res) => {
    try {
        const clientes = await Usuario.find({ role: 'user' }).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, clientes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message, clientes: [] });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// ========== INICIALIZAÇÃO ==========
const MONGO_URI = 'mongodb://admin:***REMOVED***@localhost:27017/ecommerce?authSource=admin';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB conectado!');
        
        // Criar admin
        const adminExists = await Usuario.findOne({ email: 'admin@techstore.com.br' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('***REMOVED***', salt);
            await Usuario.create({
                nome: 'Administrador',
                email: 'admin@techstore.com.br',
                password: hashedPassword,
                telefone: '11999999999',
                role: 'admin'
            });
            console.log('✅ Admin criado!');
        }
        
        // Criar categorias padrão
        const categoriasCount = await Categoria.countDocuments();
        if (categoriasCount === 0) {
            await Categoria.insertMany([
                { nome: 'Arduino', slug: 'arduino', icone: 'bi-cpu', ordem: 1 },
                { nome: 'ESP32', slug: 'esp32', icone: 'bi-wifi', ordem: 2 },
                { nome: 'Raspberry Pi', slug: 'raspberry-pi', icone: 'bi-pc-display', ordem: 3 },
                { nome: 'Sensores', slug: 'sensores', icone: 'bi-thermometer', ordem: 4 },
                { nome: 'Componentes', slug: 'componentes', icone: 'bi-grid-3x3', ordem: 5 }
            ]);
            console.log('✅ Categorias criadas!');
        }
        
        // Criar produtos padrão com alguns em destaque
        const produtosCount = await Produto.countDocuments();
        if (produtosCount === 0) {
            await Produto.insertMany([
                { nome: 'Arduino Uno R3', sku: 'ARDUINO-001', preco: 89.90, quantidade: 50, destaque: true, status: 'ativo', categoria: 'Arduino' },
                { nome: 'ESP32 DevKit', sku: 'ESP32-001', preco: 49.90, quantidade: 100, destaque: true, status: 'ativo', categoria: 'ESP32' },
                { nome: 'Raspberry Pi 4', sku: 'RPI-001', preco: 399.90, quantidade: 25, destaque: true, status: 'ativo', categoria: 'Raspberry Pi' },
                { nome: 'Sensor DHT22', sku: 'SENSOR-001', preco: 29.90, quantidade: 200, destaque: false, status: 'ativo', categoria: 'Sensores' },
                { nome: 'Resistor 1kΩ', sku: 'RES-001', preco: 0.50, quantidade: 1000, destaque: false, status: 'ativo', categoria: 'Componentes' }
            ]);
            console.log('✅ Produtos criados!');
        }
        
        console.log('\n🚀 Servidor pronto!');
        console.log(`📍 http://localhost:5000`);
        console.log(`🔑 Admin: admin@techstore.com.br / ***REMOVED***\n`);
    })
    .catch(err => console.error('❌ Erro MongoDB:', err.message));

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
