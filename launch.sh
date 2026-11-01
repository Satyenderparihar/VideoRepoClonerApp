#!/data/user/0/com.termux/files/usr/bin/bash
# 🚀 1-Tap Launcher for Video-to-Repo Cloner Android App

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=5050

echo "======================================================"
echo "📱 Video-to-Repo Cloner App - Android Launcher"
echo "======================================================"

# Stop old instance if any
fuser -k ${PORT}/tcp 2>/dev/null || true
pkill -f "VideoRepoClonerApp/server.js" 2>/dev/null || true
sleep 0.5

# Start server with nohup
cd "$DIR"
nohup node server.js > server.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > server.pid

echo "[*] Server launched with PID: $SERVER_PID"
sleep 1.5

# Open directly in Android Browser
if command -v am >/dev/null 2>&1; then
    echo "[✓] Opening in Chrome/Browser via Android Intent..."
    am start -a android.intent.action.VIEW -d "http://localhost:${PORT}" >/dev/null 2>&1
elif command -v termux-open-url >/dev/null 2>&1; then
    echo "[✓] Opening via Termux API..."
    termux-open-url "http://localhost:${PORT}"
else
    echo "[✓] Server is ready! Open: http://localhost:${PORT}"
fi

echo ""
echo "📱 App Live on: http://localhost:${PORT} or http://127.0.0.1:${PORT}"
echo "======================================================"
