require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const crypto = require('crypto');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// Access curto (min) + refresh opaco de longa duracao (dias) com rotacao
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_DAYS = Math.max(1, parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || '7', 10) || 7);
const RESET_MINUTES = Math.max(5, parseInt(process.env.PASSWORD_RESET_MINUTES || '60', 10) || 60);
// Em dev, /forgot devolve o token p/ teste; em prod, plugar provedor de e-mail
const RESET_TOKEN_RESPONSE = process.env.ALLOW_RESET_TOKEN_RESPONSE === 'true';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@techstore.com.br';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev-troque-em-producao';
const CORS_ORIGIN = process.env.CORS_ORIGIN || true;

if (!process.env.JWT_SECRET || !process.env.ADMIN_PASSWORD || !process.env.MONGODB_URI) {
    console.warn('[seguranca] Usando valores de desenvolvimento (fallbacks). Defina JWT_SECRET, ADMIN_PASSWORD e MONGODB_URI no backend/.env para producao.');
}

const app = express();
app.use(helmet());
app.use(cors(CORS_ORIGIN === true ? undefined : { origin: CORS_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

// Limites por rota sensivel (E2E usa: login ~7, register ~8, refresh ~3, forgot+reset ~5 por run)
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Observabilidade leve (em memoria, sem dependencias)
const startedAt = Date.now();
const metrics = { requests: 0, errors4xx: 0, errors5xx: 0, byRoute: {} };
app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - t0;
        const route = `${req.method} ${req.path.replace(/\/[a-f0-9]{24}(?=\/|$)/gi, '/:id')}`;
        metrics.requests++;
        metrics.byRoute[route] = (metrics.byRoute[route] || 0) + 1;
        if (res.statusCode >= 500) metrics.errors5xx++;
        else if (res.statusCode >= 400) metrics.errors4xx++;
        console.log(JSON.stringify({ ts: new Date().toISOString(), method: req.method, path: req.path, status: res.statusCode, ms }));
    });
    next();
});

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const err = (res, status, message, code) => res.status(status).json({ success: false, message, code });
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parsePaging = (q) => {
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 50));
    return { page, limit, skip: (page - 1) * limit };
};

// Schemas com validacao basica server-side
const EnderecoSchema = new mongoose.Schema({
    logradouro: { type: String, required: true, trim: true, maxlength: 160 },
    numero: { type: String, required: true, trim: true, maxlength: 20 },
    complemento: { type: String, trim: true, maxlength: 80, default: '' },
    bairro: { type: String, required: true, trim: true, maxlength: 80 },
    cidade: { type: String, required: true, trim: true, maxlength: 80 },
    estado: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
    cep: { type: String, required: true, trim: true, match: /^\d{5}-?\d{3}$/ }
}, { _id: true });

const UsuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    telefone: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' },
    enderecos: { type: [EnderecoSchema], default: [] }
}, { timestamps: true });

// Sessoes (refresh opaco com rotacao) e reset de senha (token unico, 1 uso)
const RefreshTokenSchema = new mongoose.Schema({
    tokenHash: { type: String, required: true, unique: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    revoked: { type: Boolean, default: false }
}, { timestamps: true });

const PasswordResetSchema = new mongoose.Schema({
    tokenHash: { type: String, required: true, unique: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    used: { type: Boolean, default: false }
}, { timestamps: true });

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const newOpaqueToken = () => crypto.randomBytes(48).toString('hex');
const signAccess = (user) => jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
);
async function issueRefresh(usuarioId) {
    const token = newOpaqueToken();
    await RefreshToken.create({
        tokenHash: sha256(token),
        usuarioId,
        expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000)
    });
    return token;
}

const ProdutoSchema = new mongoose.Schema({
    nome: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true },
    preco: { type: Number, required: true, min: 0 },
    quantidade: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' },
    destaque: { type: Boolean, default: false },
    categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria' }
}, { timestamps: true });

const CategoriaSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, trim: true },
    icone: { type: String, trim: true, default: 'fa-microchip' },
    status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' }
}, { timestamps: true });

const PedidoSchema = new mongoose.Schema({
    numero: { type: String, required: true, unique: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    cliente: { type: Object, required: true },
    endereco: { type: Object, required: true },
    pagamento: { type: String, enum: ['pix', 'card', 'boleto'], required: true },
    items: { type: Array, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    frete: { type: Number, required: true, min: 0 },
    desconto: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pendente', 'pago', 'enviado', 'entregue', 'cancelado'], default: 'pendente' }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Produto = mongoose.model('Produto', ProdutoSchema);
const Categoria = mongoose.model('Categoria', CategoriaSchema);
const Pedido = mongoose.model('Pedido', PedidoSchema);
const RefreshToken = mongoose.model('RefreshToken', RefreshTokenSchema);
const PasswordReset = mongoose.model('PasswordReset', PasswordResetSchema);

// Middleware de autenticação (valida usuario ativo)
const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return err(res, 401, 'Token não fornecido', 'NO_TOKEN');
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await Usuario.findById(decoded.id).select('role status');
        if (!user || user.status !== 'ativo') return err(res, 401, 'Token inválido', 'INVALID_TOKEN');
        req.usuarioId = decoded.id;
        req.usuarioRole = user.role;
        next();
    } catch (error) {
        return err(res, 401, 'Token inválido', 'INVALID_TOKEN');
    }
};

const admin = (req, res, next) => {
    if (req.usuarioRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
    }
    next();
};

// ========== ROTAS DE AUTH ==========
app.post('/api/auth/register', registerLimiter, async (req, res) => {
    try {
        const { nome, email, telefone, password } = req.body;
        if (!nome?.trim() || !email?.trim() || !password) return err(res, 400, 'Nome, e-mail e senha são obrigatórios', 'VALIDATION');
        if (password.length < 8) return err(res, 400, 'Senha deve ter ao menos 8 caracteres', 'WEAK_PASSWORD');
        const emailNorm = String(email).toLowerCase().trim();
        const exists = await Usuario.findOne({ email: emailNorm });
        if (exists) return err(res, 400, 'Email já cadastrado', 'EMAIL_EXISTS');
        const hash = await bcrypt.hash(password, 10);
        const user = await Usuario.create({ nome: String(nome).trim(), email: emailNorm, telefone: String(telefone || '').trim(), password: hash, role: 'user' });
        const token = signAccess({ _id: user._id, email: emailNorm, role: 'user' });
        const refreshToken = await issueRefresh(user._id);
        res.json({ success: true, token, refreshToken, user: { id: user._id, nome: user.nome, email: emailNorm, role: 'user' } });
    } catch (error) {
        if (error.code === 11000) return err(res, 400, 'Email já cadastrado', 'EMAIL_EXISTS');
        console.error('register:', error.message);
        return err(res, 500, 'Erro interno', 'INTERNAL');
    }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return err(res, 400, 'E-mail e senha são obrigatórios', 'VALIDATION');
        const user = await Usuario.findOne({ email: String(email).toLowerCase().trim() }).select('+password nome email role status');
        if (!user || user.status !== 'ativo') return err(res, 401, 'Credenciais inválidas', 'AUTH');
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return err(res, 401, 'Credenciais inválidas', 'AUTH');
        const token = signAccess(user);
        const refreshToken = await issueRefresh(user._id);
        res.json({ success: true, token, refreshToken, user: { id: user._id, nome: user.nome, email: user.email, role: user.role } });
    } catch (error) {
        console.error('login:', error.message);
        return err(res, 500, 'Erro interno', 'INTERNAL');
    }
});

// Renova par de tokens com rotacao (refresh de uso unico)
app.post('/api/auth/refresh', refreshLimiter, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return err(res, 400, 'Refresh token obrigatório', 'VALIDATION');
    const sess = await RefreshToken.findOne({ tokenHash: sha256(refreshToken) });
    if (!sess || sess.revoked || sess.expiresAt < new Date()) {
        return err(res, 401, 'Sessão inválida', 'AUTH');
    }
    const user = await Usuario.findById(sess.usuarioId).select('email role status');
    if (!user || user.status !== 'ativo') return err(res, 401, 'Sessão inválida', 'AUTH');
    sess.revoked = true;
    await sess.save();
    const token = signAccess(user);
    const next = await issueRefresh(user._id);
    res.json({ success: true, token, refreshToken: next });
}));

