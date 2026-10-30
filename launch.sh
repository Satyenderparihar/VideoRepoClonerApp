#!/data/user/0/com.termux/files/usr/bin/bash
# 🚀 1-Tap Launcher for Video-to-Repo Cloner Android App

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=5050

echo "======================================================"
echo "📱 Video-to-Repo Cloner App - Android Launcher"
echo "======================================================"

# Kill any existing server on port 5050
fuser -k ${PORT}/tcp 2>/dev/null || true

# Start server in background
cd "$DIR"
node server.js > server.log 2>&1 &
SERVER_PID=$!

echo "[*] Server launched with PID: $SERVER_PID"
sleep 1.5

# Open directly in Android Browser / PWA
if command -v termux-open-url >/dev/null 2>&1; then
    echo "[✓] Opening app on Android Screen..."
    termux-open-url "http://localhost:${PORT}"
elif command -v am >/dev/null 2>&1; then
    echo "[✓] Opening via Android Activity Manager..."
    am start -a android.intent.action.VIEW -d "http://localhost:${PORT}" >/dev/null 2>&1
else
    echo "[✓] Server is ready! Open in your browser: http://localhost:${PORT}"
fi

echo ""
echo "💡 TIP: Browser me 'Add to Home Screen' (होम स्क्रीन पर जोड़ें) पर क्लिक करें,"
echo "   जिससे यह बिना URL बार के एक असली Android App (APK) की तरह चलेगा!"
echo "======================================================"
