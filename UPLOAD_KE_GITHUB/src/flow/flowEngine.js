/**
 * Enjin Closing Flow (Visual Sales Flow State Machine & Response Generator)
 * Memproses perbualan mengikut langkah, percabangan bersyarat, dan pembolehubah dinamik.
 */

import db from '../db/database.js';
import { INTENTS, detectIntentAndExtract } from '../ai/intentDetector.js';
import { sanitizeAiResponse, requiresMedicalDisclaimer, MEDICAL_DISCLAIMER } from '../ai/safetyGuard.js';
import {
  getOrCreateCustomer,
  getOrCreateConversation,
  recordOrUpdateOrder,
  finalizeOrder,
  triggerHumanHandover
} from './orderManager.js';

// Penggantian Pembolehubah Dinamik
export function interpolateVariables(templateText, context = {}) {
  let result = templateText || '';

  const variables = {
    '{{customer_name}}': context.name || 'tuan/puan',
    '{{product_name}}': context.product_name || 'Minyak Herba Halia & Lemon WSZia',
    '{{package_name}}': context.package_interest || 'Pakej Rawatan Jimat (2 Botol)',
    '{{package_price}}': context.package_price || '120',
    '{{quantity}}': context.quantity || '1',
    '{{customer_problem}}': context.problem || 'masalah angin dan perut kembung',
    '{{customer_address}}': context.address || '(Sila nyatakan alamat pos)'
  };

  for (const [key, val] of Object.entries(variables)) {
    result = result.replaceAll(key, val);
  }

  return result;
}

// Dapatkan Flow Terbitan Aktif
export function getActivePublishedFlow() {
  const row = db.prepare("SELECT * FROM closing_flows WHERE status = 'published' ORDER BY version DESC LIMIT 1").get();
  if (row) {
    return { ...row, steps: JSON.parse(row.steps_json) };
  }
  return null;
}

