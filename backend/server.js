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
// Mercado Pago OAuth (docs/Create and refresh token.md): client_id/secret p/ authorization_code
const MP_CLIENT_ID = process.env.MP_CLIENT_ID || '';
const MP_CLIENT_SECRET = process.env.MP_CLIENT_SECRET || '';
const MP_REDIRECT_URI = process.env.MP_REDIRECT_URI || '';
// PagSeguro (PagBank): token via .env ou segredos cifrados do painel admin
const PGS_TOKEN_ENV = process.env.PGS_TOKEN || '';
const PGS_EMAIL_ENV = process.env.PGS_EMAIL || '';
const PGS_WEBHOOK_TOKEN = process.env.PGS_WEBHOOK_TOKEN || '';
const PGS_SANDBOX = String(process.env.PGS_SANDBOX || '').toLowerCase() === 'true';
const pgsApiBase = (sandbox) => sandbox ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com';
const PGS_API = pgsApiBase(PGS_SANDBOX);
async function pgsApi() {
    if (process.env.PGS_SANDBOX !== undefined && process.env.PGS_SANDBOX !== '') return PGS_API;
    try {
        const s = await Settings.findOne({ chave: 'loja' }).select('pgsSandbox').lean();
        if (s && typeof s.pgsSandbox === 'boolean') return pgsApiBase(s.pgsSandbox);
    } catch { /* fallback env */ }
    return PGS_API;
}
const EVO_API_URL = (process.env.EVO_API_URL || '').replace(/\/$/, '');
const EVO_APIKEY = process.env.EVO_APIKEY || '';
const SETTINGS_KEY = process.env.SETTINGS_KEY || '';
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:8083';

if (!process.env.JWT_SECRET || !process.env.ADMIN_PASSWORD || !process.env.MONGODB_URI) {
    console.warn('[seguranca] Usando valores de desenvolvimento (fallbacks). Defina JWT_SECRET, ADMIN_PASSWORD e MONGODB_URI no backend/.env para producao.');
}

const app = express();
app.disable('etag'); // sem 304: APIs sempre respondem 200 fresco (dados por usuário)
app.use(helmet());
app.use(cors(CORS_ORIGIN === true ? undefined : { origin: CORS_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

// APIs nunca cacheadas: evita 304/stale em /auth/me, /auth/enderecos, /config (dados por usuário)
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

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
const err = (res, status, message, code) => res.status(status).json({ success: false, message, code });
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parsePaging = (q) => {
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 50));
    return { page, limit, skip: (page - 1) * limit };
};

// Frete por tabela (Settings) com fallback na regra legada; fonte unica p/ cotacao e pedido
function cotarFrete(uf, subtotal, peso, faixas) {    const candidatas = (faixas || []).filter((f) =>
        (!f.uf || f.uf === uf) && Number(peso) <= Number(f.atePeso ?? Infinity));
    if (!candidatas.length) {
        const valor = subtotal > 100 ? 0 : 20;
        return { nome: 'Padrão', valor, prazoDias: 5 };
    }
    let melhor = null;
    for (const f of candidatas) {
        const gratis = Number(f.gratisAcima) > 0 && subtotal >= Number(f.gratisAcima);
        const valor = gratis ? 0 : Number(f.valor);
        if (!melhor || valor < melhor.valor) melhor = { nome: `Padrão ${f.uf || 'BR'}`, valor, prazoDias: Number(f.prazoDias) || 5 };
    }
    return melhor;
}

function pesoDosItens(itemsCalc) {
    return (itemsCalc || []).reduce((s, it) => s + (Number(it.peso) || 0) * (Number(it.quantity) || 0), 0);
}

// Schemas com validacao basica server-side
const EnderecoSchema = new mongoose.Schema({
    rotulo: { type: String, trim: true, maxlength: 40, default: '' },
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
    status: { type: String, enum: ['ativo', 'inativo', 'bloqueado'], default: 'ativo' },
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
    peso: { type: Number, min: 0, default: 0.1 },
    quantidade: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' },
    destaque: { type: Boolean, default: false },
    categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria' },
    // Placas de TV: tipo da placa + compatibilidade + dimensoes (Correios)
    tipoPlaca: { type: String, enum: ['PRINCIPAL', 'FONTE', 'TCOM'], uppercase: true, trim: true, default: undefined },
    marca: { type: String, trim: true, maxlength: 60, default: '' },
    modeloTV: { type: String, trim: true, maxlength: 120, default: '' },
    dimensoes: {
        c: { type: Number, min: 0, default: 40 },
        l: { type: Number, min: 0, default: 30 },
        a: { type: Number, min: 0, default: 5 }
    },
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
    provedorPagamento: { type: String, enum: ['mercadopago', 'pagseguro'], default: 'mercadopago' },
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
    // Credenciais preenchidas pelo dashboard (fallback quando ausentes no .env)
    mpClientId: { type: String, trim: true, maxlength: 60, default: '' },
    mpRedirectUri: { type: String, trim: true, maxlength: 300, default: '' },
    pgsEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
    pgsSandbox: { type: Boolean, default: undefined },
    parcelasMax: { type: Number, min: 1, max: 21, default: 12 },
    descontoPix: { type: Number, min: 0, max: 100, default: 5 },
    faixasFrete: [{
        uf: { type: String, trim: true, uppercase: true, maxlength: 2, default: '' },
        atePeso: { type: Number, min: 0, default: 30 },
        valor: { type: Number, min: 0, required: true },
        gratisAcima: { type: Number, min: 0, default: 0 },
        prazoDias: { type: Number, min: 1, max: 60, default: 5 }
    }],
    redesSociais: {
        instagram: { type: String, trim: true, maxlength: 300, default: '' },
        facebook: { type: String, trim: true, maxlength: 300, default: '' },
        youtube: { type: String, trim: true, maxlength: 300, default: '' },
        tiktok: { type: String, trim: true, maxlength: 300, default: '' }
    },
    emailLoja: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
    horarioAtendimento: { type: String, trim: true, maxlength: 120, default: '' },
    // Configurações de envio de email
    emailService: { type: String, enum: ['smtp', 'google', 'outlook'], default: 'smtp' },
    googleClientId: { type: String, trim: true, maxlength: 100, default: '' },
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

// Pagamentos (MP + PagSeguro) e notificacoes (WhatsApp)
const PagamentoSchema = new mongoose.Schema({
    pedidoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pedido', required: true, unique: true },
    provedor: { type: String, enum: ['mercadopago', 'pagseguro'], default: 'mercadopago' },
    mpPreferenceId: { type: String, default: '' },
    pgsOrderId: { type: String, default: '' },
    pgsQrText: { type: String, default: '' },
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

// Mensagens do formulario de contato (página contato.html)
const ContatoSchema = new mongoose.Schema({
    nome: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    assunto: { type: String, trim: true, maxlength: 160, default: '' },
    mensagem: { type: String, required: true, trim: true, maxlength: 5000 },
    lida: { type: Boolean, default: false },
    status: { type: String, enum: ['nova', 'lida', 'respondida'], default: 'nova' }
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
const Contato = mongoose.model('Contato', ContatoSchema);

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
    rotulo: String(b.rotulo || '').trim().slice(0, 40),
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
    if (req.query.tipoPlaca) {
        const t = String(req.query.tipoPlaca).toUpperCase();
        if (!['PRINCIPAL', 'FONTE', 'TCOM'].includes(t)) return err(res, 400, 'Tipo de placa inválido', 'VALIDATION');
        query.tipoPlaca = t;
    }
    if (req.query.marca) query.marca = new RegExp(String(req.query.marca).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (req.query.modelo) query.modeloTV = new RegExp(String(req.query.modelo).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (req.query.q) {
        const rx = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [{ nome: rx }, { sku: rx }, { modeloTV: rx }];
    }
    const { page, limit, skip } = parsePaging(req.query);
    const visivel = { ...query, ...{ deletedAt: null } };
    const cfg = await getSettings();
    const [lista, total] = await Promise.all([
        Produto.find(visivel).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Produto.countDocuments(visivel)
    ]);
    const produtos = lista.map((p) => enriquecerPreco(p, cfg));
    res.json({ success: true, produtos, page, limit, total, pages: Math.ceil(total / limit) });
}));

// Precos exibidos (fonte unica: Settings); nunca confia no cliente
function enriquecerPreco(p, cfg) {
    const taxa = Number(cfg?.descontoPix ?? 5) / 100;
    const parc = Math.max(1, Number(cfg?.parcelasMax ?? 12));
    const base = p.toObject ? p.toObject() : { ...p };
    return {
        ...base,
        precoPix: +(Number(base.preco) * (1 - taxa)).toFixed(2),
        parcela: { n: parc, valor: +(Number(base.preco) / parc).toFixed(2) }
    };
}

app.get('/api/produtos/:id', asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const produto = await Produto.findOne({ _id: req.params.id, deletedAt: null });
    if (!produto) return err(res, 404, 'Produto não encontrado', 'NOT_FOUND');
    res.json({ success: true, produto: enriquecerPreco(produto, await getSettings()) });
}));

// PUT parcial: só chaves PRESENTES no body entram no $set (ausente preserva)
const pickProduto = (b) => {
    const out = {};
    for (const k of ['nome', 'sku', 'descricao', 'imagemUrl', 'preco', 'peso', 'quantidade', 'status', 'destaque', 'categoria', 'tipoPlaca', 'marca', 'modeloTV']) {
        if (b[k] !== undefined) out[k] = b[k];
    }
    if (out.categoria === '') delete out.categoria;
    if (out.tipoPlaca !== undefined) {
        if (out.tipoPlaca === '' || out.tipoPlaca === null) delete out.tipoPlaca;
        else {
            out.tipoPlaca = String(out.tipoPlaca).toUpperCase();
            if (!['PRINCIPAL', 'FONTE', 'TCOM'].includes(out.tipoPlaca)) {
                throw Object.assign(new Error('Tipo de placa invalido (PRINCIPAL/FONTE/TCOM)'), { statusCode: 400, code: 'VALIDATION' });
            }
        }
    }
    for (const k of ['marca', 'modeloTV']) {
        if (out[k] !== undefined) {
            out[k] = String(out[k]).trim().slice(0, k === 'marca' ? 60 : 120);
            if (!out[k]) delete out[k];
        }
    }
    if (b.dimensoes !== undefined && b.dimensoes !== null && typeof b.dimensoes === 'object') {
        const dim = {};
        for (const k of ['c', 'l', 'a']) {
            if (b.dimensoes[k] !== undefined) {
                const v = Number(b.dimensoes[k]);
                if (Number.isNaN(v) || v < 0) throw Object.assign(new Error('Dimensao invalida'), { statusCode: 400, code: 'VALIDATION' });
                dim[k] = v;
            }
        }
        if (Object.keys(dim).length) out.dimensoes = dim;
    }
    if (out.peso !== undefined && (typeof out.peso !== 'number' || Number.isNaN(out.peso) || out.peso < 0)) {
        throw Object.assign(new Error('Peso invalido'), { statusCode: 400, code: 'VALIDATION' });
    }
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
        itemsCalc.push({ produtoId: prod._id, nome: prod.nome, preco: prod.preco, quantity: qtd, peso: Number(prod.peso) || 0 });
    }
    const freteCfg = await getSettings();
    const cot = cotarFrete(
        String(endereco?.estado || '').toUpperCase(),
        subtotal,
        pesoDosItens(itemsCalc),
        freteCfg.faixasFrete
    );
    const frete = cot.valor;
    const taxaPix = pagamento === 'pix' ? (Number(freteCfg.descontoPix ?? 5) / 100) : 0;
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

// Cliente: cancela o proprio pedido pendente (admin usa PUT /status)
app.put('/api/pedidos/:id/cancelar', auth, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const pedido = await Pedido.findById(req.params.id);
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (pedido.usuarioId.toString() !== req.usuarioId) return err(res, 403, 'Acesso negado', 'FORBIDDEN');
    if (pedido.status !== 'pendente') return err(res, 409, 'Só é possível cancelar pedido pendente', 'STATE');
    pedido.status = 'cancelado';
    await pedido.save();
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'pedido_cancelado_cliente', por: req.usuarioId, id: pedido._id }));
    res.json({ success: true, pedido });
}));

