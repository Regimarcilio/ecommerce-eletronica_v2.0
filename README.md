# TechStore - E-commerce de Componentes Eletrônicos

## 🚀 Como executar

```bash
# 1. Clone o repositório
git clone [URL_DO_SEU_REPOSITORIO]
cd ecommerce-eletronica_v2.0

# 2. Subir os containers
docker-compose up -d --build

# 3. Criar admin
docker exec ecommerce_backend node -e "
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
mongoose.connect('mongodb://admin:***REMOVED***@mongodb:27017/ecommerce?authSource=admin').then(async () => {
    const hash = await bcrypt.hash('***REMOVED***', 10);
    await mongoose.connection.db.collection('usuarios').updateOne(
        { email: 'admin@techstore.com.br' },
        { \$set: { nome: 'Admin', email: 'admin@techstore.com.br', password: hash, role: 'admin' } },
        { upsert: true }
    );
    console.log('Admin criado!');
    process.exit();
});"

# 4. Acessar
# Loja: http://localhost:8080
# Login: http://localhost:8080/auth.html
# Admin: admin@techstore.com.br / ***REMOVED***