// Proses Mesej Pelanggan melalui Enjin Closing Flow
export async function processCustomerMessage({
  phone,
  messageText,
  flowOverride = null, // Digunakan oleh Simulator Ujian
  isSimulation = false
}) {
  // 1. Dapatkan atau Cipta Profil Pelanggan
  let customer = isSimulation
    ? { id: 999999, phone, name: null, problem: null, package_interest: null, address: null }
    : getOrCreateCustomer(phone);

  let conversation = isSimulation
    ? { id: 999999, customer_id: customer.id, current_step_id: 'step_greeting', handover_to_human: 0, variables_json: '{}' }
    : getOrCreateConversation(customer.id);

  // Jika perbualan sedang diserahkan kepada manusia, hentikan AI
  if (conversation.handover_to_human && !isSimulation) {
    console.log(`[HANDOVER AKTIF] Mesej dari ${phone} diabaikan oleh AI kerana sedang dikendalikan staf manusia.`);
    return null;
  }

  // 2. Analisis Niat & Ekstraksi Entiti
  const parsedVars = JSON.parse(conversation.variables_json || '{}');
  const aiResult = await detectIntentAndExtract(messageText, {
    current_step: conversation.current_step_id,
    customer_name: customer.name || parsedVars.name,
    customer_problem: customer.problem || parsedVars.problem
  });

  const intent = aiResult.intent;
  const entities = aiResult.entities || {};

  // Kemaskini data memori pelanggan
  const updatedVars = { ...parsedVars, ...entities };
  if (!isSimulation) {
    customer = getOrCreateCustomer(phone, entities);
  }

  // 3. Semak Serahan Manusia (Human Handover)
  if (intent === INTENTS.HUMAN_HANDOVER || intent === INTENTS.COMPLAINT) {
    if (!isSimulation) {
      triggerHumanHandover(conversation.id, `Niat dikesan: ${intent}`);
      db.prepare('INSERT INTO messages (conversation_id, sender_type, text, intent) VALUES (?, ?, ?, ?)')
        .run(conversation.id, 'customer', messageText, intent);
    }
    const handoverReply = "Baik, saya telah maklumkan kepada pegawai khidmat pelanggan kami. Staf manusia kami akan membalas perbualan ini sebentar lagi ya. Terima kasih atas kesabaran anda! 🙏";
    
    if (!isSimulation) {
      db.prepare('INSERT INTO messages (conversation_id, sender_type, text, intent) VALUES (?, ?, ?, ?)')
        .run(conversation.id, 'ai', handoverReply, intent);
    }
    return {
      reply: handoverReply,
      intent,
      stepId: 'handover',
      handover: true
    };
  }

  // 4. Muat Turun Flow Steps
  const flow = flowOverride || getActivePublishedFlow();
  const steps = flow ? flow.steps : [];
  let currentStepId = conversation.current_step_id || 'step_greeting';

  // Logik Percabangan Bersyarat Berdasarkan Niat
  if (intent === INTENTS.PRICE_INQUIRY) {
    currentStepId = 'step_recommend_package';
  } else if (intent === INTENTS.OBJECTION || intent === INTENTS.ASKING_FOR_DISCOUNT) {
    currentStepId = 'step_handle_objection';
  } else if (intent === INTENTS.BUYING_INTENT) {
    currentStepId = 'step_closing';
  } else if (intent === INTENTS.READY_TO_ORDER && (entities.address || customer.address)) {
    currentStepId = 'step_order_confirmation';
  }

  // Dapatkan definisi langkah semasa
  let activeStep = steps.find(s => s.id === currentStepId && s.isEnabled !== false);
  if (!activeStep) {
    activeStep = steps[0] || {
      id: 'step_greeting',
      name: 'Default Greeting',
      exampleScript: 'Hai! Ada apa yang boleh kami bantu?',
      nextStepId: null
    };
  }

  // 5. Semak Aliran Pengesahan Pesanan (Order Flow Confirmation)
  let orderData = null;
  const isConfirming = /ya|betul|confirm|setuju|ok|baik|sahkan/i.test(messageText.trim().toLowerCase());

  if (activeStep.id === 'step_order_confirmation' && isConfirming) {
    if (!isSimulation) {
      orderData = finalizeOrder(customer.id);
    }
    activeStep = steps.find(s => s.id === 'step_completed_order') || activeStep;
  } else if (activeStep.id === 'step_order_confirmation' || activeStep.id === 'step_collect_details') {
    if (!isSimulation) {
      orderData = recordOrUpdateOrder(customer.id, {
        package_name: updatedVars.package_interest || customer.package_interest,
        quantity: updatedVars.quantity || 1,
        name: updatedVars.name || customer.name,
        address: updatedVars.address || customer.address
      });
    }
  }

  // 6. Jana Teks Balasan
  // Gunakan template skrip langkah dan ganti pembolehubah dinamik
  const contextForInterpolation = {
    name: customer.name || updatedVars.name,
    problem: customer.problem || updatedVars.problem,
    package_interest: customer.package_interest || updatedVars.package_interest,
    package_price: updatedVars.quantity === 1 ? '70' : '120',
    quantity: updatedVars.quantity || 1,
    address: customer.address || updatedVars.address
  };

  let rawReply = activeStep.exampleScript || activeStep.objective;

  // Jika di step closing, boleh gunakan variasi Closing Script dari pangkalan data
  if (activeStep.id === 'step_closing') {
    const scriptRow = db.prepare(`
      SELECT script_text FROM closing_scripts 
      WHERE is_active = 1 
      ORDER BY RANDOM() LIMIT 1
    `).get();
    if (scriptRow) {
      rawReply = scriptRow.script_text;
    }
  }

  let finalReply = interpolateVariables(rawReply, contextForInterpolation);

  // Penapisan Keselamatan & Pematuhan Perubatan
  finalReply = sanitizeAiResponse(finalReply);
  if (requiresMedicalDisclaimer(messageText)) {
    finalReply += MEDICAL_DISCLAIMER;
  }

  // Tentukan langkah seterusnya
  const nextStepId = activeStep.nextStepId || activeStep.id;

  // 7. Simpan ke Pangkalan Data
  if (!isSimulation) {
    db.prepare('INSERT INTO messages (conversation_id, sender_type, text, intent, step_id) VALUES (?, ?, ?, ?, ?)')
      .run(conversation.id, 'customer', messageText, intent, activeStep.id);

    db.prepare('INSERT INTO messages (conversation_id, sender_type, text, intent, step_id) VALUES (?, ?, ?, ?, ?)')
      .run(conversation.id, 'ai', finalReply, intent, activeStep.id);

    db.prepare(`
      UPDATE conversations 
      SET current_step_id = ?, variables_json = ?, last_intent = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(nextStepId, JSON.stringify(updatedVars), intent, conversation.id);
  }

  return {
    reply: finalReply,
    intent,
    currentStep: activeStep,
    nextStepId,
    extractedEntities: updatedVars,
    order: orderData
  };
}