// Encerra a sessao (revoga refresh; access expira em minutos)
app.post('/api/auth/logout', auth, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
        await RefreshToken.updateOne(
            { tokenHash: sha256(refreshToken), usuarioId: req.usuarioId },
            { $set: { revoked: true } }
        );
    }
    res.json({ success: true });
}));

// Solicita reset de senha (resposta generica anti-enumeracao)
app.post('/api/auth/forgot', resetLimiter, asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    const generic = { success: true, message: 'Se o e-mail existir, voce recebera instrucoes.' };
    if (!email) return res.json(generic);
    const user = await Usuario.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.json(generic);
    const token = newOpaqueToken();
    await PasswordReset.create({
        tokenHash: sha256(token),
        usuarioId: user._id,
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000)
    });
    if (RESET_TOKEN_RESPONSE) return res.json({ ...generic, resetToken: token });
    return res.json(generic);
}));

// Conclui reset com token de uso unico
app.post('/api/auth/reset', resetLimiter, asyncHandler(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return err(res, 400, 'Token e nova senha são obrigatórios', 'VALIDATION');
    if (String(password).length < 8) return err(res, 400, 'Nova senha deve ter ao menos 8 caracteres', 'WEAK_PASSWORD');
    const rec = await PasswordReset.findOne({ tokenHash: sha256(token) });
    if (!rec || rec.used || rec.expiresAt < new Date()) {
        return err(res, 400, 'Token inválido ou expirado', 'AUTH');
    }
    const user = await Usuario.findById(rec.usuarioId).select('+password');
    if (!user || user.status !== 'ativo') return err(res, 400, 'Token inválido ou expirado', 'AUTH');
    user.password = await bcrypt.hash(String(password), 10);
    await user.save();
    rec.used = true;
    await rec.save();
    await RefreshToken.updateMany({ usuarioId: user._id, revoked: false }, { $set: { revoked: true } });
    res.json({ success: true, message: 'Senha redefinida' });
}));

app.get('/api/auth/me', auth, asyncHandler(async (req, res) => {
    const user = await Usuario.findById(req.usuarioId).select('-password');
    if (!user) return err(res, 404, 'Usuário não encontrado', 'NOT_FOUND');
    res.json({ success: true, user });
}));

app.put('/api/auth/me', auth, asyncHandler(async (req, res) => {
    const { nome, telefone } = req.body;
    if (nome !== undefined && !String(nome).trim()) return err(res, 400, 'Nome inválido', 'VALIDATION');
    const update = {};
    if (nome !== undefined) update.nome = String(nome).trim().slice(0, 120);
    if (telefone !== undefined) update.telefone = String(telefone).trim().slice(0, 30);
    const user = await Usuario.findByIdAndUpdate(req.usuarioId, update, { new: true, runValidators: true }).select('-password');
    if (!user) return err(res, 404, 'Usuário não encontrado', 'NOT_FOUND');
    res.json({ success: true, user });
}));

