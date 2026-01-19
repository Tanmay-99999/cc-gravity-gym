const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const fs = require('fs');
const path = require('path');
let useFileStorage = false;
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'items.json');

function ensureFileStorage() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({}), 'utf8');
}

function readStorage() {
  ensureFileStorage();
  try {
    return JSON.parse(fs.readFileSync(dataFile,'utf8')||'{}');
  } catch(e) { return {}; }
}

function writeStorage(obj) {
  ensureFileStorage();
  fs.writeFileSync(dataFile, JSON.stringify(obj, null, 2),'utf8');
}

async function getItemsFromStore(key) {
  if (pool) {
    const [rows] = await pool.query('SELECT id, data FROM items WHERE `key` = ? ORDER BY id ASC', [key]);
    return rows.map(r => Object.assign({ id: r.id }, parseJSONSafe(r.data)));
  } else {
    const store = readStorage();
    return (store[key]||[]).map((it,idx) => Object.assign({ id: it.id || (idx+1) }, it));
  }
}

async function createItemInStore(key, item) {
  if (pool) {
    const [result] = await pool.query('INSERT INTO items (`key`, data) VALUES (?, ?)', [key, JSON.stringify(item)]);
    return Object.assign({ id: result.insertId }, item);
  } else {
    const store = readStorage();
    store[key]=store[key]||[];
    const maxId = store[key].reduce((m,i)=>Math.max(m,i.id||0),0);
    const id = maxId+1;
    const toStore = Object.assign({ id }, item);
    store[key].push(toStore);
    writeStorage(store);
    return toStore;
  }
}

async function updateItemInStore(key,id,item) {
  if (pool) {
    await pool.query('UPDATE items SET data = ? WHERE id = ? AND `key` = ?', [JSON.stringify(item), id, key]);
    return true;
  } else {
    const store = readStorage();
    store[key]=store[key]||[];
    const idx = store[key].findIndex(i=>String(i.id)===String(id));
    if (idx===-1) return false;
    store[key][idx]=Object.assign({ id: Number(id) }, item);
    writeStorage(store);
    return true;
  }
}

async function deleteItemInStore(key,id) {
  if (pool) {
    const [result] = await pool.query('DELETE FROM items WHERE id = ? AND `key` = ?', [id, key]);
    return result.affectedRows;
  } else {
    const store = readStorage();
    store[key]=store[key]||[];
    const before = store[key].length;
    store[key]=store[key].filter(i=>String(i.id)!==String(id));
    writeStorage(store);
    return before - store[key].length;
  }
}

async function replaceItemsInStore(key, items) {
  if (pool) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM items WHERE `key` = ?', [key]);
      for (const it of items) {
        const toStore = Object.assign({}, it);
        delete toStore.id;
        await conn.query('INSERT INTO items (`key`, data) VALUES (?, ?)', [key, JSON.stringify(toStore)]);
      }
      await conn.commit();
      const [newRows] = await conn.query('SELECT id, data FROM items WHERE `key` = ? ORDER BY id ASC', [key]);
      return newRows.map(r => Object.assign({ id: r.id }, parseJSONSafe(r.data)));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } else {
    const store = readStorage();
    store[key]=items.map((it,idx)=> Object.assign({ id: it.id||(idx+1) }, it));
    writeStorage(store);
    return store[key];
  }
}

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || 'HeavyDen';
const PORT = process.env.PORT || 5000;

let pool;

function parseJSONSafe(data) {
  if (!data) return {};
  if (typeof data === 'object') return data;
  try { return JSON.parse(data); } catch { return {}; }
}


