/**
 * Logik Papan Pemuka Pengeluaran AutoBot WSZia (Production SPA Frontend)
 */

let authToken = localStorage.getItem('autobot_token') || '';
let currentFlow = null;
let currentFlowSteps = [];
let activeInboxConvId = null;

// Helper Fetch dengan Auth Token
async function apiFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(endpoint, options);
  if (res.status === 401 || res.status === 403) {
    showLoginModal();
    throw new Error('Sesi anda telah tamat. Sila log masuk semula.');
  }
  return res.json();
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.style.background = isError ? '#ef4444' : '#0f172a';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -------------------------------------------------------------
// 1. PENGESAHAN PENTADBIR (AUTH)
// -------------------------------------------------------------
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');

function showLoginModal() {
  loginModal.classList.remove('hidden');
}

function hideLoginModal() {
  loginModal.classList.add('hidden');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      localStorage.setItem('autobot_token', authToken);
      hideLoginModal();
      showToast('Log masuk berjaya! Selamat kembali.');
      initDashboard();
    } else {
      showToast(data.error || 'Log masuk gagal', true);
    }
  } catch (err) {
    showToast('Ralat sambungan: ' + err.message, true);
  }
});

document.getElementById('btnLogout').addEventListener('click', () => {
  authToken = '';
  localStorage.removeItem('autobot_token');
  showLoginModal();
});

// -------------------------------------------------------------
// 2. NAVIGASI TAB
// -------------------------------------------------------------
const navBtns = document.querySelectorAll('.nav-btn');
const viewPanels = document.querySelectorAll('.view-panel');
const headerTitle = document.getElementById('headerTitle');
const headerSubtitle = document.getElementById('headerSubtitle');

const TAB_TITLES = {
  'tab-overview': { title: 'Ringkasan & Analitik Prestasi', sub: 'Pantau interaksi jualan, niat pelanggan, dan kadar penukaran pesanan.' },
  'tab-flow-builder': { title: 'Closing Flow Builder (Visual)', sub: 'Bina dan sunting aliran jualan berperingkat dengan percabangan bersyarat.' },
  'tab-simulator': { title: 'Simulator Ujian AI (Sandbox)', sub: 'Uji respon bot dengan senario sebenar tanpa menghubungi pelanggan WhatsApp.' },
  'tab-scripts': { title: 'Pengurusan Skrip Penutup Jualan', sub: 'Urus variasi teknik Soft Close, Direct Close, dan Choice Close.' },
  'tab-orders': { title: 'Pengurusan Tempahan Pelanggan', sub: 'Semak dan sahkan tempahan yang ditutup oleh AI.' },
  'tab-inbox': { title: 'Kotak Masuk & Serahan Manusia (Handover)', sub: 'Pantau sembang langsung dan ambil alih perbualan daripada bot.' },
  'tab-products': { title: 'Katalog Produk & Pakej', sub: 'Tetapkan maklumat produk, harga pakej, dan tawaran promosi.' },
  'tab-settings': { title: 'WhatsApp 24/7 & Konfigurasi Sistem', sub: 'Urus Webhook Meta Cloud API kekal dan tetapan model AI.' }
};

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    viewPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const target = btn.getAttribute('data-tab');
    document.getElementById(target).classList.add('active');

    if (TAB_TITLES[target]) {
      headerTitle.innerText = TAB_TITLES[target].title;
      headerSubtitle.innerText = TAB_TITLES[target].sub;
    }

    if (target === 'tab-overview') loadAnalytics();
    if (target === 'tab-flow-builder') loadFlows();
    if (target === 'tab-scripts') loadClosingScripts();
    if (target === 'tab-orders') loadOrders();
    if (target === 'tab-inbox') loadConversations();
    if (target === 'tab-products') loadProducts();
    if (target === 'tab-settings') loadSettings();
  });
});