// Cliente: exclui do historico o proprio pedido cancelado
app.delete('/api/pedidos/:id', auth, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const pedido = await Pedido.findById(req.params.id);
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (pedido.usuarioId.toString() !== req.usuarioId) return err(res, 403, 'Acesso negado', 'FORBIDDEN');
    if (pedido.status !== 'cancelado') return err(res, 409, 'Só é possível excluir pedido cancelado', 'STATE');
    await Pagamento.deleteOne({ pedidoId: pedido._id });
    await Pedido.deleteOne({ _id: pedido._id });
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'pedido_excluido_cliente', por: req.usuarioId, id: req.params.id }));
    res.json({ success: true });
}));

// ========== PAGAMENTOS (Mercado Pago) + WHATSAPP ==========
// Referência oficial da API: https://www.mercadopago.com.br/developers/pt/reference
// (preferences, payments e webhooks usados abaixo seguem essa referência)
async function mpSettings() {
    try {
        return await Settings.findOne({ chave: 'loja' }).select('mpClientId mpRedirectUri pgsEmail emailService googleClientId emailLoja segredos').lean();
    } catch { return null; }
}
const getSegredo = (s, k) => {
    const blob = s?.segredos?.get ? s.segredos.get(k) : s?.segredos?.[k];
    if (!blob || blob === '***') return '';
    try { return decifraSegredo(blob); } catch { return ''; }
};
// Credenciais: .env primeiro, painel depois (usuário preenche e conecta sem SSH)
async function mpClientId() { if (MP_CLIENT_ID) return MP_CLIENT_ID; return (await mpSettings())?.mpClientId || ''; }
async function mpClientSecret() { if (MP_CLIENT_SECRET) return MP_CLIENT_SECRET; return getSegredo(await mpSettings(), 'mp_client_secret'); }
async function mpRedirectFinal() {
    if (MP_REDIRECT_URI) return MP_REDIRECT_URI;
    return (await mpSettings())?.mpRedirectUri || `${FRONT_URL}/dashboard.html`;
}
async function pgsEmailFinal() { return (await mpSettings())?.pgsEmail || process.env.PGS_EMAIL_ENV || ''; }
async function mpAccessToken() {
    if (MP_ACCESS_TOKEN) return MP_ACCESS_TOKEN;
    try {
        const s = await Settings.findOne({ chave: 'loja' }).select('segredos').lean();
        const blob = s?.segredos?.get ? s.segredos.get('mp_access_token') : s?.segredos?.['mp_access_token'];
        if (blob && blob !== '***') {
            try { return decifraSegredo(blob); } catch { return ''; }
        }
    } catch { /* sem token: mock */ }
    return '';
}
async function mpAtivoReal() {
    if (MP_ACCESS_TOKEN) return true;
    return !!(await mpAccessToken());
}
const evoConfigurado = () => !!(EVO_API_URL && EVO_APIKEY);