app.put('/api/auth/password', auth, asyncHandler(async (req, res) => {
    const { current, password } = req.body;
    if (!current || !password) return err(res, 400, 'Senhas atual e nova são obrigatórias', 'VALIDATION');
    if (String(password).length < 8) return err(res, 400, 'Nova senha deve ter ao menos 8 caracteres', 'WEAK_PASSWORD');
    const user = await Usuario.findById(req.usuarioId).select('+password');
    if (!user) return err(res, 404, 'Usuário não encontrado', 'NOT_FOUND');
    const ok = await bcrypt.compare(String(current), user.password);
    if (!ok) return err(res, 401, 'Senha atual incorreta', 'AUTH');
    user.password = await bcrypt.hash(String(password), 10);
    await user.save();
    res.json({ success: true, message: 'Senha alterada' });
}));

// ========== ENDERECOS DO USUARIO ==========
const pickEndereco = (b) => ({
    logradouro: b.logradouro, numero: b.numero, complemento: b.complemento || '',
    bairro: b.bairro, cidade: b.cidade,
    estado: String(b.estado || '').toUpperCase(), cep: b.cep
});

app.get('/api/auth/enderecos', auth, asyncHandler(async (req, res) => {
    const user = await Usuario.findById(req.usuarioId).select('enderecos');
    if (!user) return err(res, 404, 'Usuário não encontrado', 'NOT_FOUND');
    res.json({ success: true, enderecos: user.enderecos });
}));

app.post('/api/auth/enderecos', auth, asyncHandler(async (req, res) => {
    const user = await Usuario.findById(req.usuarioId);
    if (!user) return err(res, 404, 'Usuário não encontrado', 'NOT_FOUND');
    user.enderecos.push(pickEndereco(req.body));
    await user.save();
    res.status(201).json({ success: true, enderecos: user.enderecos });
}));

app.put('/api/auth/enderecos/:id', auth, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const user = await Usuario.findById(req.usuarioId);
    if (!user) return err(res, 404, 'Usuário não encontrado', 'NOT_FOUND');
    const end = user.enderecos.id(req.params.id);
    if (!end) return err(res, 404, 'Endereço não encontrado', 'NOT_FOUND');
    end.set(pickEndereco(req.body));
    await user.save();
    res.json({ success: true, enderecos: user.enderecos });
}));

app.delete('/api/auth/enderecos/:id', auth, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const user = await Usuario.findById(req.usuarioId);
    if (!user) return err(res, 404, 'Usuário não encontrado', 'NOT_FOUND');
    const end = user.enderecos.id(req.params.id);
    if (!end) return err(res, 404, 'Endereço não encontrado', 'NOT_FOUND');
    end.deleteOne();
    await user.save();
    res.json({ success: true, enderecos: user.enderecos });
}));

// ========== ROTAS DE PRODUTOS ==========
app.get('/api/produtos', asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.categoria) {
        if (!isValidId(req.query.categoria)) return err(res, 400, 'Categoria inválida', 'VALIDATION');
        query.categoria = req.query.categoria;
    }
    const { page, limit, skip } = parsePaging(req.query);
    const [produtos, total] = await Promise.all([
        Produto.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Produto.countDocuments(query)
    ]);
    res.json({ success: true, produtos, page, limit, total, pages: Math.ceil(total / limit) });
}));

app.get('/api/produtos/:id', asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const produto = await Produto.findById(req.params.id);
    if (!produto) return err(res, 404, 'Produto não encontrado', 'NOT_FOUND');
    res.json({ success: true, produto });
}));

const pickProduto = (b) => ({ nome: b.nome, sku: b.sku, preco: b.preco, quantidade: b.quantidade, status: b.status, destaque: b.destaque, categoria: b.categoria || undefined });

app.post('/api/produtos', auth, admin, asyncHandler(async (req, res) => {
    const produto = await Produto.create(pickProduto(req.body));
    res.json({ success: true, produto });
}));

app.put('/api/produtos/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const produto = await Produto.findByIdAndUpdate(req.params.id, pickProduto(req.body), { new: true, runValidators: true });
    if (!produto) return err(res, 404, 'Produto não encontrado', 'NOT_FOUND');
    res.json({ success: true, produto });
}));

