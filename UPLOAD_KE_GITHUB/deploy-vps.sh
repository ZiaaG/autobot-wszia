#!/bin/bash
# ==============================================================================
# Skrip Penerapan Automatik AutoBot WSZia ke Pelayan VPS Ubuntu/Debian 24/7
# ==============================================================================

set -e

echo "===================================================================="
echo "  MEMULAKAN PENERAPAN PENGELUARAN 24/7 AUTOBOT WSZIA"
echo "===================================================================="

# 1. Kemaskini Pakej OS
echo "[1/6] Mengemas kini pakej sistem Ubuntu..."
sudo apt update && sudo apt upgrade -y

# 2. Pasang Node.js 22 & Build Tools
echo "[2/6] Memasang Node.js 22 LTS & PM2..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git build-essential

# Pasang PM2 secara global
sudo npm install -g pm2

# 3. Pasang Dependencies Projek
echo "[3/6] Memasang dependencies projek..."
npm ci --only=production

# Pastikan folder data wujud
mkdir -p data

# 4. Tetapkan PM2 Process Manager (Auto-Restart 24/7)
echo "[4/6] Mengkonfigurasikan PM2 untuk operasi tanpa henti 24/7..."
pm2 delete autobot-wszia 2>/dev/null || true
pm2 start src/server.js --name "autobot-wszia" --max-memory-restart 500M

# Simpan konfigurasi PM2 agar hidup semula secara automatik jika pelayan dimatikan/reboot
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

# 5. Konfigurasi Nginx Reverse Proxy
echo "[5/6] Menyediakan Nginx Reverse Proxy..."
sudo tee /etc/nginx/sites-available/autobot <<EOF
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/autobot /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo "===================================================================="
echo "✅ PENERAPAN PENGELUARAN SELESAI!"
echo "🤖 AutoBot WSZia kini beroperasi 24/7 di awan secara bebas dari laptop anda."
echo "🌐 Status PM2:"
pm2 status
echo "===================================================================="