async function mpCriarPreferencia(pedido, email) {
    const token = await mpAccessToken();
    if (!token) {
        return { modo: 'mock', id: `mock-pref-${pedido.numero}`, init_point: `${FRONT_URL}/pedidos.html?mock=${pedido.numero}` };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
        // MP exige URL publica https p/ notification_url; local: omite (polling cobre)
        const pubUrl = String(process.env.API_PUBLIC_URL || '');
        const notificacao = /^https:\/\//.test(pubUrl) ? { notification_url: `${pubUrl.replace(/\/$/, '')}/api/pagamentos/webhook` } : {};
        // auto_return=approved exige back_urls https; com localhost o MP rejeita (invalid_auto_return)
        const autoReturn = /^https:\/\//.test(FRONT_URL) ? { auto_return: 'approved' } : {};
        const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                items: pedido.items.map((i) => ({ title: String(i.nome || 'Item').slice(0, 100), quantity: Number(i.quantity) || 1, unit_price: Number(i.preco) || 0, currency_id: 'BRL' })),
                payer: { email },
                back_urls: { success: `${FRONT_URL}/pedidos.html`, pending: `${FRONT_URL}/pedidos.html`, failure: `${FRONT_URL}/checkout.html` },
                ...autoReturn,
                ...notificacao,
                external_reference: String(pedido._id)
            })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            const detalhe = data.message || data.error_description || data.error || `HTTP ${r.status}`;
            // 401/403: token inválido, expirado ou sem permissão (ex.: "At least one policy returned UNAUTHORIZED")
            if (r.status === 401 || r.status === 403) {
                throw Object.assign(new Error(`Mercado Pago recusou (${detalhe}). Verifique o token: se expirou, reconecte a conta no dashboard (Configurações → Mercado Pago). Se o e-mail do comprador é o mesmo da conta vendedora, finalize com outra conta — não é permitido comprar de si mesmo.`), { statusCode: 422, code: 'MP_UNAUTHORIZED' });
            }
            if (r.status >= 400 && r.status < 500) {
                throw Object.assign(new Error(`Mercado Pago ${r.status}: ${detalhe}`), { statusCode: 422, code: 'MP_PAYMENT' });
            }
            throw Object.assign(new Error(`Mercado Pago ${r.status}: ${detalhe}`), { statusCode: 502, code: 'UPSTREAM' });
        }
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
    const token = await mpAccessToken();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            signal: ctrl.signal,
            headers: { Authorization: `Bearer ${token}` }
        });
        return r.json();
    } finally { clearTimeout(t); }
}

// ---- Mercado Pago OAuth (docs/Create and refresh token.md) ----
// Troca code/refresh por access_token e guarda cifrado nos segredos (nunca expõe)
async function mpTrocarToken(corpo) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
        const r = await fetch('https://api.mercadopago.com/oauth/token', {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            throw Object.assign(new Error(`Mercado Pago ${r.status}: ${data.error_description || data.error || data.message || 'falha OAuth'}`), { statusCode: 502, code: 'UPSTREAM' });
        }
        return data;
    } finally { clearTimeout(t); }
}

// ---- Checkout hospedado PagSeguro (cartão + boleto + PIX, sem PCI na loja) ----
// Ref: https://developer.pagbank.com.br/reference/checkouts
async function pgsCriarCheckout(pedido, email) {
    const token = await pgsTokenAtivo();
    if (!token) {
        return { modo: 'mock', checkoutId: `mock-check-${pedido.numero}`, payLink: `${FRONT_URL}/pedidos.html?mock=${pedido.numero}` };
    }
    const pubUrl = String(process.env.API_PUBLIC_URL || '');
    const notifUrls = /^https:\/\//.test(pubUrl) ? [`${pubUrl.replace(/\/$/, '')}/api/pagamentos/pagseguro/webhook`] : undefined;
    // redirect_url exige URL valida (localhost e rejeitado); sem https publico, omite
    const redir = /^https:\/\//.test(FRONT_URL) ? `${FRONT_URL.replace(/\/$/, '')}/pedidos.html` : undefined;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const corpo = {
            reference_id: String(pedido._id).slice(0, 64),
            expiration_date: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
            customer_modifiable: true,
            customer: {
                name: String(pedido.cliente?.nome || 'Cliente').slice(0, 100),
                email: String(email || pedido.cliente?.email || '').slice(0, 100)
            },
            items: pedido.items.map((i) => ({
                reference_id: String(i.produtoId || i.nome || '').slice(0, 64),
                name: String(i.nome || 'Item').slice(0, 100),
                quantity: Number(i.quantity) || 1,
                unit_amount: Math.round((Number(i.preco) || 0) * 100)
            })),
            payment_methods: [{ type: 'CREDIT_CARD' }, { type: 'BOLETO' }, { type: 'PIX' }],
            soft_descriptor: 'PLACACERTA',
            ...(redir ? { redirect_url: redir } : {})
        };
        if (notifUrls) corpo.notification_urls = notifUrls;
        const r = await fetch(`${await pgsApi()}/checkouts`, {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(corpo)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            const detalhe = data.error_messages?.[0]?.description || data.message || `HTTP ${r.status}`;
            if (/buyer email/i.test(detalhe)) {
                throw Object.assign(new Error('E-mail do comprador não pode ser igual ao da loja: finalize com outra conta de teste'), { statusCode: 422, code: 'PGS_BUYER' });
            }
            throw Object.assign(new Error(`PagSeguro ${r.status}: ${detalhe}`), { statusCode: 502, code: 'UPSTREAM' });
        }
        return {
            modo: 'real',
            checkoutId: data.id,
            payLink: (data.links || []).find((l) => l.rel === 'PAY')?.href || ''
        };
    } finally { clearTimeout(t); }
}
// ---- PagSeguro (PagBank Orders API: PIX direto) ----
// Ref: https://developer.pagbank.com.br/reference/orders
async function pgsTokenAtivo() {
    if (PGS_TOKEN_ENV) return PGS_TOKEN_ENV;
    try {
        const s = await Settings.findOne({ chave: 'loja' }).select('segredos').lean();
        const blob = s?.segredos?.get
            ? s.segredos.get('pagseguro_token')
            : s?.segredos?.['pagseguro_token'];
        if (blob && blob !== '***') {
            try { return decifraSegredo(blob); } catch { return ''; }
        }
    } catch { /* sem segredo: mock */ }
    return '';
}
async function pgsCriarCobranca(pedido, email) {
    const token = await pgsTokenAtivo();
    if (!token) {
        return { modo: 'mock', orderId: `mock-pgs-${pedido.numero}`, qrText: '', init_point: `${FRONT_URL}/pedidos.html?mock=${pedido.numero}` };
    }
    // Orders API oficial (PagBank): https://developer.pagbank.com.br/reference/orders
    // Cobra o total em centavos via PIX QR; CPF/telefone aumentam a aprovação
    const soDigitos = (v) => String(v || '').replace(/\D/g, '');
    const cpf = soDigitos(pedido.cliente?.cpf);
    if (!/^\d{11}$/.test(cpf) && !/^\d{14}$/.test(cpf)) {
        throw Object.assign(new Error('Informe o CPF/CNPJ para pagar com PagSeguro'), { statusCode: 400, code: 'VALIDATION' });
    }
    const fone = soDigitos(pedido.cliente?.telefone);
    const customer = {
        name: String(pedido.cliente?.nome || 'Cliente').slice(0, 100),
        email: String(email || pedido.cliente?.email || '').slice(0, 100),
        tax_id: cpf
    };
    if (fone.length >= 10) {
        customer.phones = [{
            country: '55',
            area: fone.length === 11 || fone.length === 10 ? fone.slice(0, 2) : fone.slice(0, 2),
            number: fone.slice(2),
            type: 'MOBILE'
        }];
    }
    // PagSeguro exige URL publica https p/ webhook; local/mock: omite (polling cobre)
    const pubUrl = String(process.env.API_PUBLIC_URL || '');
    const notifUrls = /^https:\/\//.test(pubUrl) ? [`${pubUrl.replace(/\/$/, '')}/api/pagamentos/pagseguro/webhook`] : undefined;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const corpo = {
            reference_id: String(pedido._id).slice(0, 64),
            customer,
            items: pedido.items.map((i) => ({
                reference_id: String(i.produtoId || i.nome || '').slice(0, 64),
                name: String(i.nome || 'Item').slice(0, 100),
                quantity: Number(i.quantity) || 1,
                unit_amount: Math.round((Number(i.preco) || 0) * 100)
            })),
            qr_codes: [{ amount: { value: Math.round(Number(pedido.total) * 100) }, expiration_date: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }]
        };
        if (notifUrls) corpo.notification_urls = notifUrls;
        const r = await fetch(`${await pgsApi()}/orders`, {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(corpo)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            const detalhe = data.error_messages?.[0]?.description || data.message || `HTTP ${r.status}`;
            // Conta de teste: comprador não pode ser o próprio lojista
            if (/buyer email/i.test(detalhe)) {
                throw Object.assign(new Error('E-mail do comprador não pode ser igual ao da loja: finalize com outra conta de teste'), { statusCode: 422, code: 'PGS_BUYER' });
            }
            throw Object.assign(new Error(`PagSeguro ${r.status}: ${detalhe}`), { statusCode: 502, code: 'UPSTREAM' });
        }
        const qr = (data.qr_codes || [])[0] || {};
        return {
            modo: 'real',
            orderId: data.id,
            qrText: qr.text || '',
            qrExpiracao: qr.expiration_date || '',
            init_point: (data.links || []).find((l) => l.rel === 'PAY')?.href || ''
        };
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
    let lastErr = null;
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 30000);
            const r = await fetch(`${EVO_API_URL}/message/sendText/${encodeURIComponent(cfg.evoInstance)}`, {
                method: 'POST',
                signal: ctrl.signal,
                headers: { 'Content-Type': 'application/json', apikey: EVO_APIKEY },
                body: JSON.stringify({ number: destino, text: texto })
            }).finally(() => clearTimeout(t));
            if (!r.ok) throw new Error(`Evolution ${r.status}`);
            await Notificacao.create({ pedidoId: pedido._id, destino, status: 'enviada' });
            return { ok: true, destino };
        } catch (error) { lastErr = error; }
    }
    await Notificacao.create({ pedidoId: pedido._id, destino, status: 'falha', erro: String(lastErr?.message || 'timeout').slice(0, 200) });
    return { ok: false, motivo: String(lastErr?.message || 'timeout').slice(0, 120), destino };
}

