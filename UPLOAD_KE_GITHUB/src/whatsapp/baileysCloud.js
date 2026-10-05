/**
 * Integrasi Cloud Baileys (Sesi WhatsApp Web Awan Kekal)
 * Menyokong pengimbasan kod QR di pelayar dan penyimpanan sesi kekal di data/auth_info_baileys/.
 */

import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processCustomerMessage } from '../flow/flowEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, '..', '..', 'data', 'auth_info_baileys');
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

export const baileysState = {
  status: 'disconnected', // 'starting' | 'qr' | 'connected' | 'disconnected'
  qrDataUrl: null,
  user: null,
  sock: null
};

export async function initCloudBaileys() {
  try {
    baileysState.status = 'starting';
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      printQRInTerminal: false,
      defaultQueryTimeoutMs: 60000
    });

    baileysState.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        baileysState.status = 'qr';
        try {
          baileysState.qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          console.log('📲 [CLOUD BAILEYS] Kod QR baharu sedia untuk diimbas.');
        } catch (err) {
          console.error('Ralat menjana imej QR Baileys:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        baileysState.status = 'disconnected';
        baileysState.user = null;
        baileysState.qrDataUrl = null;

        console.log(`⚠️ [CLOUD BAILEYS] Sambungan ditutup (Status: ${statusCode || 'Tiada'}).`);

        if (shouldReconnect) {
          console.log('🔄 [CLOUD BAILEYS] Menyambung semula dalam 3 saat...');
          setTimeout(() => initCloudBaileys(), 3000);
        } else {
          console.log('❌ [CLOUD BAILEYS] Sesi log keluar. Memadam sesi lama...');
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch (_) {}
          setTimeout(() => initCloudBaileys(), 2000);
        }
      } else if (connection === 'open') {
        baileysState.status = 'connected';
        baileysState.qrDataUrl = null;
        baileysState.user = sock.user;

        console.log(`✅ [CLOUD BAILEYS] Berjaya tersambung ke akaun: +${sock.user.id.split(':')[0]}`);
      }
    });

    // Pemproses Mesej Masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') continue;
        if (msg.key.remoteJid.endsWith('@g.us')) continue; // Abaikan group chat

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          '';

        const trimmed = text.trim();
        if (!trimmed) continue;

        const senderJid = msg.key.remoteJid;
        const fromPhone = senderJid.split('@')[0];

        console.log(`📩 [CLOUD BAILEYS] Mesej masuk dari ${fromPhone}: "${trimmed}"`);

        const result = await processCustomerMessage({
          phone: fromPhone,
          messageText: trimmed
        });

        if (result && result.reply) {
          try {
            await new Promise((res) => setTimeout(res, 800));
            await sock.sendMessage(senderJid, { text: result.reply }, { quoted: msg });
            console.log(`📤 [CLOUD BAILEYS] Balasan dihantar ke ${fromPhone}`);
          } catch (err) {
            console.error(`❌ [CLOUD BAILEYS] Gagal hantar balasan:`, err.message);
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ [CLOUD BAILEYS] Ralat inisialisasi:', error.message);
  }
}

export async function sendBaileysMessage(phone, text) {
  if (baileysState.status !== 'connected' || !baileysState.sock) {
    throw new Error('Sesi Baileys tidak aktif atau belum bersambung.');
  }

  const cleanPhone = phone.replace(/\D/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;
  await baileysState.sock.sendMessage(jid, { text });
  return true;
}
