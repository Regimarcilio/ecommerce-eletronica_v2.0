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
// Segredos de integracao: SOMENTE .env (nunca via API/respostas)
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';
const EVO_API_URL = (process.env.EVO_API_URL || '').replace(/\/$/, '');
const EVO_APIKEY = process.env.EVO_APIKEY || '';
const SETTINGS_KEY = process.env.SETTINGS_KEY || '';
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:8083';

if (!process.env.JWT_SECRET || !process.env.ADMIN_PASSWORD || !process.env.MONGODB_URI) {
    console.warn('[seguranca] Usando valores de desenvolvimento (fallbacks). Defina JWT_SECRET, ADMIN_PASSWORD e MONGODB_URI no backend/.env para producao.');
}

const app = express();
app.use(helmet());
app.use(cors(CORS_ORIGIN === true ? undefined : { origin: CORS_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

// Limites por rota sensivel (E2E usa: login ~7, register ~8, refresh ~3, forgot+reset ~5 por run)
// E2E_NO_LIMIT=true afrouxa p/ 10000 (CI/teste local; NUNCA em prod). Headers sempre presentes.
const tetoE2E = (n) => (req) => process.env.E2E_NO_LIMIT === 'true' ? 10000 : n;
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: tetoE2E(20), standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: tetoE2E(20), standardHeaders: true, legacyHeaders: false });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: tetoE2E(30), standardHeaders: true, legacyHeaders: false });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: tetoE2E(10), standardHeaders: true, legacyHeaders: false });

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

// Maquina de estados do pedido (qualquer salto fora da whitelist: 422)
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const PEDIDO_FLOW = {
    pendente: ['pago', 'cancelado'],
    pago: ['enviado', 'cancelado'],
    enviado: ['entregue'],
    entregue: [],
    cancelado: []
};
const notDeleted = { deletedAt: null };
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
    nome: { type: String, required: true, trim: true, maxlength: 160 },
    sku: { type: String, required: true, trim: true, maxlength: 60 },
    descricao: { type: String, trim: true, maxlength: 2000, default: '' },
    imagemUrl: {
        type: String, trim: true, maxlength: 500, default: '',
        validate: {
            validator: (v) => !v || /^(https?:\/\/[^ "]+|\/[^ "]*)$/.test(v),
            message: 'URL de imagem invalida'
        }
    },
    preco: { type: Number, required: true, min: 0 },
    quantidade: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' },
    destaque: { type: Boolean, default: false },
    categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria' },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });

