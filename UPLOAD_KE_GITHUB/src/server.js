/**
 * Pelayan Pengeluaran Utama (Main Production Server)
 * Mengendalikan Webhook 24/7, Papan Pemuka Admin, dan Enjin AI.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import db from './db/database.js';
import apiRoutes from './routes/apiRoutes.js';
import { handleWebhookVerification, handleIncomingWebhook } from './whatsapp/metaCloudApi.js';
import { initCloudBaileys } from './whatsapp/baileysCloud.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Asas
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Laman Web Statik (Papan Pemuka Admin)
app.use(express.static(path.join(__dirname, '..', 'public')));

// -------------------------------------------------------------
// WEBHOOK KEKAL 24/7 (META WHATSAPP CLOUD API)
// -------------------------------------------------------------
app.get('/webhook', handleWebhookVerification);
app.post('/webhook', handleIncomingWebhook);

// -------------------------------------------------------------
// LALUAN API PENGURUSAN
// -------------------------------------------------------------
app.use('/api', apiRoutes);

// Health Check Endpoint untuk Cloud Monitoring (Render/Railway/Docker)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), memory: process.memoryUsage() });
});

// Mulakan Pelayan
const server = app.listen(PORT, () => {
  console.log('================================================================');
  console.log(`🚀 AUTOBOT WSZIA - PRODUCTION SERVER BERJALAN PADA PORT ${PORT}`);
  console.log(`🌐 Papan Pemuka Admin: http://localhost:${PORT}`);
  console.log(`🔗 Webhook WhatsApp 24/7: http://localhost:${PORT}/webhook`);
  console.log('================================================================');

  // Periksa mod WhatsApp yang dikonfigurasi
  const modeRow = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_mode'").get();
  const mode = modeRow ? modeRow.value : 'dual';

  if (mode === 'baileys' || mode === 'dual') {
    console.log('📡 Memulakan enjin Cloud Baileys...');
    initCloudBaileys();
  }
});

// Penutupan Selamat (Graceful Shutdown)
process.on('SIGTERM', () => {
  console.log('Menerima isyarat SIGTERM. Menutup pelayan secara selamat...');
  server.close(() => {
    db.exec('PRAGMA wal_checkpoint(FULL);');
    console.log('Pangkalan data ditutup dengan selamat.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Menerima isyarat SIGINT. Menutup pelayan secara selamat...');
  server.close(() => {
    db.exec('PRAGMA wal_checkpoint(FULL);');
    console.log('Pangkalan data ditutup dengan selamat.');
    process.exit(0);
  });
});