// -------------------------------------------------------------
// 3. OVERVIEW & ANALYTICS
// -------------------------------------------------------------
async function loadAnalytics() {
  try {
    const data = await apiFetch('/api/analytics');
    if (data.success) {
      document.getElementById('statConversations').innerText = data.metrics.totalConversations;
      document.getElementById('statOrders').innerText = data.metrics.totalOrders;
      document.getElementById('statRevenue').innerText = `RM${data.metrics.totalRevenue.toFixed(2)}`;
      document.getElementById('statConversion').innerText = data.metrics.conversionRate;

      const tbody = document.getElementById('intentTableBody');
      tbody.innerHTML = '';
      const totalIntents = data.intentStats.reduce((sum, item) => sum + item.count, 0) || 1;

      data.intentStats.forEach(item => {
        const percent = ((item.count / totalIntents) * 100).toFixed(1);
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${escapeHtml(item.intent)}</strong></td>
          <td>${item.count}</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="progress-bar" style="width: 100px;"><div class="fill" style="width: ${percent}%"></div></div>
              <span>${percent}%</span>
            </div>
          </td>
        `;
        tbody.appendChild(row);
      });

      if (data.intentStats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada rekod mesej masuk lagi.</td></tr>';
      }
    }
  } catch (err) {
    console.error('Ralat analitik:', err);
  }
}

// -------------------------------------------------------------
// 4. CLOSING FLOW BUILDER
// -------------------------------------------------------------
const flowVersionSelect = document.getElementById('flowVersionSelect');
const flowStepsPipeline = document.getElementById('flowStepsPipeline');
const flowStatusBadge = document.getElementById('flowStatusBadge');

async function loadFlows() {
  try {
    const data = await apiFetch('/api/flows');
    if (data.success) {
      flowVersionSelect.innerHTML = '';
      data.flows.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.innerText = `${f.name} (v${f.version}) - ${f.status.toUpperCase()}`;
        if (f.status === 'published') opt.selected = true;
        flowVersionSelect.appendChild(opt);
      });

      const selectedId = flowVersionSelect.value || data.flows[0]?.id;
      if (selectedId) loadFlowDetails(selectedId);
    }
  } catch (err) {
    console.error('Ralat memuatkan flows:', err);
  }
}

flowVersionSelect.addEventListener('change', () => {
  loadFlowDetails(flowVersionSelect.value);
});

async function loadFlowDetails(flowId) {
  try {
    const data = await apiFetch(`/api/flows/${flowId}`);
    if (data.success) {
      currentFlow = data.flow;
      currentFlowSteps = data.flow.steps || [];

      flowStatusBadge.innerText = currentFlow.status === 'published' ? 'Live (Published)' : 'Draft (Draf)';
      flowStatusBadge.className = currentFlow.status === 'published' ? 'badge badge-published' : 'badge badge-draft';

      renderFlowSteps();
    }
  } catch (err) {
    showToast('Gagal memuatkan flow: ' + err.message, true);
  }
}

function renderFlowSteps() {
  flowStepsPipeline.innerHTML = '';

  currentFlowSteps.forEach((step, index) => {
    const card = document.createElement('div');
    card.className = `flow-card ${step.isEnabled === false ? 'disabled' : ''}`;
    card.id = `step-card-${index}`;

    card.innerHTML = `
      <div class="flow-card-header">
        <div class="flow-card-title">
          <span class="step-num-badge">#${index + 1}</span>
          <input type="text" class="form-control" style="font-weight:700; width: 280px;" value="${escapeHtml(step.name || '')}" onchange="updateStepField(${index}, 'name', this.value)">
          <span class="badge ${step.isEnabled !== false ? 'badge-success' : 'badge-warning'}">${step.isEnabled !== false ? 'Aktif' : 'Nyahaktif'}</span>
        </div>
        <div class="flow-card-actions">
          <button class="btn btn-outline-secondary btn-sm" onclick="moveStep(${index}, -1)" ${index === 0 ? 'disabled' : ''}>⬆️</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="moveStep(${index}, 1)" ${index === currentFlowSteps.length - 1 ? 'disabled' : ''}>⬇️</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="duplicateStep(${index})">📋 Duplikasi</button>
          <button class="btn btn-outline-danger btn-sm" onclick="deleteStep(${index})">🗑️ Padam</button>
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label>ID Langkah (Unique ID):</label>
          <input type="text" class="form-control" value="${escapeHtml(step.id || '')}" onchange="updateStepField(${index}, 'id', this.value)">
        </div>

        <div class="form-group">
          <label>Pencetus / Syarat Pengaktifan (Trigger Intent):</label>
          <select class="form-control" onchange="updateStepField(${index}, 'triggerCondition', this.value)">
            <option value="always" ${step.triggerCondition === 'always' ? 'selected' : ''}>Sentiasa / Aliran Asas (Always)</option>
            <option value="new_customer" ${step.triggerCondition === 'new_customer' ? 'selected' : ''}>Pelanggan Baru (Salam / Hai)</option>
            <option value="product_inquiry" ${step.triggerCondition === 'product_inquiry' ? 'selected' : ''}>Tanya Masalah & Produk</option>
            <option value="price_inquiry" ${step.triggerCondition === 'price_inquiry' ? 'selected' : ''}>Tanya Harga & Pakej</option>
            <option value="objection" ${step.triggerCondition === 'objection' ? 'selected' : ''}>Bantahan / Kata Mahal</option>
            <option value="buying_intent" ${step.triggerCondition === 'buying_intent' ? 'selected' : ''}>Niat Membeli (Nak Beli)</option>
            <option value="ready_to_order" ${step.triggerCondition === 'ready_to_order' ? 'selected' : ''}>Kumpul Alamat & Data</option>
          </select>
        </div>

        <div class="form-group">
          <label>Langkah Seterusnya (Next Step ID):</label>
          <input type="text" class="form-control" value="${escapeHtml(step.nextStepId || '')}" onchange="updateStepField(${index}, 'nextStepId', this.value)" placeholder="cth: step_recommend_package">
        </div>
      </div>

      <div class="form-group mt-3">
        <label>Objektif Langkah (Sales Objective):</label>
        <input type="text" class="form-control" value="${escapeHtml(step.objective || '')}" onchange="updateStepField(${index}, 'objective', this.value)">
      </div>

      <div class="form-group mt-3">
        <label>Arahan AI (AI Instruction / Guidance):</label>
        <textarea class="form-control" rows="2" onchange="updateStepField(${index}, 'aiInstruction', this.value)">${escapeHtml(step.aiInstruction || '')}</textarea>
      </div>

      <div class="form-group mt-3">
        <label>Contoh Skrip Balasan (Example Script):</label>
        <textarea class="form-control" rows="3" onchange="updateStepField(${index}, 'exampleScript', this.value)">${escapeHtml(step.exampleScript || '')}</textarea>
      </div>
    `;

    flowStepsPipeline.appendChild(card);
  });
}

window.updateStepField = function(index, field, value) {
  if (currentFlowSteps[index]) {
    currentFlowSteps[index][field] = value;
  }
};

window.moveStep = function(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= currentFlowSteps.length) return;
  const temp = currentFlowSteps[index];
  currentFlowSteps[index] = currentFlowSteps[targetIndex];
  currentFlowSteps[targetIndex] = temp;
  renderFlowSteps();
};

window.duplicateStep = function(index) {
  const cloned = JSON.parse(JSON.stringify(currentFlowSteps[index]));
  cloned.id = `${cloned.id}_copy_${Date.now() % 1000}`;
  cloned.name = `${cloned.name} (Salinan)`;
  currentFlowSteps.splice(index + 1, 0, cloned);
  renderFlowSteps();
  showToast('Langkah diduplikasi.');
};

window.deleteStep = function(index) {
  if (confirm(`Adakah anda pasti mahu memadam langkah #${index + 1}?`)) {
    currentFlowSteps.splice(index, 1);
    renderFlowSteps();
    showToast('Langkah dipadam.');
  }
};

document.getElementById('btnAddNewStep').addEventListener('click', () => {
  const newNum = currentFlowSteps.length + 1;
  currentFlowSteps.push({
    id: `step_custom_${Date.now() % 10000}`,
    name: `${newNum}. Langkah Baharu`,
    objective: 'Objektif langkah ini...',
    aiInstruction: 'Panduan arahan kepada AI...',
    exampleScript: 'Contoh ayat balasan kepada pelanggan...',
    triggerCondition: 'always',
    nextStepId: null,
    isEnabled: true
  });
  renderFlowSteps();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  showToast('Langkah baharu ditambah.');
});

document.getElementById('btnSaveFlowDraft').addEventListener('click', async () => {
  if (!currentFlow) return;
  try {
    const res = await apiFetch(`/api/flows/${currentFlow.id}`, {
      method: 'PUT',
      body: { name: currentFlow.name, steps: currentFlowSteps }
    });
    if (res.success) {
      showToast('✅ Draf Closing Flow berjaya disimpan!');
    }
  } catch (err) {
    showToast('Gagal menyimpan draf: ' + err.message, true);
  }
});

document.getElementById('btnPublishFlow').addEventListener('click', async () => {
  if (!currentFlow) return;
  if (confirm(`Adakah anda pasti mahu menerbitkan (Publish Live) versi ini? Versi ini akan digunakan serta-merta oleh semua pelanggan WhatsApp sebenar 24/7.`)) {
    try {
      // Simpan draf dahulu
      await apiFetch(`/api/flows/${currentFlow.id}`, {
        method: 'PUT',
        body: { name: currentFlow.name, steps: currentFlowSteps }
      });
      // Terbitkan
      const res = await apiFetch(`/api/flows/${currentFlow.id}/publish`, { method: 'POST' });
      if (res.success) {
        showToast('🚀 TAHNIAH! Flow telah diterbitkan secara LANGSUNG (LIVE)!');
        loadFlows();
      }
    } catch (err) {
      showToast('Gagal menerbitkan flow: ' + err.message, true);
    }
  }
});

document.getElementById('btnDuplicateFlow').addEventListener('click', async () => {
  if (!currentFlow) return;
  try {
    const res = await apiFetch(`/api/flows/${currentFlow.id}/duplicate`, { method: 'POST' });
    if (res.success) {
      showToast('Versi baharu flow berjaya dicipta.');
      loadFlows();
    }
  } catch (err) {
    showToast('Gagal duplikasi: ' + err.message, true);
  }
});

// -------------------------------------------------------------
// 5. SIMULATOR UJIAN AI
// -------------------------------------------------------------
const simulatorMessagesBox = document.getElementById('simulatorMessagesBox');
const simulatorForm = document.getElementById('simulatorForm');
const simulatorInput = document.getElementById('simulatorInput');
const simulatorInspectorJson = document.getElementById('simulatorInspectorJson');

simulatorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = simulatorInput.value.trim();
  if (!text) return;

  appendChatBubble('customer', 'Pelanggan (Ujian)', text);
  simulatorInput.value = '';

  try {
    const data = await apiFetch('/api/simulator/chat', {
      method: 'POST',
      body: { message: text, flowSteps: currentFlowSteps }
    });

    if (data.success) {
      appendChatBubble(
        'ai',
        'AutoBot WSZia (AI)',
        data.reply,
        `Step: ${data.currentStep?.id || '-'} | Intent: ${data.intent} ${data.handover ? '| 🚨 HANDOVER' : ''}`
      );

      simulatorInspectorJson.innerText = JSON.stringify({
        intent: data.intent,
        currentStep: data.currentStep?.name,
        nextStepId: data.nextStepId,
        extractedEntities: data.extractedEntities,
        handoverToHuman: data.handover
      }, null, 2);
    }
  } catch (err) {
    appendChatBubble('ai', 'Sistem (Ralat)', err.message);
  }
});

function appendChatBubble(type, sender, text, meta = '') {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${type}`;
  bubble.innerHTML = `
    <div class="bubble-sender">${escapeHtml(sender)}</div>
    <div class="bubble-text">${escapeHtml(text)}</div>
    ${meta ? `<div class="bubble-meta">${escapeHtml(meta)}</div>` : ''}
  `;
  simulatorMessagesBox.appendChild(bubble);
  simulatorMessagesBox.scrollTop = simulatorMessagesBox.scrollHeight;
}

document.querySelectorAll('.scenario-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    simulatorInput.value = btn.getAttribute('data-msg');
    simulatorForm.dispatchEvent(new Event('submit'));
  });
});

document.getElementById('btnResetSimulator').addEventListener('click', () => {
  simulatorMessagesBox.innerHTML = `
    <div class="chat-bubble ai">
      <div class="bubble-sender">AutoBot WSZia (AI)</div>
      <div class="bubble-text">Waalaikumussalam dan salam sejahtera! 👋 Terima kasih kerana menghubungi kami. Boleh saya tahu dengan siapa saya berhubung?</div>
      <div class="bubble-meta">Step: step_greeting | Intent: new_customer</div>
    </div>
  `;
  simulatorInspectorJson.innerText = 'Sembang telah diset semula. Pilih senario untuk mula menguji.';
});

// -------------------------------------------------------------
// 6. CLOSING SCRIPTS
// -------------------------------------------------------------
async function loadClosingScripts() {
  try {
    const data = await apiFetch('/api/closing-scripts');
    if (data.success) {
      const grid = document.getElementById('closingScriptsGrid');
      grid.innerHTML = '';

      data.scripts.forEach(script => {
        const card = document.createElement('div');
        card.className = 'script-card';
        card.innerHTML = `
          <div>
            <div class="card-head">
              <strong>${escapeHtml(script.name)}</strong>
              <span class="badge ${script.is_active ? 'badge-success' : 'badge-warning'}">${script.type.toUpperCase()}</span>
            </div>
            <div class="script-text-box">"${escapeHtml(script.script_text)}"</div>
            <small class="text-muted">Pencetus Niat: <code>${escapeHtml(script.trigger_intent || 'buying_intent')}</code></small>
          </div>
          <div class="mt-3" style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-outline-danger btn-sm" onclick="deleteScript(${script.id})">Padam</button>
          </div>
        `;
        grid.appendChild(card);
      });
    }
  } catch (err) {
    console.error('Ralat memuatkan skrip:', err);
  }
}

window.deleteScript = async function(id) {
  if (confirm('Padam skrip penutup ini?')) {
    await apiFetch(`/api/closing-scripts/${id}`, { method: 'DELETE' });
    loadClosingScripts();
    showToast('Skrip dipadam.');
  }
};

document.getElementById('btnCreateScriptModal').addEventListener('click', async () => {
  const name = prompt('Nama Skrip: (cth: Choice Close - Pos Percuma)');
  if (!name) return;
  const script_text = prompt('Ayat Skrip: (Gunakan {{customer_name}}, {{package_name}}, dsb.)');
  if (!script_text) return;

  await apiFetch('/api/closing-scripts', {
    method: 'POST',
    body: { name, type: 'choice_close', script_text, trigger_intent: 'buying_intent' }
  });
  loadClosingScripts();
  showToast('Skrip penutup berjaya ditambah!');
});

// -------------------------------------------------------------
// 7. ORDERS
// -------------------------------------------------------------
async function loadOrders() {
  try {
    const data = await apiFetch('/api/orders');
    if (data.success) {
      const tbody = document.getElementById('ordersTableBody');
      tbody.innerHTML = '';

      data.orders.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>#${o.id}</td>
          <td><strong>${escapeHtml(o.customer_name || 'Pelanggan')}</strong><br><small>${escapeHtml(o.customer_phone || '-')}</small></td>
          <td>${escapeHtml(o.package_name)}</td>
          <td>${o.quantity} unit</td>
          <td><strong>RM${o.total_price.toFixed(2)}</strong></td>
          <td><small>${escapeHtml(o.customer_address || '(Belum disediakan)')}</small></td>
          <td><span class="badge ${o.status === 'confirmed' ? 'badge-success' : 'badge-warning'}">${o.status}</span></td>
          <td>
            ${o.status === 'pending_confirmation' ? `<button class="btn btn-success btn-sm" onclick="updateOrderStatus(${o.id}, 'confirmed')">Sahkan</button>` : ''}
            ${o.status === 'confirmed' ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${o.id}, 'completed')">Selesai</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });

      if (data.orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada tempahan direkodkan.</td></tr>';
      }
    }
  } catch (err) {
    console.error('Ralat tempahan:', err);
  }
}

window.updateOrderStatus = async function(id, status) {
  await apiFetch(`/api/orders/${id}/status`, { method: 'PUT', body: { status } });
  loadOrders();
  showToast(`Status tempahan #${id} dikemaskini kepada ${status}.`);
};

document.getElementById('btnRefreshOrders').addEventListener('click', loadOrders);

// -------------------------------------------------------------
// 8. LIVE INBOX & HUMAN HANDOVER
// -------------------------------------------------------------
async function loadConversations() {
  try {
    const data = await apiFetch('/api/conversations');
    if (data.success) {
      const list = document.getElementById('inboxList');
      list.innerHTML = '';

      data.conversations.forEach(c => {
        const div = document.createElement('div');
        div.className = `inbox-item ${c.id === activeInboxConvId ? 'active' : ''}`;
        div.onclick = () => selectConversation(c);

        div.innerHTML = `
          <div class="inbox-item-top">
            <strong>${escapeHtml(c.customer_name || 'Pelanggan')}</strong>
            ${c.handover_to_human ? '<span class="badge badge-danger">MANUSIA</span>' : '<span class="badge badge-success">AI</span>'}
          </div>
          <small class="text-muted">${escapeHtml(c.customer_phone)}</small>
          <p style="font-size:12px; margin-top:4px; color:#475569; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
            ${escapeHtml(c.last_message || 'Tiada mesej')}
          </p>
        `;
        list.appendChild(div);
      });

      if (data.conversations.length === 0) {
        list.innerHTML = '<p class="text-muted text-center p-4">Tiada perbualan aktif lagi.</p>';
      }
    }
  } catch (err) {
    console.error('Ralat inbox:', err);
  }
}

async function selectConversation(conv) {
  activeInboxConvId = conv.id;
  document.getElementById('inboxActiveName').innerText = conv.customer_name || 'Pelanggan';
  document.getElementById('inboxActivePhone').innerText = conv.customer_phone;

  const handoverContainer = document.getElementById('inboxHandoverAction');
  if (conv.handover_to_human) {
    handoverContainer.innerHTML = `
      <button class="btn btn-success btn-sm" onclick="toggleHandover(${conv.id}, false)">
        🤖 Kembalikan kepada Automasi AI
      </button>
    `;
  } else {
    handoverContainer.innerHTML = `
      <button class="btn btn-warning btn-sm" onclick="toggleHandover(${conv.id}, true)">
        👨‍💼 Ambil Alih (Pause AI)
      </button>
    `;
  }

  document.getElementById('inboxReplyInput').disabled = false;
  document.getElementById('btnInboxSend').disabled = false;

  // Muat mesej
  const res = await apiFetch(`/api/conversations/${conv.id}/messages`);
  if (res.success) {
    const body = document.getElementById('inboxMessagesBody');
    body.innerHTML = '';
    res.messages.forEach(m => {
      const b = document.createElement('div');
      b.className = `chat-bubble ${m.sender_type === 'customer' ? 'customer' : 'ai'}`;
      b.innerHTML = `
        <div class="bubble-sender">${m.sender_type === 'customer' ? 'Pelanggan' : (m.sender_type === 'human' ? 'Pegawai Khidmat Pelanggan' : 'AutoBot AI')}</div>
        <div class="bubble-text">${escapeHtml(m.text)}</div>
        <div class="bubble-meta">${m.created_at}</div>
      `;
      body.appendChild(b);
    });
    body.scrollTop = body.scrollHeight;
  }
}

window.toggleHandover = async function(convId, enable) {
  await apiFetch(`/api/conversations/${convId}/handover`, { method: 'POST', body: { enable } });
  showToast(enable ? 'Perbualan diambil alih oleh staf manusia. AI dihentikan.' : 'Automasi AI diaktifkan semula.');
  loadConversations();
};

document.getElementById('inboxReplyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('inboxReplyInput');
  const text = input.value.trim();
  if (!text || !activeInboxConvId) return;

  input.value = '';
  await apiFetch(`/api/conversations/${activeInboxConvId}/send`, { method: 'POST', body: { text } });
  showToast('Mesej manual dihantar.');
  const conv = { id: activeInboxConvId, customer_name: document.getElementById('inboxActiveName').innerText, customer_phone: document.getElementById('inboxActivePhone').innerText, handover_to_human: 1 };
  selectConversation(conv);
});

