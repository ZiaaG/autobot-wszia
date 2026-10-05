/**
 * Modul Pengesan Niat (Customer Intent Detection & Entity Extraction)
 * Menyokong Google Gemini / OpenAI API dengan Fallback NLP Tempatan Berprestasi Tinggi.
 */

import db from '../db/database.js';

export const INTENTS = {
  NEW_CUSTOMER: 'new_customer',
  PRODUCT_INQUIRY: 'product_inquiry',
  PRICE_INQUIRY: 'price_inquiry',
  INGREDIENT_INQUIRY: 'ingredient_inquiry',
  HOW_TO_USE: 'how_to_use',
  DELIVERY_INQUIRY: 'delivery_inquiry',
  PAYMENT_INQUIRY: 'payment_inquiry',
  BUYING_INTENT: 'buying_intent',
  READY_TO_ORDER: 'ready_to_order',
  NOT_INTERESTED: 'not_interested',
  ASKING_FOR_DISCOUNT: 'asking_for_discount',
  OBJECTION: 'objection',
  COMPLAINT: 'complaint',
  REFUND_INQUIRY: 'refund_inquiry',
  HUMAN_HANDOVER: 'human_handover',
  UNKNOWN: 'unknown'
};

// Pengesan Berasaskan Pola & Peraturan Tempatan (High Accuracy Fallback)
export function detectIntentRuleBased(text) {
  const lower = text.toLowerCase().trim();

  // 1. Serahan Manusia (Human Handover)
  if (/nak cakap dengan orang|nak staf|nak admin|hubungi pegawai|cakap dengan manusia|operator|human agent|tolong panggil bos/i.test(lower)) {
    return INTENTS.HUMAN_HANDOVER;
  }

  // 2. Aduan / Komplain / Refund
  if (/rosak|pecah|tak sampai lagi|lambat sangat|nak ganti rugi|refund|batal pesanan|tipu|scam/i.test(lower)) {
    return INTENTS.COMPLAINT;
  }
  if (/refund|pulangkan duit|return/i.test(lower)) {
    return INTENTS.REFUND_INQUIRY;
  }

  // 3. Niat Membeli / Sedia Membuat Tempahan
  if (/saya nak beli|nak order|nak tempah|saya setuju|nak ambil pakej|nak cuba|ambik 1 botol|ambik 2 botol|cara nak beli/i.test(lower)) {
    return INTENTS.BUYING_INTENT;
  }
  if (/ni nama saya|alamat saya|pos ke alamat|saya dah transfer|ni resit/i.test(lower)) {
    return INTENTS.READY_TO_ORDER;
  }

  // 4. Bantahan & Keraguan (Objection)
  if (/mahal|mahal sangat|tinggi sangat harga|bajet tak cukup|kurang sikit|kenapa mahal|mahal la/i.test(lower)) {
    return INTENTS.OBJECTION;
  }
  if (/ada diskaun|boleh kurang|harga promosi|best price|potongan harga/i.test(lower)) {
    return INTENTS.ASKING_FOR_DISCOUNT;
  }
  if (/tak minat|tak apalah|tak jadi|lain kalilah|cancel/i.test(lower)) {
    return INTENTS.NOT_INTERESTED;
  }

  // 5. Pertanyaan Harga
  if (/berapa harga|harga berapa|berapa rm|ada pakej apa|senarai harga|price|pakej harga/i.test(lower)) {
    return INTENTS.PRICE_INQUIRY;
  }

  // 6. Pertanyaan Bahan / Keselamatan / Kelulusan
  if (/bahan apa|kandungan|ada kkm|ada ubat kimia|halal ke|ramuan|side effect|kesan sampingan/i.test(lower)) {
    return INTENTS.INGREDIENT_INQUIRY;
  }

  // 7. Cara Penggunaan
  if (/macam mana guna|cara minum|cara makan|sehari berapa kali|waktu bila minum|pantang larang/i.test(lower)) {
    return INTENTS.HOW_TO_USE;
  }

  // 8. Penghantaran & Bayaran
  if (/boleh cod|ada cod|hantar macam mana|pos berapa lama|kurier apa|sampai bila|pos laju/i.test(lower)) {
    return INTENTS.DELIVERY_INQUIRY;
  }
  if (/no akaun|nombor akaun|bank apa|cara bayar|transfer mana|online banking/i.test(lower)) {
    return INTENTS.PAYMENT_INQUIRY;
  }

  // 9. Pertanyaan Produk / Masalah Kesihatan
  if (/kembung|angin|gastrik|pedih ulu hati|sesak dada|sendawa|mual|sembelit|perut memulas|produk apa ni|untuk apa/i.test(lower)) {
    return INTENTS.PRODUCT_INQUIRY;
  }

  // 10. Pelanggan Baru / Salam
  if (/salam|assalam|hai|hello|hi|hey|selamat pagi|selamat petang/i.test(lower)) {
    return INTENTS.NEW_CUSTOMER;
  }

  return INTENTS.UNKNOWN;
}

