/**
 * Integrasi Rasmi Meta WhatsApp Cloud API (Permanent Production Webhook)
 * Memproses mesej masuk 24/7 terus dari pelayan Meta ke Webhook Awan Kekal.
 */

import db from '../db/database.js';
import { processCustomerMessage } from '../flow/flowEngine.js';

export function getMetaSettings() {
  const getSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  return {
    verifyToken: process.env.META_VERIFY_TOKEN || getSetting.get('meta_verify_token')?.value || 'autobot_wszia_verify_secret_token_2026',
    accessToken: process.env.META_ACCESS_TOKEN || getSetting.get('meta_access_token')?.value || '',
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || getSetting.get('meta_phone_number_id')?.value || ''
  };
}

// 1. Pengesahan Webhook (GET /webhook)
export function handleWebhookVerification(req, res) {
  const { verifyToken } = getMetaSettings();

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ [META CLOUD API] Webhook verification berjaya disahkan oleh Meta!');
    return res.status(200).send(challenge);
  } else {
    console.warn('❌ [META CLOUD API] Webhook verification gagal. Token tidak sepadan.');
    return res.sendStatus(403);
  }
}

// 2. Penerimaan Mesej Webhook 24/7 (POST /webhook)
export async function handleIncomingWebhook(req, res) {
  // Sahkan penerimaan segera ke Meta (elakkan timeout)
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') {
      return;
    }

    const fromPhone = message.from;
    const messageText = message.text?.body;
    const senderName = value?.contacts?.[0]?.profile?.name || fromPhone;

    console.log(`📩 [META CLOUD API] Mesej masuk daripada ${senderName} (${fromPhone}): "${messageText}"`);

    // Proses mesej melalui Enjin Closing Flow
    const result = await processCustomerMessage({
      phone: fromPhone,
      messageText
    });

    if (result && result.reply) {
      // Hantar balasan automatik melalui Meta API
      await sendMetaWhatsAppMessage(fromPhone, result.reply);
      console.log(`📤 [META CLOUD API] Balasan dihantar kepada ${fromPhone}`);
    }
  } catch (error) {
    console.error('❌ [META CLOUD API] Ralat memproses webhook:', error.message);
  }
}

// 3. Penghantaran Mesej Melalui Meta Graph API
export async function sendMetaWhatsAppMessage(toPhone, text) {
  const { accessToken, phoneNumberId } = getMetaSettings();

  if (!accessToken || !phoneNumberId) {
    console.warn('⚠️ [META CLOUD API] Access Token atau Phone Number ID belum dikonfigurasikan.');
    return false;
  }

  const cleanPhone = toPhone.replace(/\D/g, '');

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: text }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ [META CLOUD API] Gagal hantar mesej:', data);
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ [META CLOUD API] Ralat rangkaian Graph API:', err.message);
    return false;
  }
}
