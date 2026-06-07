#!/bin/bash

echo "🛑 Parando containers Docker..."
sudo docker stop ecommerce_backend ecommerce_frontend 2>/dev/null

echo "🛑 Matando processos Node..."
pkill node 2>/dev/null
killall node 2>/dev/null

echo "⏳ Aguardando porta liberar..."
sleep 2

echo "✅ Porta 5000 liberada!"

echo "🚀 Iniciando backend..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

echo "🎨 Iniciando frontend..."
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
echo "⚠️  Pressione Ctrl+C para parar"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