// Template HTML do e-mail de venda (detalhes do pedido)
function linhasItensPedido(pedido) {
    return (pedido.items || []).map((i) => {
        const nome = i.nome || i.titulo || 'Produto';
        const qty = i.quantidade ?? i.quantity ?? 1;
        const preco = Number(i.precoUnitario ?? i.preco ?? i.price ?? 0);
        const sub = Number(i.subtotal ?? (Number(qty) * preco));
        return `<tr><td style="padding:8px;border:1px solid #ddd;">${nome}</td><td style="padding:8px;border:1px solid #ddd;text-align:center;">${qty}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">R$ ${preco.toFixed(2)}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">R$ ${sub.toFixed(2)}</td></tr>`;
    }).join('');
}
function totaisPedido(pedido) {
    const subtotalItens = Number((pedido.items || []).reduce((acc, i) => acc + Number(i.subtotal ?? (Number(i.quantidade ?? i.quantity ?? 0) * Number(i.precoUnitario ?? i.preco ?? i.price ?? 0))), 0));
    const frete = Number(pedido.frete || 0);
    const desconto = Number(pedido.desconto || 0);
    const total = Number(pedido.total ?? (subtotalItens + frete - desconto));
    return { subtotalItens, frete, desconto, total };
}
const estiloEmailVenda = `body{font-family:Arial,sans-serif;color:#333;background:#f8f9fa;margin:0;padding:20px}
.container{max-width:600px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px}
h2{color:#2c3e50;border-bottom:2px solid #eee;padding-bottom:10px}
.table{width:100%;border-collapse:collapse;margin:20px 0}
.table th,.table td{padding:8px;border:1px solid #ddd;text-align:left}
.table th{background:#f2f2f2}
.total{font-size:1.2em;font-weight:bold;color:#2c3e50}
footer{margin-top:30px;font-size:0.8em;color:#777;text-align:center}`;
function blocoTotaisPedido(t) {
    return `<div style="margin:20px 0;">
<p><strong>Subtotal:</strong> R$ ${t.subtotalItens.toFixed(2)}</p>
<p><strong>Frete:</strong> R$ ${t.frete.toFixed(2)}</p>
<p><strong>Desconto:</strong> R$ ${t.desconto.toFixed(2)}</p>
<p class="total"><strong>TOTAL: R$ ${t.total.toFixed(2)}</strong></p></div>`;
}
// E-mail da LOJA: notificação de VENDA com os dados da venda
function templateEmailVenda(pedido) {
    const itens = linhasItensPedido(pedido);
    const t = totaisPedido(pedido);
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${estiloEmailVenda}
</style></head><body><div class="container">
<h2>💰 Nova venda recebida - ${pedido.numero}</h2>
<p><strong>Cliente:</strong> ${pedido.cliente ? (pedido.cliente.nome || pedido.cliente.email || 'Não informado') : 'Não informado'}</p>
<p><strong>E-mail:</strong> ${pedido.cliente?.email || 'Não informado'}</p>
<p><strong>Telefone:</strong> ${pedido.cliente?.telefone || 'Não informado'}</p>
<p><strong>Data:</strong> ${new Date(pedido.createdAt).toLocaleString('pt-BR')}</p>
<table class="table"><thead><tr><th>Produto</th><th>Qtd</th><th style="text-align:right">Preço</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${itens}</tbody></table>
${blocoTotaisPedido(t)}
<p><strong>Forma de pagamento:</strong> ${pedido.pagamento} (${pedido.provedorPagamento})</p>
<p><strong>Status:</strong> ${pedido.status}</p>
<footer>Notificação automática de venda da sua loja online.</footer></div></body></html>`;
}
// E-mail do CLIENTE: confirmação de COMPRA do site
function templateEmailCompra(pedido) {
    const nome = pedido.cliente?.nome || 'cliente';
    const itens = linhasItensPedido(pedido);
    const t = totaisPedido(pedido);
    const e = pedido.endereco || {};
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${estiloEmailVenda}
</style></head><body><div class="container">
<h2>✅ Pedido confirmado - ${pedido.numero}</h2>
<p>Olá, <strong>${nome}</strong>! Recebemos seu pedido e o pagamento foi aprovado. Acompanhe em <strong>Meus pedidos</strong>.</p>
<table class="table"><thead><tr><th>Produto</th><th>Qtd</th><th style="text-align:right">Preço</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${itens}</tbody></table>
${blocoTotaisPedido(t)}
<p><strong>Pagamento:</strong> ${pedido.pagamento} (${pedido.provedorPagamento})</p>
<p><strong>Entrega:</strong> ${e.logradouro || '-'}, ${e.numero || '-'} - ${e.bairro || '-'}, ${e.cidade || '-'}/${e.estado || '-'} · CEP ${e.cep || '-'}</p>
<p><strong>Data:</strong> ${new Date(pedido.createdAt).toLocaleString('pt-BR')}</p>
<footer>Este é um e-mail automático da sua loja online. Responda a esta mensagem se tiver dúvidas.</footer></div></body></html>`;
}