const CategoriaSchema = new mongoose.Schema({
    nome: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    icone: { type: String, trim: true, default: 'fa-microchip' },
    status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' },
    deletedAt: { type: Date, default: null }
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

// Configuracoes editaveis da loja (singleton "loja"); segredos vao cifrados
const SettingsSchema = new mongoose.Schema({
    chave: { type: String, required: true, unique: true, default: 'loja' },
    whatsappNumero: { type: String, trim: true, maxlength: 20, default: '' },
    evoInstance: { type: String, trim: true, maxlength: 80, default: '' },
    condicoesPagamento: { type: String, trim: true, maxlength: 2000, default: '' },
    mpPublicKey: { type: String, trim: true, maxlength: 200, default: '' },
    parcelasMax: { type: Number, min: 1, max: 21, default: 12 },
    descontoPix: { type: Number, min: 0, max: 100, default: 5 },
    segredos: { type: Map, of: String, default: {} }
}, { timestamps: true, minimize: false });

// AES-256-GCM com SETTINGS_KEY (hex 64). Sem chave: recusa gravar segredos.
function cifraSegredo(texto) {
    if (!SETTINGS_KEY || !/^[a-f0-9]{64}$/i.test(SETTINGS_KEY)) {
        throw Object.assign(new Error('SETTINGS_KEY ausente/invalida no .env'), { statusCode: 500, code: 'CONFIG' });
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(SETTINGS_KEY, 'hex'), iv);
    const enc = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}
function decifraSegredo(blob) {
    const [iv, tag, data] = String(blob).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(SETTINGS_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}
async function getSettings() {
    let s = await Settings.findOne({ chave: 'loja' });
    if (!s) s = await Settings.create({ chave: 'loja' });
    return s;
}
const maskSegredos = (s) => Object.fromEntries([...(s.segredos || new Map()).keys()].map((k) => [k, '***']));

// Pagamentos (MP) e notificacoes (WhatsApp)
const PagamentoSchema = new mongoose.Schema({
    pedidoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pedido', required: true, unique: true },
    provedor: { type: String, default: 'mercadopago' },
    mpPreferenceId: { type: String, default: '' },
    initPoint: { type: String, default: '' },
    modo: { type: String, enum: ['real', 'mock'], default: 'mock' },
    status: { type: String, enum: ['criado', 'aprovado', 'recusado'], default: 'criado' }
}, { timestamps: true });

const NotificacaoSchema = new mongoose.Schema({
    pedidoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pedido', required: true },
    canal: { type: String, default: 'whatsapp' },
    destino: { type: String, default: '' },
    status: { type: String, enum: ['enviada', 'falha'], required: true },
    erro: { type: String, default: '' }
}, { timestamps: true });

// Unicidade vale só p/ registros visíveis (soft-delete libera nome/sku/slug)
ProdutoSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
CategoriaSchema.index({ nome: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Produto = mongoose.model('Produto', ProdutoSchema);
const Categoria = mongoose.model('Categoria', CategoriaSchema);
const Pedido = mongoose.model('Pedido', PedidoSchema);
const RefreshToken = mongoose.model('RefreshToken', RefreshTokenSchema);
const PasswordReset = mongoose.model('PasswordReset', PasswordResetSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const Pagamento = mongoose.model('Pagamento', PagamentoSchema);
const Notificacao = mongoose.model('Notificacao', NotificacaoSchema);

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
    const visivel = { ...query, ...{ deletedAt: null } };
    const [produtos, total] = await Promise.all([
        Produto.find(visivel).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Produto.countDocuments(visivel)
    ]);
    res.json({ success: true, produtos, page, limit, total, pages: Math.ceil(total / limit) });
}));

app.get('/api/produtos/:id', asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const produto = await Produto.findOne({ _id: req.params.id, deletedAt: null });
    if (!produto) return err(res, 404, 'Produto não encontrado', 'NOT_FOUND');
    res.json({ success: true, produto });
}));

// PUT parcial: só chaves PRESENTES no body entram no $set (ausente preserva)
const pickProduto = (b) => {
    const out = {};
    for (const k of ['nome', 'sku', 'descricao', 'imagemUrl', 'preco', 'quantidade', 'status', 'destaque', 'categoria']) {
        if (b[k] !== undefined) out[k] = b[k];
    }
    if (out.categoria === '') delete out.categoria;
    if (out.preco !== undefined && (typeof out.preco !== 'number' || Number.isNaN(out.preco) || out.preco < 0)) {
        throw Object.assign(new Error('Preco invalido'), { statusCode: 400, code: 'VALIDATION' });
    }
    if (out.quantidade !== undefined && (!Number.isInteger(Number(out.quantidade)) || Number(out.quantidade) < 0)) {
        throw Object.assign(new Error('Quantidade invalida'), { statusCode: 400, code: 'VALIDATION' });
    }
    if (out.quantidade !== undefined) out.quantidade = Number(out.quantidade);
    if (out.imagemUrl && !/^(https?:\/\/[^ "]+|\/[^ "]*)$/.test(out.imagemUrl)) {
        throw Object.assign(new Error('URL de imagem invalida'), { statusCode: 400, code: 'VALIDATION' });
    }
    return out;
};

const sendPickError = (res, error) => {
    if (error.statusCode) return err(res, error.statusCode, error.message, error.code);
    throw error;
};

app.post('/api/produtos', auth, admin, asyncHandler(async (req, res) => {
    try {
        const produto = await Produto.create(pickProduto(req.body));
        res.json({ success: true, produto });
    } catch (error) { sendPickError(res, error); }
}));

app.put('/api/produtos/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    try {
        const produto = await Produto.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, pickProduto(req.body), { new: true, runValidators: true });
        if (!produto) return err(res, 404, 'Produto não encontrado', 'NOT_FOUND');
        res.json({ success: true, produto });
    } catch (error) { sendPickError(res, error); }
}));

app.delete('/api/produtos/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const produto = await Produto.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { new: true });
    if (!produto) return err(res, 404, 'Produto não encontrado', 'NOT_FOUND');
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'produto_excluido', por: req.usuarioId, id: req.params.id }));
    res.json({ success: true });
}));

// ========== ROTAS DE CATEGORIAS ==========
app.get('/api/categorias', asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    const { page, limit, skip } = parsePaging(req.query);
    const visivelCat = { ...query, ...{ deletedAt: null } };
    const [categorias, total] = await Promise.all([
        Categoria.find(visivelCat).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Categoria.countDocuments(visivelCat)
    ]);
    res.json({ success: true, categorias, page, limit, total, pages: Math.ceil(total / limit) });
}));