app.delete('/api/produtos/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const produto = await Produto.findByIdAndDelete(req.params.id);
    if (!produto) return err(res, 404, 'Produto não encontrado', 'NOT_FOUND');
    res.json({ success: true });
}));

// ========== ROTAS DE CATEGORIAS ==========
app.get('/api/categorias', asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    const { page, limit, skip } = parsePaging(req.query);
    const [categorias, total] = await Promise.all([
        Categoria.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Categoria.countDocuments(query)
    ]);
    res.json({ success: true, categorias, page, limit, total, pages: Math.ceil(total / limit) });
}));

app.get('/api/categorias/:id', asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const categoria = await Categoria.findById(req.params.id);
    if (!categoria) return err(res, 404, 'Categoria não encontrada', 'NOT_FOUND');
    res.json({ success: true, categoria });
}));

const pickCategoria = (b) => ({ nome: b.nome, slug: b.slug, icone: b.icone, status: b.status });

app.post('/api/categorias', auth, admin, asyncHandler(async (req, res) => {
    const categoria = await Categoria.create(pickCategoria(req.body));
    res.json({ success: true, categoria });
}));

app.put('/api/categorias/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const categoria = await Categoria.findByIdAndUpdate(req.params.id, pickCategoria(req.body), { new: true, runValidators: true });
    if (!categoria) return err(res, 404, 'Categoria não encontrada', 'NOT_FOUND');
    res.json({ success: true, categoria });
}));

app.delete('/api/categorias/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const categoria = await Categoria.findByIdAndDelete(req.params.id);
    if (!categoria) return err(res, 404, 'Categoria não encontrada', 'NOT_FOUND');
    res.json({ success: true });
}));

// ========== ROTAS DE PEDIDOS ==========
// Listar pedidos do usuário logado
app.get('/api/pedidos', auth, asyncHandler(async (req, res) => {
    let query = { usuarioId: req.usuarioId };
    // Admin vê todos os pedidos
    if (req.usuarioRole === 'admin') query = {};
    const { page, limit, skip } = parsePaging(req.query);
    const [pedidos, total] = await Promise.all([
        Pedido.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Pedido.countDocuments(query)
    ]);
    res.json({ success: true, pedidos, page, limit, total, pages: Math.ceil(total / limit) });
}));

// Buscar pedido por ID (só se for do usuário ou admin)
app.get('/api/pedidos/:id', auth, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const pedido = await Pedido.findById(req.params.id);
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (pedido.usuarioId.toString() !== req.usuarioId && req.usuarioRole !== 'admin') {
        return err(res, 403, 'Acesso negado', 'FORBIDDEN');
    }
    res.json({ success: true, pedido });
}));

// Criar pedido — totais recalculados no servidor (fonte da verdade)
app.post('/api/pedidos', auth, asyncHandler(async (req, res) => {
    const { items, cliente, endereco, pagamento } = req.body;
    if (!Array.isArray(items) || items.length === 0) return err(res, 400, 'Itens do pedido são obrigatórios', 'VALIDATION');
    if (!cliente?.nome || !endereco?.logradouro) return err(res, 400, 'Dados de cliente/endereço incompletos', 'VALIDATION');
    if (!['pix', 'card', 'boleto'].includes(pagamento)) return err(res, 400, 'Pagamento inválido', 'VALIDATION');

    let subtotal = 0;
    const itemsCalc = [];
    for (const it of items) {
        const id = it.produtoId || it.id || it._id;
        const qtd = Number(it.quantity ?? it.qtd ?? 1);
        if (!isValidId(id) || !Number.isInteger(qtd) || qtd <= 0) return err(res, 400, 'Item inválido', 'VALIDATION');
        const prod = await Produto.findById(id);
        if (!prod || prod.status !== 'ativo') return err(res, 400, `Produto indisponível`, 'OUT_OF_STOCK');
        if ((prod.quantidade ?? 0) < qtd) return err(res, 409, `Estoque insuficiente para ${prod.nome}`, 'OUT_OF_STOCK');
        subtotal += prod.preco * qtd;
        itemsCalc.push({ produtoId: prod._id, nome: prod.nome, preco: prod.preco, quantity: qtd });
    }
    const frete = subtotal > 100 ? 0 : 20;
    const desconto = pagamento === 'pix' ? subtotal * 0.05 : 0;
    const total = subtotal + frete - desconto;

    // Baixa atomica de estoque
    for (const it of itemsCalc) {
        const updated = await Produto.findOneAndUpdate({ _id: it.produtoId, quantidade: { $gte: it.quantity } }, { $inc: { quantidade: -it.quantity } });
        if (!updated) return err(res, 409, 'Estoque insuficiente (concorrência)', 'OUT_OF_STOCK');
    }

    const pedido = await Pedido.create({
        numero: 'PED-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        usuarioId: req.usuarioId, cliente, endereco, pagamento,
        items: itemsCalc, subtotal, frete, desconto, total, status: 'pendente'
    });
    res.status(201).json({ success: true, pedido });
}));