// Envia e-mail de notificação de venda (SMTP ou Gmail API); nunca quebra o fluxo
async function enviaEmailVenda(pedido) {
    try {
        const s = await getSettings().catch(() => null);
        const service = s?.emailService || 'smtp';
        // Loja SEMPRE recebe a venda; cliente recebe a confirmação de compra
        const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
        const lojaEmail = emailOk(process.env.EMAIL_FROM || s?.emailLoja) ? (process.env.EMAIL_FROM || s.emailLoja) : '';
        const clienteEmail = emailOk(pedido.cliente?.email) ? pedido.cliente.email : '';
        if (!lojaEmail && !clienteEmail) { console.warn('[email] sem destinatarios (cliente e loja sem e-mail)'); return; }
        const enviar = (to, subject, html) => {
            if (service === 'google') return enviaEmailGmail(s, { to, subject, html });
            if (service === 'outlook') console.warn('[email] servico Outlook ainda nao implementado (usando SMTP)');
            return enviaEmailSmtp(s, { to, subject, html });
        };
        // Cliente: confirmação de compra do site (além do recibo do provedor)
        if (clienteEmail && clienteEmail !== lojaEmail) {
            try { await enviar(clienteEmail, `Seu pedido #${pedido.numero} foi confirmado`, templateEmailCompra(pedido)); }
            catch (error) { console.error('email compra:', error.message); }
        }
        // Loja: notificação de venda com os dados da venda
        if (lojaEmail) {
            try { await enviar(lojaEmail, `Nova venda #${pedido.numero} - R$ ${totaisPedido(pedido).total.toFixed(2)}`, templateEmailVenda(pedido)); }
            catch (error) { console.error('email venda:', error.message); }
        } else {
            console.warn('[email] e-mail da loja nao configurado (venda nao notificada)');
        }
    } catch (error) {
        console.error('enviaEmailVenda erro:', error.message);
        throw error;
    }
}

async function enviaEmailSmtp(s, { to, subject, html }) {
    const smtpHost = process.env.SMTP_HOST || 'smtp.example.com';
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || getSegredo(s, 'smtp_pass');
    const from = process.env.EMAIL_FROM || s?.emailLoja || '';
    if (!smtpUser || !smtpPass) { console.warn('[email] SMTP sem credenciais configuradas (desativado)'); return; }
    if (!from) { console.warn('[email] e-mail da loja nao configurado (desativado)'); return; }
    let nodemailer;
    try { nodemailer = require('nodemailer'); } catch { console.warn('[email] nodemailer nao disponivel'); return; }
    const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass }
    });
    const info = await transporter.sendMail({ from, to, subject, html });
    console.log('[email] enviado via SMTP:', info.messageId);
}

// Envia via Gmail REST API (users.messages.send) com OAuth2 + refresh token.
// Referência: https://developers.google.com/workspace/gmail/api/reference/rest
async function enviaEmailGmail(s, { to, subject, html }) {
    const clientId = process.env.GOOGLE_CLIENT_ID || s?.googleClientId || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || getSegredo(s, 'google_client_secret');
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || getSegredo(s, 'google_refresh_token');
    const fromEmail = process.env.EMAIL_FROM || s?.emailLoja || '';
    if (!clientId || !clientSecret || !refreshToken) {
        console.warn('[email] Gmail nao configurado (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN ou painel)');
        return;
    }
    if (!fromEmail) { console.warn('[email] e-mail da loja nao configurado (desativado)'); return; }
    let google;
    try { ({ google } = require('googleapis')); } catch { console.warn('[email] googleapis nao disponivel'); return; }
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');
    oauth2.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    const raw = Buffer.from(
        `From: ${fromEmail}\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}`
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    try {
        const r = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
        console.log('[email] enviado via Gmail API:', r.data?.id);
    } catch (error) {
        const msg = String(error?.message || error);
        if (/invalid_grant/i.test(msg)) {
            console.warn('[email] Gmail refresh_token invalido/expirado — gere outro (docs/EMAIL.md) e salve de novo');
            return;
        }
        throw error;
    }
}

// Confirma pagamento de forma idempotente; WhatsApp + Email nunca quebra o fluxo
async function confirmaPagamento(pedidoId, aprovado, provedorId = '', provedor = 'mercadopago') {
    const pedido = await Pedido.findById(pedidoId);
    if (!pedido) return { ok: false };
    const pgto = await Pagamento.findOneAndUpdate(
        { pedidoId: pedido._id },
        { $set: { status: aprovado ? 'aprovado' : 'recusado', provedor, ...(provedorId ? (provedor === 'pagseguro' ? { pgsOrderId: provedorId } : { mpPreferenceId: provedorId }) : {}) } },
        { upsert: true, new: true }
    );
    if (!aprovado || pedido.status !== 'pendente') return { ok: true, jaProcessado: pedido.status !== 'pendente' };
    pedido.status = 'pago';
    await pedido.save();
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'pagamento_aprovado', pedido: pedido.numero }));
    try { await enviaWhatsApp(pedido); } catch (error) { console.error('whatsapp:', error.message); }
    // E-mail só p/ venda real (modo mock = teste/webhook de teste: sem notificação)
    if (pgto?.modo === 'real') {
        try { await enviaEmailVenda(pedido); } catch (error) { console.error('email:', error.message); }
    } else {
        console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'email_ignorado_mock', pedido: pedido.numero }));
    }
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
    let pref;
    try {
        pref = await mpCriarPreferencia(pedido, user?.email || '');
    } catch (error) {
        if (error.statusCode) return err(res, error.statusCode, error.message, error.code);
        throw error;
    }
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

// Admin: URL de autorização OAuth do Mercado Pago (conecta a conta do lojista)
app.get('/api/pagamentos/mercadopago/oauth/url', auth, admin, asyncHandler(async (req, res) => {
    const cid = await mpClientId();
    if (!cid) return err(res, 400, 'MP_CLIENT_ID não configurado (preencha no dashboard ou no .env)', 'CONFIG');
    const redir = await mpRedirectFinal();
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://auth.mercadopago.com.br/authorization?client_id=${encodeURIComponent(cid)}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(redir)}&state=${state}`;
    res.json({ success: true, url, redirectUri: redir });
}));

// Admin: conclui OAuth (authorization_code) ou renova (refresh_token); guarda cifrado
app.post('/api/pagamentos/mercadopago/oauth/token', auth, admin, asyncHandler(async (req, res) => {
    const b = req.body || {};
    const grant = String(b.grant_type || 'authorization_code');
    if (!['authorization_code', 'refresh_token'].includes(grant)) {
        return err(res, 400, 'grant_type inválido (authorization_code/refresh_token). client_credentials gera token só p/ recursos próprios e não cria preferências de checkout', 'VALIDATION');
    }
    const corpo = { client_id: await mpClientId(), client_secret: await mpClientSecret(), grant_type: grant };
    if (!corpo.client_id || !corpo.client_secret) return err(res, 400, 'MP_CLIENT_ID/MP_CLIENT_SECRET não configurados (dashboard ou .env)', 'CONFIG');
    if (grant === 'authorization_code') {
        if (!b.code) return err(res, 400, 'code obrigatório (válido por 10 min)', 'VALIDATION');
        corpo.code = b.code;
        corpo.redirect_uri = await mpRedirectFinal();
    }
    if (grant === 'refresh_token') {
        if (!b.refresh_token) return err(res, 400, 'refresh_token obrigatório', 'VALIDATION');
        corpo.refresh_token = b.refresh_token;
    }
    let data;
    try {
        data = await mpTrocarToken(corpo);
    } catch (error) {
        if (error.statusCode) return err(res, error.statusCode, error.message, error.code);
        throw error;
    }
    if (!data.access_token) return err(res, 502, 'Resposta OAuth sem access_token', 'UPSTREAM');
    const s = await getSettings();
    try {
        s.segredos.set('mp_access_token', cifraSegredo(data.access_token));
        if (data.refresh_token) s.segredos.set('mp_refresh_token', cifraSegredo(data.refresh_token));
        if (data.public_key) s.mpPublicKey = String(data.public_key).slice(0, 200);
        if (data.user_id) s.segredos.set('mp_user_id', cifraSegredo(String(data.user_id)));
        if (data.expires_in) s.segredos.set('mp_token_expira_em', cifraSegredo(String(Date.now() + Number(data.expires_in) * 1000)));
        await s.save();
    } catch (error) { return err(res, error.statusCode || 500, error.message, error.code || 'INTERNAL'); }
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'mp_oauth_conectado', por: req.usuarioId, user_id: data.user_id || '' }));
    res.json({ success: true, user_id: data.user_id || null, live_mode: data.live_mode ?? null, expires_in: data.expires_in || null });
}));