app.get('/api/categorias/:id', asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const categoria = await Categoria.findOne({ _id: req.params.id, deletedAt: null });
    if (!categoria) return err(res, 404, 'Categoria não encontrada', 'NOT_FOUND');
    res.json({ success: true, categoria });
}));

const pickCategoria = (b) => {
    const out = {};
    for (const k of ['nome', 'slug', 'icone', 'status']) {
        if (b[k] !== undefined) out[k] = b[k];
    }
    return out;
};

app.post('/api/categorias', auth, admin, asyncHandler(async (req, res) => {
    const categoria = await Categoria.create(pickCategoria(req.body));
    res.json({ success: true, categoria });
}));

app.put('/api/categorias/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const categoria = await Categoria.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, pickCategoria(req.body), { new: true, runValidators: true });
    if (!categoria) return err(res, 404, 'Categoria não encontrada', 'NOT_FOUND');
    res.json({ success: true, categoria });
}));

app.delete('/api/categorias/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const categoria = await Categoria.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { new: true });
    if (!categoria) return err(res, 404, 'Categoria não encontrada', 'NOT_FOUND');
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'categoria_excluida', por: req.usuarioId, id: req.params.id }));
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
        const prod = await Produto.findOne({ _id: id, deletedAt: null });
        if (!prod || prod.status !== 'ativo') return err(res, 400, `Produto indisponível`, 'OUT_OF_STOCK');
        if ((prod.quantidade ?? 0) < qtd) return err(res, 409, `Estoque insuficiente para ${prod.nome}`, 'OUT_OF_STOCK');
        subtotal += prod.preco * qtd;
        itemsCalc.push({ produtoId: prod._id, nome: prod.nome, preco: prod.preco, quantity: qtd });
    }
    const frete = subtotal > 100 ? 0 : 20;
    const cfg = await getSettings();
    const taxaPix = pagamento === 'pix' ? (Number(cfg.descontoPix ?? 5) / 100) : 0;
    const desconto = subtotal * taxaPix;
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
    // Aceite: resumo automatico no WhatsApp do cliente (nunca quebra o 201)
    let zap = { enviado: false, motivo: 'nao-tentado', para: '' };
    try {
        const dono = await Usuario.findById(req.usuarioId).select('telefone');
        const r = await enviaWhatsApp(pedido, dono?.telefone || '');
        zap = { enviado: r.ok, motivo: r.ok ? 'enviado' : (r.motivo || 'falha'), para: maskFone(r.destino || '') };
    } catch (error) { zap = { enviado: false, motivo: 'falha', para: '' }; }
    const cfgLoja = await getSettings();
    res.status(201).json({
        success: true,
        pedido,
        lojaWhatsapp: cfgLoja.whatsappNumero || '',
        whatsapp: zap
    });
}));

// Atualizar status do pedido (admin apenas)
app.put('/api/pedidos/:id/status', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const allowed = Object.keys(PEDIDO_FLOW);
    if (!allowed.includes(req.body.status)) return err(res, 400, 'Status inválido', 'VALIDATION');
    const pedido = await Pedido.findById(req.params.id);
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (!PEDIDO_FLOW[pedido.status].includes(req.body.status)) {
        return err(res, 422, `Transição inválida: ${pedido.status} → ${req.body.status}`, 'TRANSITION');
    }
    pedido.status = req.body.status;
    await pedido.save();
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'pedido_status', por: req.usuarioId, id: pedido._id, status: pedido.status }));
    res.json({ success: true, pedido });
}));

// ========== PAGAMENTOS (Mercado Pago) + WHATSAPP ==========
const mpConfigurado = () => !!MP_ACCESS_TOKEN;
const evoConfigurado = () => !!(EVO_API_URL && EVO_APIKEY);