// Atualizar status do pedido (admin apenas)
app.put('/api/pedidos/:id/status', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const allowed = ['pendente', 'pago', 'enviado', 'entregue', 'cancelado'];
    if (!allowed.includes(req.body.status)) return err(res, 400, 'Status inválido', 'VALIDATION');
    const pedido = await Pedido.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    res.json({ success: true, pedido });
}));

// ========== ROTAS DE CLIENTES ==========
app.get('/api/clientes', auth, admin, asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query);
    const [clientes, total] = await Promise.all([
        Usuario.find({ role: 'user' }).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
        Usuario.countDocuments({ role: 'user' })
    ]);
    res.json({ success: true, clientes, page, limit, total, pages: Math.ceil(total / limit) });
}));

// ========== DASHBOARD STATS ==========
app.get('/api/dashboard/stats', auth, admin, asyncHandler(async (req, res) => {
    const totalProdutos = await Produto.countDocuments();
    const totalCategorias = await Categoria.countDocuments();
    const totalClientes = await Usuario.countDocuments({ role: 'user' });
    const totalPedidos = await Pedido.countDocuments();
    const pedidos = await Pedido.find().select('total');
    const vendasTotal = pedidos.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    res.json({ success: true, stats: { totalProdutos, totalCategorias, totalClientes, totalPedidos, vendasTotal } });
}));

app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Metricas basicas (admin): uptime, contadores, memoria, estado do banco
app.get('/metrics', auth, admin, asyncHandler(async (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        success: true,
        metrics: {
            uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
            startedAt: new Date(startedAt).toISOString(),
            requests: metrics.requests,
            errors4xx: metrics.errors4xx,
            errors5xx: metrics.errors5xx,
            byRoute: metrics.byRoute,
            memoryMB: Math.round(mem.rss / 1024 / 1024),
            mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
        }
    });
}));

// Handler central — nunca vaza stack/message interno
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    console.error('unhandled:', error.message);
    if (error.name === 'ValidationError') return err(res, 400, 'Dados inválidos', 'VALIDATION');
    if (error.code === 11000) return err(res, 400, 'Registro duplicado', 'DUPLICATE');
    if (error.name === 'CastError') return err(res, 400, 'ID inválido', 'VALIDATION');
    return err(res, 500, 'Erro interno', 'INTERNAL');
});

// ========== INICIALIZAÇÃO ==========
async function init() {
    const admin = await Usuario.findOne({ email: ADMIN_EMAIL });
    if (!admin) {
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        await Usuario.create({
            nome: 'Administrador', email: ADMIN_EMAIL, password: hash,
            telefone: '11999999999', role: 'admin'
        });
        console.log('Admin criado');
    }
}

mongoose.connect(MONGODB_URI)
    .then(async () => { console.log('MongoDB conectado'); await init(); app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`)); })
    .catch(err => console.error('MongoDB erro:', err));
