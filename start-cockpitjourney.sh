#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo ""
echo "============================================================"
echo "  CockpitJourney v1.0 — Atlas Studio"
echo "  Pilotez votre journée."
echo "============================================================"
echo ""

if [ ! -d "node_modules" ]; then
  echo "[1/3] Installation des dépendances (première exécution)..."
  npm install
fi

if [ ! -f "dist/index.html" ]; then
  echo "[2/3] Compilation de l'application..."
  npm run build
fi

echo "[3/3] Lancement du serveur local sur http://localhost:5400"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter le serveur."
echo ""

npm run start