async function mpCriarPreferencia(pedido, email) {
    if (!mpConfigurado()) {
        return { modo: 'mock', id: `mock-pref-${pedido.numero}`, init_point: `${FRONT_URL}/pedidos.html?mock=${pedido.numero}` };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
        const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
            body: JSON.stringify({
                items: pedido.items.map((i) => ({ title: String(i.nome || 'Item').slice(0, 100), quantity: Number(i.quantity) || 1, unit_price: Number(i.preco) || 0, currency_id: 'BRL' })),
                payer: { email },
                back_urls: { success: `${FRONT_URL}/pedidos.html`, pending: `${FRONT_URL}/pedidos.html`, failure: `${FRONT_URL}/checkout.html` },
                auto_return: 'approved',
                notification_url: `${process.env.API_PUBLIC_URL || `http://localhost:${PORT}`}/api/pagamentos/webhook`,
                external_reference: String(pedido._id)
            })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'MP erro');
        return { modo: 'real', id: data.id, init_point: data.init_point };
    } finally { clearTimeout(t); }
}

function verificaAssinaturaMP(req) {
    const sig = req.headers['x-signature'] || '';
    const ts = (sig.match(/ts=([^,]+)/) || [])[1];
    const v1 = (sig.match(/v1=([^,]+)/) || [])[1];
    const dataId = req.query.id || req.query['data.id'] || (req.body?.data?.id);
    const reqId = req.headers['x-request-id'] || '';
    if (!ts || !v1 || !dataId) return false;
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
    const esperado = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(esperado));
    } catch { return false; }
}

async function mpBuscarPagamento(paymentId) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            signal: ctrl.signal,
            headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
        });
        return r.json();
    } finally { clearTimeout(t); }
}

function montaMsgPedido(pedido, lojaNumero = '') {
    const linhas = (pedido.items || []).slice(0, 10).map((i) => `• ${i.quantity}x ${i.nome} — R$ ${(Number(i.preco) * Number(i.quantity)).toFixed(2)}`);
    return [
        `*TechStore* — Pedido ${pedido.numero} confirmado! ✅`,
        ...linhas,
        `Subtotal R$ ${Number(pedido.subtotal).toFixed(2)} · Frete ${Number(pedido.frete) === 0 ? 'Grátis' : 'R$ ' + Number(pedido.frete).toFixed(2)} · Desconto R$ ${Number(pedido.desconto).toFixed(2)}`,
        `*Total R$ ${Number(pedido.total).toFixed(2)}* (${pedido.pagamento})`,
        `Entrega: ${pedido.endereco?.logradouro || ''}, ${pedido.endereco?.numero || ''} — ${pedido.endereco?.cidade || ''}/${pedido.endereco?.estado || ''}`,
        lojaNumero ? `Duvidas? Fale com a loja: +${lojaNumero}` : ''
    ].filter(Boolean).join('\n').slice(0, 1000);
}

const normZap = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    return d.length <= 11 ? `55${d}` : d;
};
const maskFone = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d.length >= 4 ? `***${d.slice(-4)}` : '';
};

async function enviaWhatsApp(pedido, telefoneCadastro = '') {
    // Destino: telefone do pedido → fallback para o do cadastro
    const destino = normZap(pedido.cliente?.telefone || telefoneCadastro);
    const cfg = await getSettings().catch(() => null);
    const texto = montaMsgPedido(pedido, cfg?.whatsappNumero || '');
    if (!evoConfigurado()) {
        await Notificacao.create({ pedidoId: pedido._id, destino, status: 'falha', erro: 'Evolution nao configurado' });
        return { ok: false, motivo: 'nao-configurado', destino };
    }
    if (!cfg?.evoInstance) {
        await Notificacao.create({ pedidoId: pedido._id, destino, status: 'falha', erro: 'Instancia Evolution ausente' });
        return { ok: false, motivo: 'sem-instancia', destino };
    }
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(`${EVO_API_URL}/message/sendText/${encodeURIComponent(cfg.evoInstance)}`, {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', apikey: EVO_APIKEY },
            body: JSON.stringify({ number: destino, text: texto })
        }).finally(() => clearTimeout(t));
        if (!r.ok) throw new Error(`Evolution ${r.status}`);
        await Notificacao.create({ pedidoId: pedido._id, destino, status: 'enviada' });
        return { ok: true, destino };
    } catch (error) {
        await Notificacao.create({ pedidoId: pedido._id, destino, status: 'falha', erro: error.message.slice(0, 200) });
        return { ok: false, motivo: error.message.slice(0, 120), destino };
    }
}