// Ekstraksi Entiti & Data Pelanggan (Customer Entities)
export function extractCustomerEntities(text) {
  const entities = {};
  const lower = text.toLowerCase();

  // Ekstrak Nama
  const nameMatch = text.match(/(?:nama saya|panggil saya)\s+([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25})?)/i);
  if (nameMatch) {
    const candidate = nameMatch[1].trim();
    if (!/selalu|rasa|ada|nak|beli|mahal|order|kembung|sakit/i.test(candidate)) {
      entities.name = candidate;
    }
  }

  // Ekstrak Masalah Kesihatan
  const problems = [];
  if (/kembung/i.test(lower)) problems.push('perut kembung');
  if (/banyak angin|buang angin|angin degil/i.test(lower)) problems.push('banyak angin');
  if (/gastrik/i.test(lower)) problems.push('gastrik');
  if (/pedih ulu hati|gerd/i.test(lower)) problems.push('pedih ulu hati / GERD');
  if (/sendawa/i.test(lower)) problems.push('kerap sendawa');
  if (problems.length > 0) {
    entities.problem = problems.join(', ');
  }

  // Ekstrak Pakej Minat
  if (/1 botol|sebotol|percubaan/i.test(lower)) {
    entities.package_interest = 'Pakej Percubaan (1 Botol)';
    entities.quantity = 1;
  } else if (/2 botol|dua botol|jimat|rawatan/i.test(lower)) {
    entities.package_interest = 'Pakej Rawatan Jimat (2 Botol)';
    entities.quantity = 2;
  } else if (/3 botol|tiga botol|keluarga/i.test(lower)) {
    entities.package_interest = 'Pakej Keluarga Sihat (3 Botol)';
    entities.quantity = 3;
  }

  // Ekstrak Alamat
  const addressMatch = text.match(/(?:no\s*\d+|jalan|lorong|kampung|taman|poskod|\b\d{5}\b).*?(?:selangor|kuala lumpur|johor|perak|kedah|kelantan|terengganu|pahang|negeri sembilan|melaka|pulau pinang|perlis|sabah|sarawak)/is);
  if (addressMatch) {
    entities.address = addressMatch[0].trim();
  }

  return entities;
}

// Pengesan Menggunakan Google Gemini API (jika API Key dibekalkan)
export async function detectIntentAndExtract(text, conversationContext = {}) {
  const getSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  const apiKeyRow = getSetting.get('ai_api_key');
  const apiKey = process.env.GEMINI_API_KEY || (apiKeyRow ? apiKeyRow.value : '');

  // Ekstrak entiti tempatan terlebih dahulu
  const localEntities = extractCustomerEntities(text);
  const localIntent = detectIntentRuleBased(text);

  if (!apiKey || apiKey.trim() === '') {
    return {
      intent: localIntent,
      entities: localEntities,
      confidence: 0.9,
      source: 'rule_engine'
    };
  }

  try {
    const prompt = `Anda adalah penganalisis niat WhatsApp untuk produk kesihatan.
Mesej Pelanggan: "${text}"
Konteks Sebelum Ini: ${JSON.stringify(conversationContext)}

Pilih SATU niat paling tepat daripada senarai:
- new_customer
- product_inquiry
- price_inquiry
- ingredient_inquiry
- how_to_use
- delivery_inquiry
- payment_inquiry
- buying_intent
- ready_to_order
- not_interested
- asking_for_discount
- objection
- complaint
- refund_inquiry
- human_handover
- unknown

Kembalikan format JSON SAHAJA:
{
  "intent": "nama_intent",
  "entities": {
    "name": "nama jika ada atau null",
    "problem": "masalah kesihatan jika ada atau null",
    "package_interest": "pakej jika ada atau null",
    "quantity": 1,
    "address": "alamat jika ada atau null"
  }
}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!res.ok) {
      throw new Error(`Gemini API returned status ${res.status}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawText);

    return {
      intent: parsed.intent || localIntent,
      entities: { ...localEntities, ...(parsed.entities || {}) },
      confidence: 0.95,
      source: 'gemini_ai'
    };
  } catch (err) {
    console.warn(`[AI INTENT] Gemini gagal (${err.message}). Menggunakan enjin fallback.`);
    return {
      intent: localIntent,
      entities: localEntities,
      confidence: 0.85,
      source: 'rule_engine_fallback'
    };
  }
}
