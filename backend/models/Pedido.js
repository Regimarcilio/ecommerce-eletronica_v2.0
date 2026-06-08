const mongoose = require('mongoose');

const PedidoSchema = new mongoose.Schema({
    numero: { type: String, required: true, unique: true },
    cliente: {
        nome: { type: String, required: true },
        email: { type: String, required: true },
        telefone: { type: String, required: true },
        cpf: { type: String }
    },
    endereco: {
        logradouro: { type: String, required: true },
        numero: { type: String, required: true },
        complemento: { type: String },
        bairro: { type: String, required: true },
        cidade: { type: String, required: true },
        estado: { type: String, required: true },
        cep: { type: String, required: true }
    },
    pagamento: { type: String, enum: ['pix', 'card', 'boleto'], required: true },
    items: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true }
    }],
    subtotal: { type: Number, required: true },
    frete: { type: Number, required: true, default: 0 },
    desconto: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pendente', 'pago', 'enviado', 'entregue', 'cancelado'],
        default: 'pendente'
    },
    dataPedido: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Pedido', PedidoSchema);