// Confirma pagamento de forma idempotente; WhatsApp nunca quebra o fluxo
async function confirmaPagamento(pedidoId, aprovado, provedorId = '') {
    const pedido = await Pedido.findById(pedidoId);
    if (!pedido) return { ok: false };
    await Pagamento.findOneAndUpdate(
        { pedidoId: pedido._id },
        { $set: { status: aprovado ? 'aprovado' : 'recusado', ...(provedorId ? { mpPreferenceId: provedorId } : {}) } },
        { upsert: true }
    );
    if (!aprovado || pedido.status !== 'pendente') return { ok: true, jaProcessado: pedido.status !== 'pendente' };
    pedido.status = 'pago';
    await pedido.save();
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'pagamento_aprovado', pedido: pedido.numero }));
    try { await enviaWhatsApp(pedido); } catch (error) { console.error('whatsapp:', error.message); }
    return { ok: true };
}

// Cria intencao de pagamento (dono do pedido; apenas se pendente)
app.post('/api/pagamentos/intent', auth, asyncHandler(async (req, res) => {
    const { pedidoId } = req.body || {};
    if (!isValidId(pedidoId)) return err(res, 400, 'Pedido inválido', 'VALIDATION');
    const pedido = await Pedido.findById(pedidoId);
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (pedido.usuarioId.toString() !== req.usuarioId && req.usuarioRole !== 'admin') {
        return err(res, 403, 'Acesso negado', 'FORBIDDEN');
    }
    if (pedido.status !== 'pendente') return err(res, 409, 'Pedido já processado', 'STATE');
    const user = await Usuario.findById(req.usuarioId).select('email');
    const pref = await mpCriarPreferencia(pedido, user?.email || '');
    await Pagamento.findOneAndUpdate(
        { pedidoId: pedido._id },
        { $set: { mpPreferenceId: pref.id, initPoint: pref.init_point, modo: pref.modo, status: 'criado' } },
        { upsert: true }
    );
    const s = await getSettings();
    res.json({ success: true, initPoint: pref.init_point, modo: pref.modo, mpPublicKey: s.mpPublicKey || '' });
}));

// Webhook MP (publico; valida assinatura; modo teste sem segredo aceita corpo direto)
app.post('/api/pagamentos/webhook', asyncHandler(async (req, res) => {
    if (!MP_WEBHOOK_SECRET) {
        const { pedidoId, status } = req.body || {};
        console.warn('[pagamento] webhook em modo teste (sem MP_WEBHOOK_SECRET)');
        if (!isValidId(pedidoId)) return err(res, 400, 'Pedido inválido', 'VALIDATION');
        await confirmaPagamento(pedidoId, status === 'aprovado', 'mock');
        return res.json({ success: true, modo: 'mock' });
    }
    if (!verificaAssinaturaMP(req)) return err(res, 401, 'Assinatura inválida', 'AUTH');
    const paymentId = req.query.id || req.query['data.id'] || req.body?.data?.id;
    try {
        const pg = await mpBuscarPagamento(paymentId);
        const pedidoId = pg.external_reference;
        await confirmaPagamento(pedidoId, pg.status === 'approved', String(pg.id || ''));
    } catch (error) { console.error('webhook mp:', error.message); }
    return res.json({ success: true });
}));

// ========== ROTAS DE CLIENTES ==========

// Auditoria de notificacoes WhatsApp (admin)
app.get('/api/notificacoes', auth, admin, asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query);
    const query = {};
    if (req.query.pedidoId) {
        if (!isValidId(req.query.pedidoId)) return err(res, 400, 'Pedido inválido', 'VALIDATION');
        query.pedidoId = req.query.pedidoId;
    }
    const [notificacoes, total] = await Promise.all([
        Notificacao.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Notificacao.countDocuments(query)
    ]);
    res.json({ success: true, notificacoes, page, limit, total, pages: Math.ceil(total / limit) });
}));
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
    const totalProdutos = await Produto.countDocuments({ deletedAt: null });
    const totalCategorias = await Categoria.countDocuments({ deletedAt: null });
    const totalClientes = await Usuario.countDocuments({ role: 'user' });
    const totalPedidos = await Pedido.countDocuments();
    const pedidos = await Pedido.find().select('total');
    const vendasTotal = pedidos.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    res.json({ success: true, stats: { totalProdutos, totalCategorias, totalClientes, totalPedidos, vendasTotal } });
}));

app.get('/health', (req, res) => res.json({ status: 'OK' }));

// ========== CONFIGURACOES DA LOJA ==========
// Publico: apenas campos exibidos no checkout (sem segredos)
app.get('/api/config/loja/public', asyncHandler(async (req, res) => {
    const s = await getSettings();
    res.json({
        success: true,
        config: {
            condicoesPagamento: s.condicoesPagamento || '',
            parcelasMax: s.parcelasMax ?? 12,
            descontoPix: s.descontoPix ?? 5,
            mpPublicKey: s.mpPublicKey || '',
            whatsappNumero: s.whatsappNumero || ''
        }
    });
}));

