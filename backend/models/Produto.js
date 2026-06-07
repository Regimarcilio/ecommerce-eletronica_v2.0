const mongoose = require('mongoose');
const productSchema = new mongoose.Schema({
    nome: String, sku: String, preco: Number, quantidade: Number, status: String
}, { timestamps: true });
module.exports = mongoose.model('Produto', productSchema);
