#!/bin/bash

echo "🚀 Iniciando TechStore em modo desenvolvimento..."

# Iniciar MongoDB (se estiver no Docker)
echo "📦 Iniciando MongoDB..."
docker start mongodb-dev 2>/dev/null || \
docker run -d --name mongodb-dev -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=***REMOVED*** \
  mongo:4.4

# Aguardar MongoDB
sleep 3

# Iniciar backend em background
echo "⚙️ Iniciando Backend..."
cd backend
npm install
node server.js &
BACKEND_PID=$!
cd ..

# Aguardar backend
sleep 3

# Iniciar frontend
echo "🎨 Iniciando Frontend..."
cd frontend
python3 -m http.server 3000 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ SISTEMA INICIADO!"
echo "📍 Frontend: http://localhost:3000"
echo "📍 Login: http://localhost:3000/auth.html"
echo "📍 Dashboard: http://localhost:3000/dashboard.html"
echo "📍 API: http://localhost:5000"
echo ""
echo "🔑 Admin: admin@techstore.com.br / ***REMOVED***"
echo ""
echo "⚠️  Para parar: Ctrl+C"

# Aguardar e matar processos ao sair
trap "kill $BACKEND_PID $FRONTEND_PID; docker stop mongodb-dev; exit" INT
wait
