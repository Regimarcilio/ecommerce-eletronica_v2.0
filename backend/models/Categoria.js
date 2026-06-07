const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema({
    nome: String, icone: String, status: String, slug: String
}, { timestamps: true });
module.exports = mongoose.model('Categoria', categorySchema);