// Admin: status da conexão OAuth (sem expor segredos)
app.get('/api/pagamentos/mercadopago/oauth/status', auth, admin, asyncHandler(async (req, res) => {
    const s = await getSettings();
    const keys = [...(s.segredos || new Map()).keys()];
    let expiraEm = null;
    try {
        const blob = s.segredos?.get ? s.segredos.get('mp_token_expira_em') : s.segredos?.['mp_token_expira_em'];
        if (blob && blob !== '***') expiraEm = Number(decifraSegredo(blob)) || null;
    } catch { /* ignora */ }
    res.json({
        success: true,
        oauth: {
            viaEnv: !!MP_ACCESS_TOKEN,
            conectado: !!MP_ACCESS_TOKEN || keys.includes('mp_access_token'),
            temRefresh: keys.includes('mp_refresh_token'),
            userIdConfigurado: keys.includes('mp_user_id'),
            clientConfigurado: !!(MP_CLIENT_ID || s.mpClientId),
            clientSecretConfigurado: !!(MP_CLIENT_SECRET || keys.includes('mp_client_secret')),
            expiraEm
        }
    });
}));

// Admin: Google OAuth p/ Gmail (conecta a conta e guarda o refresh cifrado)
async function googleRedirectFinal() {
    if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
    return `${FRONT_URL}/dashboard.html`;
}
async function googleClientIdFinal() {
    if (process.env.GOOGLE_CLIENT_ID) return process.env.GOOGLE_CLIENT_ID;
    try { return (await Settings.findOne({ chave: 'loja' }).select('googleClientId').lean())?.googleClientId || ''; }
    catch { return ''; }
}
app.get('/api/config/google/oauth/url', auth, admin, asyncHandler(async (req, res) => {
    const cid = await googleClientIdFinal();
    if (!cid) return err(res, 400, 'GOOGLE_CLIENT_ID não configurado (backend/.env ou painel)', 'CONFIG');
    const redir = await googleRedirectFinal();
    const state = crypto.randomBytes(16).toString('hex');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: cid, redirect_uri: redir, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.send',
        access_type: 'offline', prompt: 'consent', state
    }).toString();
    res.json({ success: true, url, redirectUri: redir });
}));
app.post('/api/config/google/oauth/token', auth, admin, asyncHandler(async (req, res) => {
    const code = String(req.body?.code || '');
    if (!code) return err(res, 400, 'code obrigatório', 'VALIDATION');
    const s = await getSettings();
    const cid = await googleClientIdFinal();
    const csec = process.env.GOOGLE_CLIENT_SECRET || getSegredo(s, 'google_client_secret');
    if (!cid || !csec) return err(res, 400, 'GOOGLE_CLIENT_ID/SECRET não configurados (backend/.env ou painel)', 'CONFIG');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    let data;
    try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST', signal: ctrl.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code, client_id: cid, client_secret: csec,
                redirect_uri: await googleRedirectFinal(), grant_type: 'authorization_code'
            }).toString()
        });
        data = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(`Google ${r.status}: ${data.error_description || data.error || 'falha OAuth'}`), { statusCode: 502, code: 'UPSTREAM' });
    } catch (error) {
        clearTimeout(t);
        if (error.statusCode) return err(res, error.statusCode, error.message, error.code);
        throw error;
    }
    if (!data.refresh_token) return err(res, 502, 'Google não devolveu refresh_token (revogue o acesso e conecte de novo)', 'UPSTREAM');
    try {
        s.segredos.set('google_refresh_token', cifraSegredo(data.refresh_token));
        await s.save();
    } catch (error) { return err(res, error.statusCode || 500, error.message, error.code || 'INTERNAL'); }
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'google_oauth_conectado', por: req.usuarioId }));
    res.json({ success: true });
}));
app.get('/api/config/google/oauth/status', auth, admin, asyncHandler(async (req, res) => {
    const s = await getSettings();
    const keys = [...(s.segredos || new Map()).keys()];
    res.json({
        success: true,
        oauth: {
            conectado: keys.includes('google_refresh_token') || !!process.env.GOOGLE_REFRESH_TOKEN,
            viaEnv: !!process.env.GOOGLE_REFRESH_TOKEN,
            clientConfigurado: !!(await googleClientIdFinal()),
            redirectUri: await googleRedirectFinal()
        }
    });
}));

// Auditoria de pagamentos (admin): lista intents com pedido, provedor, modo e status
app.get('/api/pagamentos', auth, admin, asyncHandler(async (req, res) => {
    const query = {};
    if (['mercadopago', 'pagseguro'].includes(req.query.provedor)) query.provedor = req.query.provedor;
    if (['criado', 'aprovado', 'recusado'].includes(req.query.status)) query.status = req.query.status;
    if (['real', 'mock'].includes(req.query.modo)) query.modo = req.query.modo;
    const { page, limit, skip } = parsePaging(req.query);
    const [pagamentos, total] = await Promise.all([
        Pagamento.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Pagamento.countDocuments(query)
    ]);
    const ids = pagamentos.map((p) => p.pedidoId);
    const pedidos = await Pedido.find({ _id: { $in: ids } }).select('numero total status pagamento provedorPagamento createdAt').lean();
    const porId = Object.fromEntries(pedidos.map((p) => [String(p._id), p]));
    res.json({
        success: true,
        pagamentos: pagamentos.map((p) => ({
            _id: p._id, pedidoId: p.pedidoId,
            pedido: porId[String(p.pedidoId)] || null,
            provedor: p.provedor, modo: p.modo, status: p.status,
            referencia: p.provedor === 'pagseguro' ? (p.pgsOrderId || '') : (p.mpPreferenceId || ''),
            temQr: !!p.pgsQrText,
            createdAt: p.createdAt, updatedAt: p.updatedAt
        })),
        page, limit, total, pages: Math.ceil(total / limit)
    });
}));

// Status do pagamento de um pedido (dono ou admin; polling da tela de pagamento)
app.get('/api/pagamentos/:pedidoId', auth, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.pedidoId)) return err(res, 400, 'Pedido inválido', 'VALIDATION');
    const pedido = await Pedido.findById(req.params.pedidoId).select('usuarioId status total numero');
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (pedido.usuarioId.toString() !== req.usuarioId && req.usuarioRole !== 'admin') {
        return err(res, 403, 'Acesso negado', 'FORBIDDEN');
    }
    const pg = await Pagamento.findOne({ pedidoId: pedido._id }).lean();
    res.json({ success: true, pedido: { status: pedido.status, total: pedido.total, numero: pedido.numero }, pagamento: pg || null });
}));

