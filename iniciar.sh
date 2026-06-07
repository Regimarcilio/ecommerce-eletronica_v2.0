#!/bin/bash

echo "🛑 Parando serviços antigos..."
pkill node 2>/dev/null
pkill python3 2>/dev/null
sudo kill -9 $(sudo lsof -t -i:5000) 2>/dev/null
sudo kill -9 $(sudo lsof -t -i:5500) 2>/dev/null

echo "🚀 Iniciando backend (porta 5000)..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

sleep 3

echo "🎨 Iniciando frontend (porta 5500)..."
cd frontend
python3 -m http.server 5500 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ SISTEMA RODANDO!"
echo "📍 Frontend: http://localhost:5500"
echo "📍 Login: http://localhost:5500/auth.html"
echo "📍 Dashboard: http://localhost:5500/dashboard.html"
echo "📍 API: http://localhost:5000"
echo ""
echo "🔑 Admin: admin@techstore.com.br / ***REMOVED***"
echo ""
echo "⚠️  Pressione Ctrl+C para parar"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
