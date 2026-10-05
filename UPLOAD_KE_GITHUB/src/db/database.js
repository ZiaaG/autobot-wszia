import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pastikan folder data wujud untuk storan kekal
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'autobot_production.db');
const db = new DatabaseSync(dbPath);

// Aktifkan mod WAL (Write-Ahead Logging) untuk prestasi tinggi & kestabilan data 24/7
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

console.log(`[PANGKALAN DATA] SQLite Persistent Storage dimuatkan: ${dbPath}`);

// Skema Jadual Pengeluaran
function initializeDatabase() {
  db.exec(`
    -- Jadual Pentadbir (Admin)
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Jadual Produk
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      base_price REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Jadual Pakej Produk
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      savings_text TEXT,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Jadual Pelanggan (Customer Profile & Memory)
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      problem TEXT,
      package_interest TEXT,
      address TEXT,
      status TEXT DEFAULT 'lead',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Jadual Sesi Perbualan
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      channel TEXT DEFAULT 'whatsapp',
      current_step_id TEXT DEFAULT 'step_greeting',
      current_flow_id INTEGER,
      variables_json TEXT DEFAULT '{}',
      handover_to_human INTEGER DEFAULT 0,
      handover_reason TEXT,
      last_intent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    -- Jadual Mesej (Chat History)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL, -- 'customer', 'ai', 'human'
      text TEXT NOT NULL,
      intent TEXT,
      step_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Jadual Closing Flow (Visual Flow Engine)
    CREATE TABLE IF NOT EXISTS closing_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT DEFAULT 'draft', -- 'draft', 'published', 'archived'
      steps_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Jadual Skrip Penutup (Closing Scripts)
    CREATE TABLE IF NOT EXISTS closing_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'soft_close', 'direct_close', 'choice_close', 'urgency_close'
      script_text TEXT NOT NULL,
      trigger_intent TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Jadual Pesanan (Orders)
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      package_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      total_price REAL NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      status TEXT DEFAULT 'pending_confirmation', -- 'pending_confirmation', 'confirmed', 'processing', 'completed', 'cancelled'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    -- Jadual Tetapan Sistem
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedDefaultData();
}

function seedDefaultData() {
  // 1. Seed Admin Default
  const adminCheck = db.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
  if (!adminCheck) {
    const defaultPassword = 'admin123';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('admin', hash, 'superadmin');
    console.log('[SEED] Pentadbir lalai dicipta: username="admin", password="admin123"');
  }

  // 2. Seed Produk & Pakej
  const prodCheck = db.prepare('SELECT id FROM products LIMIT 1').get();
  let productId = 1;
  if (!prodCheck) {
    const insertProd = db.prepare(`
      INSERT INTO products (name, description, base_price, is_active)
      VALUES (?, ?, ?, 1)
    `);
    const prodResult = insertProd.run(
      'Minyak Herba / Jus Halia & Lemon WSZia',
      'Formulasi herba tradisional untuk membantu menyokong keselesaan perut kembung, membuang angin, dan melegakan ketidakhadaman.',
      70.00
    );
    productId = Number(prodResult.lastInsertRowid);

    const insertPkg = db.prepare(`
      INSERT INTO packages (product_id, name, description, price, savings_text, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertPkg.run(productId, 'Pakej Percubaan (1 Botol)', 'Sesuai untuk penggunaan selama 2 minggu.', 70.00, 'Jimat RM10');
    insertPkg.run(productId, 'Pakej Rawatan Jimat (2 Botol)', 'Pilihan paling popular untuk penggunaan sebulan.', 120.00, 'Paling Jimat - Diskaun RM20');
    insertPkg.run(productId, 'Pakej Keluarga Sihat (3 Botol + Percuma 1 Minyak Angin)', 'Rawatan lengkap sekeluarga.', 160.00, 'Jimat RM50 + Hadiah Percuma');
    console.log('[SEED] Produk dan Pakej lalai berjaya ditambah.');
  }

  // 3. Seed Closing Scripts
  const scriptCheck = db.prepare('SELECT id FROM closing_scripts LIMIT 1').get();
  if (!scriptCheck) {
    const insertScript = db.prepare(`
      INSERT INTO closing_scripts (name, type, script_text, trigger_intent, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    insertScript.run(
      'Soft Close - Tanya Pengalaman',
      'soft_close',
      'Kalau macam tu {{customer_name}}, awak nak cuba 1 botol dulu atau nak ambil pakej jimat 2 botol terus untuk nampak kesan lebih baik?',
      'buying_intent'
    );
    insertScript.run(
      'Direct Close - Terus Bantu Order',
      'direct_close',
      'Baik {{customer_name}}, saya bantu buatkan tempahan sekarang ya. Awak nak ambil Pakej 1 Botol (RM70) atau Pakej Paling Jimat 2 Botol (RM120)?',
      'ready_to_order'
    );
    insertScript.run(
      'Choice Close - Pilihan Berbaloi',
      'choice_close',
      'Untuk {{customer_name}}, awak rasa lebih selesa cuba 1 botol dulu (RM70) atau ambil 2 botol (RM120) yang percuma pos ke rumah?',
      'asking_for_discount'
    );
    insertScript.run(
      'Urgency Close - Stok Terhad',
      'urgency_close',
      'Hari ni kami ada promosi postage percuma untuk 10 orang terawal saja. Kalau {{customer_name}} nak, saya simpankan stok pakej 2 botol ya?',
      'objection'
    );
    console.log('[SEED] Skrip-skrip penutup lalai berjaya dicipta.');
  }

  // 4. Seed Closing Flow Versi 1 (Published)
  const flowCheck = db.prepare('SELECT id FROM closing_flows WHERE status = ?').get('published');
  if (!flowCheck) {
    const defaultSteps = [
      {
        id: 'step_greeting',
        name: '1. Greeting & Sambutan Mesra',
        objective: 'Menyambut pelanggan dengan sopan dan mesra.',
        aiInstruction: 'Sambut pelanggan dengan nama jika ada. Tanya khabar atau apa yang boleh dibantu secara bersahaja dan ramah.',
        exampleScript: 'Waalaikumussalam dan salam sejahtera! 👋 Terima kasih kerana menghubungi kami. Boleh saya tahu dengan siapa saya berhubung?',
        triggerCondition: 'new_customer',
        nextStepId: 'step_identify_problem',
        isEnabled: true
      },
      {
        id: 'step_identify_problem',
        name: '2. Kenalpasti Masalah Pelanggan',
        objective: 'Memahami simptom atau ketidakselesaan yang dialami pelanggan.',
        aiInstruction: 'Tanya soalan terbuka mengenai apa masalah kesihatan yang sedang mereka hadapi (cth: kembung, angin, gastrik). Dengarkan dengan penuh empati.',
        exampleScript: 'Biasanya awak selalu rasa perut kembung, banyak angin, sendawa atau dada rasa tak selesa?',
        triggerCondition: 'product_inquiry',
        nextStepId: 'step_qualify',
        isEnabled: true
      },
      {
        id: 'step_qualify',
        name: '3. Layakkan Pelanggan (Qualify)',
        objective: 'Mengetahui tempoh masa dan keterukan masalah pelanggan.',
        aiInstruction: 'Tanya sudah berapa lama mengalami masalah ini dan adakah sudah cuba rawatan lain sebelum ini.',
        exampleScript: 'Faham {{customer_name}}, masalah macam ni memang buat rasa serba tak kena. Dah berapa lama awak alami kembung perut ni?',
        triggerCondition: 'always',
        nextStepId: 'step_explain_product',
        isEnabled: true
      },
      {
        id: 'step_explain_product',
        name: '4. Penerangan Produk & Solusi',
        objective: 'Menerangkan bagaimana ramuan semulajadi membantu melegakan masalah.',
        aiInstruction: 'Terangkan produk secara ringkas menggunakan perkataan pematuhan seperti "membantu menyokong keselesaan" dan "membantu melegakan angin". JANGAN dakwa ubat ajaib atau sembuhkan penyakit kronik.',
        exampleScript: '{{product_name}} diformulasikan khas dengan ekstrak halia bara dan lemon untuk membantu melegakan angin degil dan menyokong keselesaan sistem penghadaman secara semulajadi.',
        triggerCondition: 'always',
        nextStepId: 'step_recommend_package',
        isEnabled: true
      },
      {
        id: 'step_recommend_package',
        name: '5. Cadangkan Pakej & Nilai',
        objective: 'Mencadangkan pakej yang paling sesuai dengan keperluan dan bajet.',
        aiInstruction: 'Beri cadangan pakej 2 botol kerana lebih jimat dan tempoh penggunaan lebih optimum. Nyatakan harga dengan jelas.',
        exampleScript: 'Untuk kesan yang lebih memuaskan, kami cadangkan {{package_name}} (RM120) yang cukup untuk sebulan dan jimat RM20!',
        triggerCondition: 'price_inquiry',
        nextStepId: 'step_handle_objection',
        isEnabled: true
      },
      {
        id: 'step_handle_objection',
        name: '6. Tangani Bantahan (Objection Handling)',
        objective: 'Menangani keraguan pelanggan seperti harga mahal atau was-was.',
        aiInstruction: 'Jika pelanggan kata mahal atau nak fikir dulu, akui kebimbangan mereka dengan sopan. Terangkan kualiti bahan dan tawarkan pakej 1 botol sebagai alternatif mudah mula.',
        exampleScript: 'Saya faham {{customer_name}}. Kesihatan dan keselesaan badan kita sangat penting. Kalau nak jimat, awak boleh cuba 1 botol dulu (RM70) untuk rasa keberkesanannya.',
        triggerCondition: 'objection',
        nextStepId: 'step_closing',
        isEnabled: true
      },
      {
        id: 'step_closing',
        name: '7. Penutup Jualan (Closing)',
        objective: 'Mendapatkan persetujuan pembelian dengan teknik pilihan.',
        aiInstruction: 'Gunakan teknik soft close atau choice close untuk menutup jualan. Tanya sama ada mahu pakej 1 atau 2 botol.',
        exampleScript: 'Jadi {{customer_name}}, awak nak cuba pakej 1 botol dulu atau terus ambil pakej 2 botol yang lebih berbaloi?',
        triggerCondition: 'buying_intent',
        nextStepId: 'step_collect_details',
        isEnabled: true
      },
      {
        id: 'step_collect_details',
        name: '8. Kumpul Butiran Pesanan',
        objective: 'Mendapatkan nama penuh, no telefon, dan alamat pos pelanggan.',
        aiInstruction: 'Minta nama penuh dan alamat penghantaran. Jika nama sudah diberikan sebelum ini, jangan tanya lagi, terus minta alamat sahaja.',
        exampleScript: 'Alhamdulillah! Untuk kami buatkan penghantaran, boleh kongsikan Nama Penuh dan Alamat Penghantaran lengkap awak?',
        triggerCondition: 'ready_to_order',
        nextStepId: 'step_order_confirmation',
        isEnabled: true
      },
      {
        id: 'step_order_confirmation',
        name: '9. Pengesahan Pesanan & Ringkasan',
        objective: 'Mengesahkan butiran sebelum memproses tempahan.',
        aiInstruction: 'Pamerkan ringkasan pesanan dengan format kemas (Nama, Pakej, Jumlah Harga, Alamat) dan minta pengesahan Ya/Betul daripada pelanggan.',
        exampleScript: 'Baik {{customer_name}}, saya sahkan tempahan awak:\n\n📦 Pakej: {{package_name}}\n💰 Jumlah: RM{{package_price}}\n📍 Alamat: {{customer_address}}\n\nSemua maklumat di atas betul ya?',
        triggerCondition: 'always',
        nextStepId: 'step_completed_order',
        isEnabled: true
      },
      {
        id: 'step_completed_order',
        name: '10. Tempahan Selesai & Tindakan Susulan',
        objective: 'Mengucapkan terima kasih dan memberi maklumat penghantaran.',
        aiInstruction: 'Ucapkan tahniah dan terima kasih. Maklumkan bahawa resit dan nombor penjejakan (tracking) akan dihantar sebaik bungkusan dipos.',
        exampleScript: 'Terima kasih banyak {{customer_name}}! 🎉 Tempahan awak telah kami sahkan dan akan dipos dalam masa 24 jam. Kami akan hantar nombor tracking bila posmen dah ambil ya.',
        triggerCondition: 'always',
        nextStepId: null,
        isEnabled: true
      }
    ];

    const insertFlow = db.prepare(`
      INSERT INTO closing_flows (name, version, status, steps_json)
      VALUES (?, ?, ?, ?)
    `);
    insertFlow.run('Aliran Jualan Standard WSZia', 1, 'published', JSON.stringify(defaultSteps));
    console.log('[SEED] Closing Flow Versi 1 (Published) berjaya dicipta.');
  }

  // 5. Seed Tetapan Sistem
  const settingsToSeed = [
    { key: 'ai_provider', value: 'gemini' }, // 'gemini' or 'openai' or 'rule_based'
    { key: 'ai_api_key', value: '' },
    { key: 'ai_model', value: 'gemini-1.5-flash' },
    { key: 'whatsapp_mode', value: 'dual' }, // 'cloud_api' | 'baileys' | 'dual'
    { key: 'meta_verify_token', value: 'autobot_wszia_verify_secret_token_2026' },
    { key: 'meta_access_token', value: '' },
    { key: 'meta_phone_number_id', value: '' },
    { key: 'human_handover_enabled', value: 'true' },
    { key: 'system_prompt_guidelines', value: 'Anda adalah Pembantu Khidmat Pelanggan & Penasihat Kesihatan Mesra untuk AutoBot WSZia. Gunakan bahasa Melayu santai, sopan, dan berempati. Elakkan dakwaan perubatan mutlak.' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)
  `);
  for (const s of settingsToSeed) {
    insertSetting.run(s.key, s.value);
  }
}

initializeDatabase();

export default db;