// Cria cobranca PagSeguro (dono do pedido; apenas se pendente)
app.post('/api/pagamentos/pagseguro/intent', auth, asyncHandler(async (req, res) => {
    const { pedidoId } = req.body || {};
    if (!isValidId(pedidoId)) return err(res, 400, 'Pedido inválido', 'VALIDATION');
    const pedido = await Pedido.findById(pedidoId);
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (pedido.usuarioId.toString() !== req.usuarioId && req.usuarioRole !== 'admin') {
        return err(res, 403, 'Acesso negado', 'FORBIDDEN');
    }
    if (pedido.status !== 'pendente') return err(res, 409, 'Pedido já processado', 'STATE');
    const user = await Usuario.findById(req.usuarioId).select('email');
    let cob;
    try {
        cob = await pgsCriarCobranca(pedido, user?.email || '');
    } catch (error) {
        if (error.statusCode) return err(res, error.statusCode, error.message, error.code || 'VALIDATION');
        throw error;
    }
    await Pagamento.findOneAndUpdate(
        { pedidoId: pedido._id },
        { $set: { provedor: 'pagseguro', pgsOrderId: cob.orderId || '', pgsQrText: cob.qrText || '', initPoint: cob.init_point || '', modo: cob.modo, status: 'criado' } },
        { upsert: true }
    );
    pedido.provedorPagamento = 'pagseguro';
    await pedido.save();
    res.json({ success: true, orderId: cob.orderId, qrText: cob.qrText, qrExpiracao: cob.qrExpiracao || '', initPoint: cob.init_point, modo: cob.modo });
}));

// Checkout hospedado PagSeguro (cartão + boleto + PIX; dono do pedido; apenas se pendente)
app.post('/api/pagamentos/pagseguro/checkout', auth, asyncHandler(async (req, res) => {
    const { pedidoId } = req.body || {};
    if (!isValidId(pedidoId)) return err(res, 400, 'Pedido inválido', 'VALIDATION');
    const pedido = await Pedido.findById(pedidoId);
    if (!pedido) return err(res, 404, 'Pedido não encontrado', 'NOT_FOUND');
    if (pedido.usuarioId.toString() !== req.usuarioId && req.usuarioRole !== 'admin') {
        return err(res, 403, 'Acesso negado', 'FORBIDDEN');
    }
    if (pedido.status !== 'pendente') return err(res, 409, 'Pedido já processado', 'STATE');
    const user = await Usuario.findById(req.usuarioId).select('email');
    let co;
    try {
        co = await pgsCriarCheckout(pedido, user?.email || '');
    } catch (error) {
        if (error.statusCode) return err(res, error.statusCode, error.message, error.code || 'VALIDATION');
        throw error;
    }
    await Pagamento.findOneAndUpdate(
        { pedidoId: pedido._id },
        { $set: { provedor: 'pagseguro', pgsOrderId: co.checkoutId || '', initPoint: co.payLink || '', modo: co.modo, status: 'criado' } },
        { upsert: true }
    );
    pedido.provedorPagamento = 'pagseguro';
    await pedido.save();
    res.json({ success: true, checkoutId: co.checkoutId, payLink: co.payLink, modo: co.modo });
}));

// Webhook PagSeguro (publico; valida token; modo teste sem segredo aceita corpo direto)
// Ref notification: Authorization Bearer ou ?token=
app.post('/api/pagamentos/pagseguro/webhook', asyncHandler(async (req, res) => {
    if (!PGS_WEBHOOK_TOKEN) {
        const { pedidoId, status } = req.body || {};
        console.warn('[pagamento] webhook pagseguro em modo teste (sem PGS_WEBHOOK_TOKEN)');
        if (!isValidId(pedidoId)) return err(res, 400, 'Pedido inválido', 'VALIDATION');
        await confirmaPagamento(pedidoId, status === 'aprovado' || status === 'paid', 'mock', 'pagseguro');
        return res.json({ success: true, modo: 'mock' });
    }
    const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.query.token || '');
    if (got !== PGS_WEBHOOK_TOKEN) return err(res, 401, 'Assinatura inválida', 'AUTH');
    try {
        const ref = req.body?.reference_id || req.body?.referenceId;
        const st = String(req.body?.status || '').toUpperCase();
        await confirmaPagamento(ref, ['PAID', 'APPROVED', 'AUTHORIZED'].includes(st), String(req.body?.id || ''), 'pagseguro');
    } catch (error) { console.error('webhook pgs:', error.message); }
    return res.json({ success: true });
}));

