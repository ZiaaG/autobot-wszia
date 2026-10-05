/**
 * Laluan API Pengurusan Papan Pemuka (REST API Routes)
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';
import { generateToken, authMiddleware } from '../auth/authMiddleware.js';
import { processCustomerMessage, getActivePublishedFlow } from '../flow/flowEngine.js';
import { baileysState, sendBaileysMessage } from '../whatsapp/baileysCloud.js';
import { sendMetaWhatsAppMessage, getMetaSettings } from '../whatsapp/metaCloudApi.js';
import { resumeAiAutomation, triggerHumanHandover } from '../flow/orderManager.js';

const router = express.Router();

// -------------------------------------------------------------
// 1. AUTHENTICATION
// -------------------------------------------------------------
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Sila masukkan nama pengguna dan kata laluan.' });
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: 'Nama pengguna atau kata laluan tidak sah.' });
  }

  const token = generateToken(user);
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

router.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

// -------------------------------------------------------------
// 2. CLOSING FLOW BUILDER & VERSIONING
// -------------------------------------------------------------
router.get('/flows', authMiddleware, (req, res) => {
  const flows = db.prepare('SELECT id, name, version, status, created_at, updated_at FROM closing_flows ORDER BY version DESC').all();
  res.json({ success: true, flows });
});

router.get('/flows/:id', authMiddleware, (req, res) => {
  const flow = db.prepare('SELECT * FROM closing_flows WHERE id = ?').get(req.params.id);
  if (!flow) {
    return res.status(404).json({ success: false, error: 'Flow tidak dijumpai.' });
  }
  res.json({
    success: true,
    flow: { ...flow, steps: JSON.parse(flow.steps_json) }
  });
});

router.post('/flows', authMiddleware, (req, res) => {
  const { name, steps } = req.body;
  const latest = db.prepare('SELECT MAX(version) as max_v FROM closing_flows').get();
  const nextVersion = (latest?.max_v || 0) + 1;

  const insert = db.prepare(`
    INSERT INTO closing_flows (name, version, status, steps_json)
    VALUES (?, ?, 'draft', ?)
  `);
  const result = insert.run(name || `Closing Flow v${nextVersion}`, nextVersion, JSON.stringify(steps || []));

  res.json({
    success: true,
    flowId: Number(result.lastInsertRowid),
    version: nextVersion
  });
});

router.put('/flows/:id', authMiddleware, (req, res) => {
  const { name, steps } = req.body;
  db.prepare(`
    UPDATE closing_flows 
    SET name = COALESCE(?, name), steps_json = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(name, JSON.stringify(steps), req.params.id);

  res.json({ success: true });
});

router.post('/flows/:id/publish', authMiddleware, (req, res) => {
  const flowId = req.params.id;

  // Arkibkan flow yang published sekarang
  db.prepare("UPDATE closing_flows SET status = 'archived' WHERE status = 'published'").run();

  // Terbitkan flow terpilih
  db.prepare("UPDATE closing_flows SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(flowId);

  res.json({ success: true, message: 'Closing Flow berjaya diterbitkan secara langsung!' });
});

router.post('/flows/:id/duplicate', authMiddleware, (req, res) => {
  const original = db.prepare('SELECT * FROM closing_flows WHERE id = ?').get(req.params.id);
  if (!original) {
    return res.status(404).json({ success: false, error: 'Flow asal tidak dijumpai.' });
  }

  const latest = db.prepare('SELECT MAX(version) as max_v FROM closing_flows').get();
  const nextVersion = (latest?.max_v || 0) + 1;

  const insert = db.prepare(`
    INSERT INTO closing_flows (name, version, status, steps_json)
    VALUES (?, ?, 'draft', ?)
  `);
  const result = insert.run(`${original.name} (Salinan v${nextVersion})`, nextVersion, original.steps_json);

  res.json({ success: true, flowId: Number(result.lastInsertRowid), version: nextVersion });
});

router.delete('/flows/:id', authMiddleware, (req, res) => {
  const flow = db.prepare('SELECT status FROM closing_flows WHERE id = ?').get(req.params.id);
  if (flow?.status === 'published') {
    return res.status(400).json({ success: false, error: 'Tidak boleh memadam flow yang sedang aktif diterbitkan.' });
  }
  db.prepare('DELETE FROM closing_flows WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// -------------------------------------------------------------
// 3. FLOW SIMULATOR (TEST ENVIRONMENT)
// -------------------------------------------------------------
router.post('/simulator/chat', authMiddleware, async (req, res) => {
  const { message, flowSteps } = req.body;

  let flowOverride = null;
  if (flowSteps && Array.isArray(flowSteps)) {
    flowOverride = { steps: flowSteps };
  }

  try {
    const result = await processCustomerMessage({
      phone: '60123456789_sim',
      messageText: message,
      flowOverride,
      isSimulation: true
    });

    res.json({
      success: true,
      reply: result.reply,
      intent: result.intent,
      currentStep: result.currentStep,
      nextStepId: result.nextStepId,
      extractedEntities: result.extractedEntities,
      handover: result.handover || false
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. CLOSING SCRIPTS MANAGEMENT
// -------------------------------------------------------------
router.get('/closing-scripts', authMiddleware, (req, res) => {
  const scripts = db.prepare('SELECT * FROM closing_scripts ORDER BY id DESC').all();
  res.json({ success: true, scripts });
});

router.post('/closing-scripts', authMiddleware, (req, res) => {
  const { name, type, script_text, trigger_intent } = req.body;
  const insert = db.prepare(`
    INSERT INTO closing_scripts (name, type, script_text, trigger_intent, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);
  const result = insert.run(name, type, script_text, trigger_intent || 'buying_intent');
  res.json({ success: true, id: Number(result.lastInsertRowid) });
});

router.put('/closing-scripts/:id', authMiddleware, (req, res) => {
  const { name, type, script_text, trigger_intent, is_active } = req.body;
  db.prepare(`
    UPDATE closing_scripts 
    SET name = ?, type = ?, script_text = ?, trigger_intent = ?, is_active = ? 
    WHERE id = ?
  `).run(name, type, script_text, trigger_intent, is_active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/closing-scripts/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM closing_scripts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// -------------------------------------------------------------
// 5. PRODUCTS & PACKAGES
// -------------------------------------------------------------
router.get('/products', authMiddleware, (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();
  const packages = db.prepare('SELECT * FROM packages WHERE is_active = 1').all();
  res.json({ success: true, products, packages });
});

router.post('/products', authMiddleware, (req, res) => {
  const { name, description, base_price } = req.body;
  const resInsert = db.prepare('INSERT INTO products (name, description, base_price) VALUES (?, ?, ?)')
    .run(name, description, base_price || 0);
  res.json({ success: true, id: Number(resInsert.lastInsertRowid) });
});

router.post('/packages', authMiddleware, (req, res) => {
  const { product_id, name, description, price, savings_text } = req.body;
  const resInsert = db.prepare('INSERT INTO packages (product_id, name, description, price, savings_text) VALUES (?, ?, ?, ?, ?)')
    .run(product_id || 1, name, description, price, savings_text);
  res.json({ success: true, id: Number(resInsert.lastInsertRowid) });
});

router.delete('/packages/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// -------------------------------------------------------------
// 6. ORDERS
// -------------------------------------------------------------
router.get('/orders', authMiddleware, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, c.phone as customer_phone_db, c.problem as customer_problem
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    ORDER BY o.id DESC
  `).all();
  res.json({ success: true, orders });
});

router.put('/orders/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// -------------------------------------------------------------
// 7. LIVE INBOX & HUMAN HANDOVER
// -------------------------------------------------------------
router.get('/conversations', authMiddleware, (req, res) => {
  const conversations = db.prepare(`
    SELECT c.*, cust.name as customer_name, cust.phone as customer_phone,
           (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message,
           (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message_time
    FROM conversations c
    JOIN customers cust ON c.customer_id = cust.id
    ORDER BY c.updated_at DESC
  `).all();

  res.json({ success: true, conversations });
});

router.get('/conversations/:id/messages', authMiddleware, (req, res) => {
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ success: true, messages });
});

router.post('/conversations/:id/handover', authMiddleware, (req, res) => {
  const { enable } = req.body;
  if (enable) {
    triggerHumanHandover(req.params.id, 'Diambil alih oleh Admin melalui Dashboard');
  } else {
    resumeAiAutomation(req.params.id);
  }
  res.json({ success: true });
});

router.post('/conversations/:id/send', authMiddleware, async (req, res) => {
  const { text } = req.body;
  const conv = db.prepare('SELECT c.*, cust.phone FROM conversations c JOIN customers cust ON c.customer_id = cust.id WHERE c.id = ?').get(req.params.id);

  if (!conv) {
    return res.status(404).json({ success: false, error: 'Perbualan tidak dijumpai.' });
  }

  // Rekod mesej manual staf manusia
  db.prepare('INSERT INTO messages (conversation_id, sender_type, text, intent) VALUES (?, "human", ?, "manual_agent")')
    .run(conv.id, text);

  // Cuba hantar melalui Meta Cloud API dahulu, atau Baileys jika Meta tiada token
  let sent = false;
  const metaConf = getMetaSettings();
  if (metaConf.accessToken && metaConf.phoneNumberId) {
    sent = await sendMetaWhatsAppMessage(conv.phone, text);
  } else if (baileysState.status === 'connected') {
    try {
      sent = await sendBaileysMessage(conv.phone, text);
    } catch (_) {}
  }

  res.json({ success: true, delivered: sent });
});

// -------------------------------------------------------------
// 8. ANALYTICS
// -------------------------------------------------------------
router.get('/analytics', authMiddleware, (req, res) => {
  const totalConversations = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
  const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
  const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'confirmed'").get().count;
  const totalRevenue = db.prepare("SELECT SUM(total_price) as sum FROM orders WHERE status = 'confirmed'").get().sum || 0;
  const handoverCount = db.prepare('SELECT COUNT(*) as count FROM conversations WHERE handover_to_human = 1').get().count;

  const intentStats = db.prepare(`
    SELECT intent, COUNT(*) as count 
    FROM messages 
    WHERE sender_type = 'customer' AND intent IS NOT NULL 
    GROUP BY intent 
    ORDER BY count DESC
  `).all();

  const conversionRate = totalConversations > 0 ? ((totalOrders / totalConversations) * 100).toFixed(1) : 0;

  res.json({
    success: true,
    metrics: {
      totalConversations,
      totalCustomers,
      totalOrders,
      totalRevenue,
      handoverCount,
      conversionRate: `${conversionRate}%`
    },
    intentStats
  });
});

// -------------------------------------------------------------
// 9. SETTINGS & SYSTEM STATUS
// -------------------------------------------------------------
router.get('/settings', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json({ success: true, settings });
});

router.post('/settings', authMiddleware, (req, res) => {
  const settings = req.body;
  const upsert = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  for (const [key, value] of Object.entries(settings)) {
    upsert.run(key, String(value));
  }

  res.json({ success: true });
});

router.get('/system/status', (req, res) => {
  const activeFlow = getActivePublishedFlow();
  const metaConf = getMetaSettings();

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: 'sqlite_wal_persistent',
    publishedFlow: activeFlow ? { id: activeFlow.id, name: activeFlow.name, version: activeFlow.version } : null,
    metaCloudApi: {
      configured: Boolean(metaConf.accessToken && metaConf.phoneNumberId),
      webhookPath: '/webhook',
      verifyToken: metaConf.verifyToken
    },
    baileys: {
      status: baileysState.status,
      qrDataUrl: baileysState.qrDataUrl,
      user: baileysState.user
    }
  });
});

export default router;