async function initDb() {
  // create DB if not exists (using connection without database)
  const tmpPool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0
  });
  await tmpPool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await tmpPool.end();

  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Create items table if not exists (legacy)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      \`key\` VARCHAR(255) NOT NULL,
      data JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // Create relational tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(100) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(50),
      name VARCHAR(255),
      email VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255),
      duration VARCHAR(50),
      price DECIMAL(12,2),
      discount INT DEFAULT 0,
      trial INT DEFAULT 0,
      description TEXT,
      features JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trainers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      specialization VARCHAR(255),
      certifications TEXT,
      bio TEXT,
      availability JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255),
      trainer_id INT,
      schedule JSON,
      capacity INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      plan_id INT,
      joined_at DATE,
      extra JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INT PRIMARY KEY AUTO_INCREMENT,
      member_id INT,
      checkin_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      member_id INT,
      amount DECIMAL(12,2),
      paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      method VARCHAR(100),
      notes TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure default admin exists in users table (migrate from items if present)
  try {
    const [rows] = await pool.query("SELECT id, data FROM items WHERE `key` = ?", ['gym_users']);
    let found = false;
    for (const r of rows) {
      const obj = (typeof r.data === 'object') ? r.data : JSON.parse(r.data || '{}');
      if (obj && obj.username === 'Tanmay9999') { found = true; break; }
    }
    if (!found) {
      // insert into users table
      await pool.query('INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)', ['Tanmay9999','admin123','admin','Tanmay','tanmay@example.com']);
      console.log('Inserted default admin Tanmay9999 into users table');
    }
  } catch (e) {
    console.error('Error ensuring default admin (users):', e);
  }

  // Migrate existing items rows into relational tables (best-effort)
  try {
    const [all] = await pool.query("SELECT id, `key`, data FROM items");
    for (const r of all) {
      let obj = (typeof r.data === 'object') ? r.data : JSON.parse(r.data || '{}');
      const key = r.key || r['key'];
      if (!key) continue;
      if (key === 'gym_plans') {
        // insert if not exists by name
        await pool.query('INSERT IGNORE INTO plans (name, duration, price, discount, trial, description, features, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
                         [obj.name||'', obj.duration||'', obj.price||0, obj.discount||0, obj.trial||0, obj.description||'', JSON.stringify(obj.features||[])]);
      } else if (key === 'gym_trainers') {
        await pool.query('INSERT IGNORE INTO trainers (name, email, phone, specialization, certifications, bio, availability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
                         [obj.name||'', obj.email||'', obj.phone||'', obj.specialization||'', obj.certifications||'', obj.bio||'', JSON.stringify(obj.availability||[])]);
      } else if (key === 'gym_prospects') {
        await pool.query('INSERT IGNORE INTO prospects (name, email, phone, notes, created_at) VALUES (?, ?, ?, ?, NOW())',
                         [obj.name||'', obj.email||'', obj.phone||'', obj.notes||'']);
      } else if (key === 'gym_users') {
        // already ensured default admin; consider inserting other users
        if (obj.username && obj.username !== 'Tanmay9999') {
          await pool.query('INSERT IGNORE INTO users (username, password, role, name, email, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                           [obj.username||'', obj.password||'', obj.role||'', obj.name||'', obj.email||'']);
        }
      } else if (key === 'gym_members') {
        await pool.query('INSERT IGNORE INTO members (name, email, phone, plan_id, joined_at, extra, created_at) VALUES (?, ?, ?, NULL, NOW(), ?, NOW())',
                         [obj.name||'', obj.email||'', obj.phone||'', JSON.stringify(obj)]);
      } else if (key === 'gym_classes') {
        await pool.query('INSERT IGNORE INTO classes (title, trainer_id, schedule, capacity, created_at) VALUES (?, NULL, ?, ?, NOW())',
                         [obj.title||'', JSON.stringify(obj.schedule||{}), obj.capacity||0]);
      } else if (key === 'gym_checkins') {
        // checkins depend on members; skip migration for simplicity
      } else if (key === 'gym_payments') {
        // skip migration
      }
    }
    console.log('Migration from items to relational tables attempted');
  } catch (e) {
    console.error('Migration error:', e);
  }
}


// Get all items for a key
app.get('/api/:key', async (req, res) => {
  const key = req.params.key;
  try {
    const items = await getItemsFromStore(key);
    res.json({ ok: true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Replace all items for a key with provided array
// POST /api/:key/full  body: { items: [ ... ] }
app.post('/api/:key/full', async (req, res) => {
  const key = req.params.key;
  const items = req.body.items || [];
  if (!Array.isArray(items)) {
    return res.status(400).json({ ok: false, error: 'items must be an array' });
  }
  try {
    const returned = await replaceItemsInStore(key, items);
    res.json({ ok: true, count: items.length, items: returned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create single item for a key
app.post('/api/:key', async (req, res) => {
  const key = req.params.key;
  const item = req.body;
  try {
    const inserted = await createItemInStore(key, item);
    res.json({ ok: true, item: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single item
app.get('/api/:key/:id', async (req, res) => {
  const key = req.params.key;
  const id = req.params.id;
  try {
    const items = await getItemsFromStore(key);
    const it = items.find(i => String(i.id) === String(id));
    if (!it) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, item: it });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update single item
app.put('/api/:key/:id', async (req, res) => {
  const key = req.params.key;
  const id = req.params.id;
  const item = req.body;
  try {
    const ok = await updateItemInStore(key,id,item);
    if (!ok) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete single item
app.delete('/api/:key/:id', async (req, res) => {
  const key = req.params.key;
  const id = req.params.id;
  try {
    const deleted = await deleteItemInStore(key,id);
    res.json({ ok: true, deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete all items for a key
app.delete('/api/:key/full', async (req, res) => {
  const key = req.params.key;
  try {
    const returned = await replaceItemsInStore(key, []);
    res.json({ ok: true, deleted: returned.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, async () => {
  try {
    await initDb();
    console.log(`API up on port ${PORT}`);
  } catch (err) {
    console.error('Failed to initialize DB, falling back to file storage:', err && err.message ? err.message : err);
    // fallback to file storage so the project can run without MySQL during development
    pool = null;
    useFileStorage = true;
    ensureFileStorage();
    console.log('File storage enabled. API up on port', PORT);
  }
});