// Cotacao de frete (publica): mesma regra do pedido
app.post('/api/frete/cotacao', asyncHandler(async (req, res) => {
    const { uf, items } = req.body || {};
    const UF = String(uf || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(UF)) return err(res, 400, 'UF inválida', 'VALIDATION');
    if (!Array.isArray(items) || !items.length) return err(res, 400, 'Itens obrigatórios', 'VALIDATION');
    let subtotal = 0;
    const calc = [];
    for (const it of items) {
        const id = it.produtoId || it.id;
        const qtd = Number(it.quantity ?? 1);
        if (!isValidId(id) || !Number.isInteger(qtd) || qtd <= 0) return err(res, 400, 'Item inválido', 'VALIDATION');
        const prod = await Produto.findOne({ _id: id, deletedAt: null }).select('preco peso status');
        if (!prod || prod.status !== 'ativo') return err(res, 400, 'Produto indisponível', 'OUT_OF_STOCK');
        subtotal += prod.preco * qtd;
        calc.push({ peso: Number(prod.peso) || 0, quantity: qtd });
    }
    const cfg = await getSettings();
    const cot = cotarFrete(UF, subtotal, pesoDosItens(calc), cfg.faixasFrete);
    res.json({ success: true, subtotal, peso: pesoDosItens(calc), ...cot });
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

// Admin: muda status do cliente (ativo/inativo/bloqueado); bloqueado não loga nem usa token
app.put('/api/clientes/:id/status', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const st = String(req.body?.status || '');
    if (!['ativo', 'inativo', 'bloqueado'].includes(st)) return err(res, 400, 'Status inválido (ativo/inativo/bloqueado)', 'VALIDATION');
    const cli = await Usuario.findOne({ _id: req.params.id, role: 'user' });
    if (!cli) return err(res, 404, 'Cliente não encontrado', 'NOT_FOUND');
    cli.status = st;
    await cli.save();
    if (st !== 'ativo') await RefreshToken.updateMany({ usuarioId: cli._id, revoked: false }, { $set: { revoked: true } });
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'cliente_status', por: req.usuarioId, id: cli._id, status: st }));
    res.json({ success: true });
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
    const pgsAtivo = !!(PGS_TOKEN_ENV || [...(s.segredos || new Map()).keys()].includes('pagseguro_token'));
    res.json({
        success: true,
        config: {
            condicoesPagamento: s.condicoesPagamento || '',
            parcelasMax: s.parcelasMax ?? 12,
            descontoPix: s.descontoPix ?? 5,
            mpPublicKey: s.mpPublicKey || '',
            mpAtivo: await mpAtivoReal(),
            pagseguroAtivo: pgsAtivo,
            whatsappNumero: s.whatsappNumero || '',
            emailLoja: s.emailLoja || '',
            horarioAtendimento: s.horarioAtendimento || '',
            redesSociais: {
                instagram: s.redesSociais?.instagram || '',
                facebook: s.redesSociais?.facebook || '',
                youtube: s.redesSociais?.youtube || '',
                tiktok: s.redesSociais?.tiktok || ''
            }
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
            emailLoja: s.emailLoja || '',
            emailService: s.emailService || 'smtp',
            googleClientId: s.googleClientId || '',
            horarioAtendimento: s.horarioAtendimento || '',
            condicoesPagamento: s.condicoesPagamento || '',
            mpPublicKey: s.mpPublicKey || '',
            mpClientId: s.mpClientId || '',
            mpRedirectUri: s.mpRedirectUri || '',
            pgsEmail: s.pgsEmail || '',
            pgsSandbox: typeof s.pgsSandbox === 'boolean' ? s.pgsSandbox : null,
            parcelasMax: s.parcelasMax ?? 12,
            descontoPix: s.descontoPix ?? 5,
            faixasFrete: s.faixasFrete || [],
            redesSociais: {
                instagram: s.redesSociais?.instagram || '',
                facebook: s.redesSociais?.facebook || '',
                youtube: s.redesSociais?.youtube || '',
                tiktok: s.redesSociais?.tiktok || ''
            },
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
    if (b.emailLoja !== undefined) {
        const v = String(b.emailLoja ?? '').trim().toLowerCase().slice(0, 160);
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return err(res, 400, 'E-mail da loja inválido', 'VALIDATION');
        s.emailLoja = v;
    }
    if (b.horarioAtendimento !== undefined) s.horarioAtendimento = String(b.horarioAtendimento ?? '').trim().slice(0, 120);
    if (b.emailService !== undefined) {
        if (!['smtp', 'google', 'outlook'].includes(b.emailService)) return err(res, 400, 'emailService inválido (smtp/google/outlook)', 'VALIDATION');
        s.emailService = b.emailService;
    }
    if (b.googleClientId !== undefined) s.googleClientId = String(b.googleClientId ?? '').trim().slice(0, 100);
    if (b.condicoesPagamento !== undefined) s.condicoesPagamento = String(b.condicoesPagamento).slice(0, 2000);
    if (b.mpPublicKey !== undefined) s.mpPublicKey = String(b.mpPublicKey).trim().slice(0, 200);
    if (b.mpClientId !== undefined) s.mpClientId = String(b.mpClientId ?? '').trim().slice(0, 60);
    if (b.mpRedirectUri !== undefined) s.mpRedirectUri = String(b.mpRedirectUri ?? '').trim().slice(0, 300);
    if (b.pgsEmail !== undefined) {
        const v = String(b.pgsEmail ?? '').trim().toLowerCase().slice(0, 160);
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return err(res, 400, 'E-mail PagSeguro inválido', 'VALIDATION');
        s.pgsEmail = v;
    }
    if (b.pgsSandbox !== undefined) {
        if (typeof b.pgsSandbox !== 'boolean') return err(res, 400, 'pgsSandbox deve ser true/false', 'VALIDATION');
        s.pgsSandbox = b.pgsSandbox;
    }
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
    if (b.faixasFrete !== undefined) {
        if (!Array.isArray(b.faixasFrete) || b.faixasFrete.length > 50) return err(res, 400, 'Faixas inválidas (máx 50)', 'VALIDATION');
        for (const f of b.faixasFrete) {
            const uf = String(f.uf || '').toUpperCase();
            if (uf && !/^[A-Z]{2}$/.test(uf)) return err(res, 400, 'UF da faixa inválida', 'VALIDATION');
            if (!(Number(f.atePeso) >= 0) || !(Number(f.valor) >= 0) || !(Number(f.gratisAcima ?? 0) >= 0)) {
                return err(res, 400, 'Valores da faixa inválidos', 'VALIDATION');
            }
        }
        s.faixasFrete = b.faixasFrete.map((f) => ({
            uf: String(f.uf || '').toUpperCase(),
            atePeso: Number(f.atePeso), valor: Number(f.valor),
            gratisAcima: Number(f.gratisAcima ?? 0), prazoDias: Math.min(60, Math.max(1, Number(f.prazoDias ?? 5)))
        }));
    }
    if (b.redesSociais !== undefined && typeof b.redesSociais === 'object') {
        for (const k of ['instagram', 'facebook', 'youtube', 'tiktok']) {
            if (b.redesSociais[k] !== undefined) {
                const v = String(b.redesSociais[k] ?? '').trim().slice(0, 300);
                if (v && !/^(https?:\/\/[^\s"']+|[a-zA-Z0-9_.-]+(\/[^\s"']*)?)$/.test(v)) {
                    return err(res, 400, `Rede social inválida (${k})`, 'VALIDATION');
                }
                s.redesSociais[k] = v;
            }
        }
    }
    if (b.segredos !== undefined && typeof b.segredos === 'object') {        try {
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

// ========== CONTATO (formulario publico) ==========
const contatoLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: tetoE2E(20), standardHeaders: true, legacyHeaders: false });
app.post('/api/contato', contatoLimiter, asyncHandler(async (req, res) => {
    const b = req.body || {};
    const nome = String(b.nome ?? '').trim().slice(0, 120);
    const email = String(b.email ?? '').trim().toLowerCase().slice(0, 160);
    const assunto = String(b.assunto ?? '').trim().slice(0, 160);
    const mensagem = String(b.mensagem ?? '').trim().slice(0, 5000);
    if (!nome) return err(res, 400, 'Informe seu nome', 'VALIDATION');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(res, 400, 'E-mail inválido', 'VALIDATION');
    if (!mensagem || mensagem.length < 10) return err(res, 400, 'Mensagem muito curta (mín. 10 caracteres)', 'VALIDATION');
    const c = await Contato.create({ nome, email, assunto, mensagem });
    res.json({ success: true, protocolo: String(c._id) });
}));

// Admin: lista mensagens de contato
app.get('/api/contato', auth, admin, asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query);
    const query = {};
    if (req.query.lida === 'true') query.lida = true;
    if (req.query.lida === 'false') query.lida = false;
    if (['nova', 'lida', 'respondida'].includes(req.query.status)) query.status = req.query.status;
    const [lista, total] = await Promise.all([
        Contato.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Contato.countDocuments(query)
    ]);
    res.json({ success: true, mensagens: lista, page, limit, total, pages: Math.ceil(total / limit) });
}));

// Admin: marca mensagem como lida (atalho; sincroniza status)
app.put('/api/contato/:id/lida', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const c = await Contato.findByIdAndUpdate(req.params.id, { lida: true, status: 'lida' }, { new: true });
    if (!c) return err(res, 404, 'Mensagem não encontrada', 'NOT_FOUND');
    res.json({ success: true });
}));

// Admin: muda status da mensagem (nova → lida → respondida)
app.put('/api/contato/:id/status', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const st = String(req.body?.status || '');
    if (!['nova', 'lida', 'respondida'].includes(st)) return err(res, 400, 'Status inválido (nova/lida/respondida)', 'VALIDATION');
    const c = await Contato.findByIdAndUpdate(req.params.id, { status: st, lida: st !== 'nova' }, { new: true });
    if (!c) return err(res, 404, 'Mensagem não encontrada', 'NOT_FOUND');
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'mensagem_status', por: req.usuarioId, id: req.params.id, status: st }));
    res.json({ success: true, mensagem: c });
}));

// Admin: exclui mensagem (CRUD completo)
app.delete('/api/contato/:id', auth, admin, asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) return err(res, 400, 'ID inválido', 'VALIDATION');
    const c = await Contato.findByIdAndDelete(req.params.id);
    if (!c) return err(res, 404, 'Mensagem não encontrada', 'NOT_FOUND');
    console.log(JSON.stringify({ ts: new Date().toISOString(), evento: 'mensagem_excluida', por: req.usuarioId, id: req.params.id }));
    res.json({ success: true });
}));

// Admin: QR/pairing frescos para parear (proxy; sem expor apikey)
app.get('/api/config/whatsapp/qr', auth, admin, asyncHandler(async (req, res) => {
    if (!EVO_API_URL || !EVO_APIKEY) return err(res, 502, 'Evolution nao configurado', 'UPSTREAM');
    const s = await getSettings();
    if (!s.evoInstance) return err(res, 400, 'Instancia nao definida', 'VALIDATION');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
        const r = await fetch(`${EVO_API_URL}/instance/connect/${encodeURIComponent(s.evoInstance)}`, {
            signal: ctrl.signal,
            headers: { apikey: EVO_APIKEY }
        }).finally(() => clearTimeout(t));
        const data = await r.json();
        res.json({ success: true, pairingCode: data.pairingCode || null, qr: data.base64 || null });
    } catch {
        return err(res, 502, 'Evolution inacessivel', 'UPSTREAM');
    }
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
