#!/usr/bin/env bash
# Valida consistencia dos .env SEM imprimir segredos (uso: CI e pre-up local).
set -euo pipefail
ok=1
need() { [ -n "${1:-}" ] || { echo "FALTA: $2"; ok=0; }; }
[ -f .env ] || { echo "FALTA: .env (copie de .env.example)"; ok=0; }
[ -f backend/.env ] || { echo "FALTA: backend/.env (copie de backend/.env.example)"; ok=0; }
if [ -f .env ] && [ -f backend/.env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
  BU=$(grep '^MONGODB_URI=' backend/.env | cut -d= -f2)
  need "${MONGO_PASSWORD:-}" "MONGO_PASSWORD no .env"
  case "$BU" in
    *"://admin:${MONGO_PASSWORD}@localhost"*) echo "OK: backend/.env casa com .env (host local)";;
    *) echo "AVISO: MONGODB_URI do backend/.env nao usa a senha do .env raiz";;
  esac
fi
[ "$ok" = 1 ] && echo "ENV OK" || exit 1
