#!/bin/bash

echo "🛑 Parando serviços..."
pkill node 2>/dev/null
pkill python3 2>/dev/null
sudo kill -9 $(sudo lsof -t -i:5000) 2>/dev/null
sudo kill -9 $(sudo lsof -t -i:3000) 2>/dev/null

sleep 2

echo "🚀 Iniciando backend..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

sleep 3

echo "🎨 Iniciando frontend na porta 3000..."
cd frontend
python3 -m http.server 3000 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ SISTEMA RODANDO!"
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