// -------------------------------------------------------------
// 9. PRODUCTS & PACKAGES
// -------------------------------------------------------------
async function loadProducts() {
  try {
    const data = await apiFetch('/api/products');
    if (data.success) {
      if (data.products[0]) {
        document.getElementById('inputProductName').value = data.products[0].name;
        document.getElementById('inputProductDesc').value = data.products[0].description;
        document.getElementById('inputProductPrice').value = data.products[0].base_price;
      }

      const pkgList = document.getElementById('packagesList');
      pkgList.innerHTML = '';
      data.packages.forEach(p => {
        const item = document.createElement('div');
        item.className = 'metric-card mb-2';
        item.style.padding = '12px';
        item.innerHTML = `
          <div class="card-head">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="badge badge-success">RM${p.price.toFixed(2)}</span>
          </div>
          <small class="text-muted">${escapeHtml(p.description)} (${escapeHtml(p.savings_text || '')})</small>
        `;
        pkgList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Ralat produk:', err);
  }
}

// -------------------------------------------------------------
// 10. SETTINGS & SYSTEM STATUS
// -------------------------------------------------------------
async function loadSettings() {
  try {
    const data = await apiFetch('/api/settings');
    const statusData = await fetch('/api/system/status').then(r => r.json());

    document.getElementById('cfgWebhookUrl').value = `${window.location.origin}/webhook`;

    if (data.success) {
      document.getElementById('cfgVerifyToken').value = data.settings.meta_verify_token || '';
      document.getElementById('cfgAccessToken').value = data.settings.meta_access_token || '';
      document.getElementById('cfgPhoneNumberId').value = data.settings.meta_phone_number_id || '';
      document.getElementById('cfgGeminiKey').value = data.settings.ai_api_key || '';
      document.getElementById('cfgSystemPrompt').value = data.settings.system_prompt_guidelines || '';
    }

    // Baileys QR / Status
    const qrWrapper = document.getElementById('baileysQrWrapper');
    const acctInfo = document.getElementById('baileysAccountInfo');

    if (statusData.baileys?.status === 'connected') {
      qrWrapper.innerHTML = '<h4>✅ Sesi Baileys Tersambung</h4><p class="text-muted">Nombor: +' + (statusData.baileys.user?.id?.split(':')[0] || 'Aktif') + '</p>';
      acctInfo.classList.remove('hidden');
    } else if (statusData.baileys?.qrDataUrl) {
      qrWrapper.innerHTML = `
        <p class="mb-2"><strong>Imbas Kod QR dengan Telefon:</strong></p>
        <img src="${statusData.baileys.qrDataUrl}" style="max-width: 220px; border-radius: 8px;" alt="QR" />
      `;
      acctInfo.classList.add('hidden');
    } else {
      qrWrapper.innerHTML = '<p class="text-muted">Sedang memulakan atau menunggu sambungan...</p>';
    }
  } catch (err) {
    console.error('Ralat tetapan:', err);
  }
}

document.getElementById('metaSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await apiFetch('/api/settings', {
    method: 'POST',
    body: {
      meta_verify_token: document.getElementById('cfgVerifyToken').value,
      meta_access_token: document.getElementById('cfgAccessToken').value,
      meta_phone_number_id: document.getElementById('cfgPhoneNumberId').value
    }
  });
  showToast('Konfigurasi Meta WhatsApp berjaya disimpan.');
});

document.getElementById('aiSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await apiFetch('/api/settings', {
    method: 'POST',
    body: {
      ai_api_key: document.getElementById('cfgGeminiKey').value,
      system_prompt_guidelines: document.getElementById('cfgSystemPrompt').value
    }
  });
  showToast('Tetapan AI berjaya dikemaskini.');
});

// Permulaan Aplikasi
function initDashboard() {
  loadAnalytics();
}

if (!authToken) {
  showLoginModal();
} else {
  initDashboard();
}