// Admin: leitura com segredos mascarados
app.get('/api/config/loja', auth, admin, asyncHandler(async (req, res) => {
    const s = await getSettings();
    res.json({
        success: true,
        config: {
            whatsappNumero: s.whatsappNumero || '',
            evoInstance: s.evoInstance || '',
            condicoesPagamento: s.condicoesPagamento || '',
            mpPublicKey: s.mpPublicKey || '',
            parcelasMax: s.parcelasMax ?? 12,
            descontoPix: s.descontoPix ?? 5,
            segredos: maskSegredos(s)
        }
    });
}));

// Admin: atualiza somente campos enviados; segredos vao cifrados
app.put('/api/config/loja', auth, admin, asyncHandler(async (req, res) => {
    const s = await getSettings();
    const b = req.body || {};
    if (b.whatsappNumero !== undefined) {
        const raw = String(b.whatsappNumero ?? '').trim();
        const n = raw.replace(/\D/g, '').slice(0, 15);
        if (raw !== '' && !/^\+?[\d\s()\-]{10,22}$/.test(raw)) return err(res, 400, 'WhatsApp invalido (use digitos, ex. 5511999999999)', 'VALIDATION');
        if (n && !/^\d{10,15}$/.test(n)) return err(res, 400, 'WhatsApp invalido (10-15 digitos)', 'VALIDATION');
        s.whatsappNumero = n;
    }
    if (b.evoInstance !== undefined) s.evoInstance = String(b.evoInstance).trim().slice(0, 80);
    if (b.condicoesPagamento !== undefined) s.condicoesPagamento = String(b.condicoesPagamento).slice(0, 2000);
    if (b.mpPublicKey !== undefined) s.mpPublicKey = String(b.mpPublicKey).trim().slice(0, 200);
    if (b.parcelasMax !== undefined) {
        const v = Number(b.parcelasMax);
        if (!Number.isInteger(v) || v < 1 || v > 21) return err(res, 400, 'Parcelas entre 1 e 21', 'VALIDATION');
        s.parcelasMax = v;
    }
    if (b.descontoPix !== undefined) {
        const v = Number(b.descontoPix);
        if (Number.isNaN(v) || v < 0 || v > 100) return err(res, 400, 'Desconto entre 0 e 100', 'VALIDATION');
        s.descontoPix = v;
    }
    if (b.segredos !== undefined && typeof b.segredos === 'object') {
        try {
            for (const [k, v] of Object.entries(b.segredos)) {
                if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) return err(res, 400, 'Nome de segredo invalido', 'VALIDATION');
                if (v === '***') continue;
                if (v === '') { s.segredos.delete(k); continue; }
                s.segredos.set(k, cifraSegredo(v));
            }
        } catch (error) { return err(res, error.statusCode || 500, error.message, error.code || 'INTERNAL'); }
    }
    await s.save();
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'config_atualizada', por: req.usuarioId }));
    res.json({ success: true });
}));

// Admin: status do pareamento WhatsApp (proxy Evolution, sem vazar apikey)
app.get('/api/config/whatsapp/status', auth, admin, asyncHandler(async (req, res) => {
    if (!EVO_API_URL || !EVO_APIKEY) return res.json({ success: true, status: { configurado: false } });
    const s = await getSettings();
    if (!s.evoInstance) return res.json({ success: true, status: { configurado: false } });
    try {
        const r = await fetch(`${EVO_API_URL}/instance/connectionState/${encodeURIComponent(s.evoInstance)}`, {
            headers: { apikey: EVO_APIKEY }
        });
        const data = await r.json().catch(() => ({}));
        res.json({ success: true, status: { configurado: true, estado: data?.instance?.state || data?.state || 'desconhecido' } });
    } catch {
        return err(res, 502, 'Evolution inacessivel', 'UPSTREAM');
    }
}));

// Metricas basicas (admin): uptime, contadores, memoria, estado do banco
app.get('/api/metrics', auth, admin, asyncHandler(async (req, res) => {
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
    // Migracao: unicidade passa a valer só p/ visíveis (derruba índices legados)
    try {
        await Produto.syncIndexes();
        await Categoria.syncIndexes();
    } catch (error) { console.error('indices:', error.message); }
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
