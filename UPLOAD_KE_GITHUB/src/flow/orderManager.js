/**
 * Modul Pengurusan Pesanan & Serahan Manusia (Order Flow & Human Handover)
 */

import db from '../db/database.js';

export function getOrCreateCustomer(phone, initialData = {}) {
  const select = db.prepare('SELECT * FROM customers WHERE phone = ?');
  let customer = select.get(phone);

  if (!customer) {
    const insert = db.prepare(`
      INSERT INTO customers (phone, name, problem, package_interest, address, status)
      VALUES (?, ?, ?, ?, ?, 'lead')
    `);
    const res = insert.run(
      phone,
      initialData.name || null,
      initialData.problem || null,
      initialData.package_interest || null,
      initialData.address || null
    );
    customer = select.get(phone);
  } else {
    // Kemaskini entiti yang baru diperolehi
    const updates = [];
    const params = [];

    if (initialData.name && !customer.name) {
      updates.push('name = ?');
      params.push(initialData.name);
    }
    if (initialData.problem && !customer.problem) {
      updates.push('problem = ?');
      params.push(initialData.problem);
    }
    if (initialData.package_interest) {
      updates.push('package_interest = ?');
      params.push(initialData.package_interest);
    }
    if (initialData.address) {
      updates.push('address = ?');
      params.push(initialData.address);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(customer.id);
      db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      customer = select.get(phone);
    }
  }

  return customer;
}

export function getOrCreateConversation(customerId) {
  const select = db.prepare('SELECT * FROM conversations WHERE customer_id = ? ORDER BY id DESC LIMIT 1');
  let conv = select.get(customerId);

  if (!conv) {
    // Ambil published flow id
    const flow = db.prepare("SELECT id FROM closing_flows WHERE status = 'published' ORDER BY version DESC LIMIT 1").get();
    const flowId = flow ? flow.id : 1;

    const insert = db.prepare(`
      INSERT INTO conversations (customer_id, current_step_id, current_flow_id, variables_json)
      VALUES (?, 'step_greeting', ?, '{}')
    `);
    insert.run(customerId, flowId);
    conv = select.get(customerId);
  }

  return conv;
}

// Cipta atau Kemaskini Tempahan Baharu
export function recordOrUpdateOrder(customerId, orderData) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

  const existingOrder = db.prepare(`
    SELECT * FROM orders 
    WHERE customer_id = ? AND status IN ('pending_confirmation', 'confirmed')
    ORDER BY id DESC LIMIT 1
  `).get(customerId);

  const pkgName = orderData.package_name || customer.package_interest || 'Pakej Rawatan Jimat (2 Botol)';
  const pkgRow = db.prepare('SELECT price FROM packages WHERE name = ?').get(pkgName);
  const price = pkgRow ? pkgRow.price : (pkgName.includes('1') ? 70.00 : 120.00);

  if (existingOrder && existingOrder.status === 'pending_confirmation') {
    db.prepare(`
      UPDATE orders 
      SET package_name = ?, quantity = ?, total_price = ?, customer_name = ?, customer_address = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      pkgName,
      orderData.quantity || 1,
      price * (orderData.quantity || 1),
      orderData.name || customer.name,
      orderData.address || customer.address,
      existingOrder.id
    );
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(existingOrder.id);
  } else {
    const insert = db.prepare(`
      INSERT INTO orders (customer_id, package_name, quantity, total_price, customer_name, customer_phone, customer_address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_confirmation')
    `);
    const res = insert.run(
      customerId,
      pkgName,
      orderData.quantity || 1,
      price * (orderData.quantity || 1),
      orderData.name || customer.name,
      customer.phone,
      orderData.address || customer.address
    );
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(res.lastInsertRowid));
  }
}

// Pengesahan Muktamad Tempahan
export function finalizeOrder(customerId) {
  const pendingOrder = db.prepare(`
    SELECT * FROM orders 
    WHERE customer_id = ? AND status = 'pending_confirmation'
    ORDER BY id DESC LIMIT 1
  `).get(customerId);

  if (pendingOrder) {
    db.prepare(`
      UPDATE orders 
      SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(pendingOrder.id);

    db.prepare(`UPDATE customers SET status = 'customer' WHERE id = ?`).run(customerId);
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(pendingOrder.id);
  }

  return null;
}

// Serahan Ejen Manusia (Human Handover)
export function triggerHumanHandover(conversationId, reason = 'Permintaan pelanggan') {
  db.prepare(`
    UPDATE conversations 
    SET handover_to_human = 1, handover_reason = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(reason, conversationId);

  console.log(`[HANDOVER] Perbualan ID #${conversationId} telah diserahkan kepada staf manusia. Sebab: ${reason}`);
}

export function resumeAiAutomation(conversationId) {
  db.prepare(`
    UPDATE conversations 
    SET handover_to_human = 0, handover_reason = NULL, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(conversationId);

  console.log(`[HANDOVER] Automasi AI diaktifkan semula untuk perbualan ID #${conversationId}`);
}
