const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const crypto = require('crypto');

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
    return JSON.parse(fs.readFileSync(dataFile, 'utf8') || '{}');
  } catch (e) { return {}; }
}

function writeStorage(obj) {
  ensureFileStorage();
  fs.writeFileSync(dataFile, JSON.stringify(obj, null, 2), 'utf8');
}

let pool = null;

async function getItemsFromStore(key) {
  if (pool) {
    if (key === 'gym_members') {
      const [rows] = await pool.query('SELECT * FROM members ORDER BY id DESC');
      return rows.map(r => {
        const extra = r.extra || {}; // mysql2 auto-parses JSON
        return Object.assign({}, extra, {
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          planId: r.plan_id,
          startDate: r.joined_at, // map joined_at back to startDate
          // Ensure these don't get overwritten by extra if they exist there matching the DB columns
        });
      });
    } else if (key === 'gym_plans') {
      const [rows] = await pool.query('SELECT * FROM plans ORDER BY id ASC');
      return rows.map(r => Object.assign({}, r, {
        features: r.features || []
      }));
    } else if (key === 'gym_trainers') {
      const [rows] = await pool.query('SELECT * FROM trainers ORDER BY id ASC');
      return rows.map(r => Object.assign({}, r, {
        availability: r.availability || {}
      }));
    } else if (key === 'gym_classes') {
      const [rows] = await pool.query(
        `SELECT c.*, t.name as trainerName 
         FROM classes c 
         LEFT JOIN trainers t ON c.trainer_id = t.id 
         ORDER BY JSON_UNQUOTE(JSON_EXTRACT(c.schedule, '$.date')) ASC, 
                  JSON_UNQUOTE(JSON_EXTRACT(c.schedule, '$.time')) ASC`
      );
      // Flatten/map checks
      return rows.map(r => {
        const schedule = r.schedule || {};
        return Object.assign({}, r, {
          trainerId: r.trainer_id, // Map DB column to CamelCase expectation
          date: schedule.date,
          time: schedule.time,
          duration: schedule.duration
        });
      });
    } else if (key === 'gym_prospects') {
      const [rows] = await pool.query('SELECT * FROM prospects ORDER BY created_at DESC');
      return rows;
    } else if (key === 'gym_users') {
      const [rows] = await pool.query('SELECT id, username, role, name, email, created_at FROM users');
      return rows;
    }

    // Fallback for unknown keys (e.g. checkins, payments if not yet relationalized or legacy)
    const [rows] = await pool.query('SELECT id, data FROM items WHERE `key` = ? ORDER BY id ASC', [key]);
    return rows.map(r => Object.assign({ id: r.id }, parseJSONSafe(r.data)));
  } else {
    const store = readStorage();
    return (store[key] || []).map((it, idx) => Object.assign({ id: it.id || (idx + 1) }, it));
  }
}

async function createItemInStore(key, item) {
  if (pool) {
    if (key === 'gym_members') {
      const planId = item.planId || null;
      // Extract main fields, put rest in extra
      const { name, email, phone, startDate, ...rest } = item;
      // We explicitly map item.startDate -> joined_at and ensure it is YYYY-MM-DD
      const joinedAt = startDate ? new Date(startDate).toISOString().slice(0, 10) : null;
      const extra = JSON.stringify(rest);
      console.log('Creating member:', name, joinedAt); // Debug log
      const [res] = await pool.query(
        'INSERT INTO members (name, email, phone, plan_id, joined_at, extra, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [name, email, phone, planId, joinedAt, extra]
      );
      return Object.assign({}, item, { id: res.insertId });
    } else if (key === 'gym_plans') {
      const { name, duration, price, discount, trial, description, features } = item;
      const [res] = await pool.query(
        'INSERT INTO plans (name, duration, price, discount, trial, description, features, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
        [name, duration, price, discount, trial, description, JSON.stringify(features)]
      );
      return Object.assign({}, item, { id: res.insertId });
    } else if (key === 'gym_trainers') {
      const { name, email, phone, specialization, certifications, bio, availability } = item;
      const [res] = await pool.query(
        'INSERT INTO trainers (name, email, phone, specialization, certifications, bio, availability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
        [name, email, phone, specialization, certifications, bio, JSON.stringify(availability)]
      );
      return Object.assign({}, item, { id: res.insertId });
    } else if (key === 'gym_classes') {
      const { title, trainerId, date, time, duration, capacity, description, trainerName } = item;
      // Store date, time, duration in schedule JSON column
      const schedule = { date, time, duration };

      // We need to fetch trainer_id if only trainerName is present, or rely on trainerId
      const [res] = await pool.query(
        'INSERT INTO classes (title, trainer_id, schedule, capacity, created_at) VALUES (?, ?, ?, ?, NOW())',
        [title, trainerId || null, JSON.stringify(schedule), capacity]
      );
      return Object.assign({}, item, { id: res.insertId });
    } else if (key === 'gym_prospects') {
      const { name, email, phone, notes } = item;
      const [res] = await pool.query(
        'INSERT INTO prospects (name, email, phone, notes, created_at) VALUES (?, ?, ?, ?, NOW())',
        [name, email, phone, notes]
      );
      return Object.assign({}, item, { id: res.insertId });
    }

    const [result] = await pool.query('INSERT INTO items (`key`, data) VALUES (?, ?)', [key, JSON.stringify(item)]);
    return Object.assign({ id: result.insertId }, item);
  } else {
    const store = readStorage();
    store[key] = store[key] || [];
    const maxId = store[key].reduce((m, i) => Math.max(m, i.id || 0), 0);
    const id = maxId + 1;
    const toStore = Object.assign({ id }, item);
    store[key].push(toStore);
    writeStorage(store);
    return toStore;
  }
}

async function updateItemInStore(key, id, item) {
  if (pool) {
    if (key === 'gym_members') {
      const planId = item.planId || null;
      const { name, email, phone, startDate, ...rest } = item;
      const joinedAt = startDate ? new Date(startDate).toISOString().slice(0, 10) : null;
      const extra = JSON.stringify(rest);
      const [res] = await pool.query(
        'UPDATE members SET name=?, email=?, phone=?, plan_id=?, joined_at=?, extra=? WHERE id=?',
        [name, email, phone, planId, joinedAt, extra, id]
      );
      return res.affectedRows > 0;
    } else if (key === 'gym_plans') {
      const { name, duration, price, discount, trial, description, features } = item;
      const [res] = await pool.query(
        'UPDATE plans SET name=?, duration=?, price=?, discount=?, trial=?, description=?, features=? WHERE id=?',
        [name, duration, price, discount, trial, description, JSON.stringify(features), id]
      );
      return res.affectedRows > 0;
    } else if (key === 'gym_trainers') {
      const { name, email, phone, specialization, certifications, bio, availability } = item;
      const [res] = await pool.query(
        'UPDATE trainers SET name=?, email=?, phone=?, specialization=?, certifications=?, bio=?, availability=? WHERE id=?',
        [name, email, phone, specialization, certifications, bio, JSON.stringify(availability), id]
      );
      return res.affectedRows > 0;
    } else if (key === 'gym_classes') {
      const { title, trainerId, date, time, duration, capacity } = item;
      const schedule = { date, time, duration };
      const [res] = await pool.query(
        'UPDATE classes SET title=?, trainer_id=?, schedule=?, capacity=? WHERE id=?',
        [title, trainerId || null, JSON.stringify(schedule), capacity, id]
      );
      return res.affectedRows > 0;
    }

    await pool.query('UPDATE items SET data = ? WHERE id = ? AND `key` = ?', [JSON.stringify(item), id, key]);
    return true;
  } else {
    const store = readStorage();
    store[key] = store[key] || [];
    const idx = store[key].findIndex(i => String(i.id) === String(id));
    if (idx === -1) return false;
    store[key][idx] = Object.assign({ id: Number(id) }, item);
    writeStorage(store);
    return true;
  }
}

async function deleteItemInStore(key, id) {
  if (pool) {
    let tableName = 'items';
    let idCol = 'id'; // default
    let extraCondition = ' AND `key` = ?';
    let params = [id, key];

    if (key === 'gym_members') { tableName = 'members'; extraCondition = ''; params = [id]; }
    else if (key === 'gym_plans') { tableName = 'plans'; extraCondition = ''; params = [id]; }
    else if (key === 'gym_trainers') { tableName = 'trainers'; extraCondition = ''; params = [id]; }
    else if (key === 'gym_classes') { tableName = 'classes'; extraCondition = ''; params = [id]; }
    else if (key === 'gym_prospects') { tableName = 'prospects'; extraCondition = ''; params = [id]; }
    // generic fallback uses default values above

    const [result] = await pool.query(`DELETE FROM ${tableName} WHERE id = ?${extraCondition}`, params);
    return result.affectedRows;
  } else {
    const store = readStorage();
    store[key] = store[key] || [];
    const before = store[key].length;
    store[key] = store[key].filter(i => String(i.id) !== String(id));
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
    store[key] = items.map((it, idx) => Object.assign({ id: it.id || (idx + 1) }, it));
    writeStorage(store);
    return store[key];
  }
}

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || 'gravity-gym';
const PORT = process.env.PORT || 3000;

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
  try {
    await tmpPool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  } catch (err) {
    await tmpPool.end();
    throw new Error('Unable to create or access database: ' + err.message);
  }
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

  // Test connection
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    throw new Error('MySQL connection failed: ' + err.message);
  }

  // Create items table if not exists (legacy)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      ` + '`key`' + ` VARCHAR(255) NOT NULL,
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

  // Seed default admin if empty
  const [userRows] = await pool.query('SELECT count(*) as count FROM users');
  if (userRows[0].count === 0) {
    console.log('Seeding default admin user...');
    await pool.query(
      'INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)',
      ['Tanmay9999', 'admin123', 'admin', 'Tanmay', 'tanmay@example.com']
    );
  }
}


// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password required' });
  }

  try {
    if (pool) {
      // Relational DB check
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
      const user = rows[0];
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Invalid username or password' });
      }

      let valid = false;
      if (user.password && user.password.includes(':')) {
        // Scrypt hash
        const [salt, key] = user.password.split(':');
        const derived = crypto.scryptSync(password, salt, 64).toString('hex');
        if (key === derived) valid = true;
      } else {
        // Plain text (legacy/migrated)
        if (user.password === password) valid = true;
      }

      if (!valid) {
        console.log('Login failed: invalid password for', username);
        return res.status(401).json({ ok: false, error: 'Invalid username or password' });
      }

      const userProfile = Object.assign({}, user);
      delete userProfile.password;
      console.log('Login success for', username, 'sending profile:', userProfile);
      return res.json({ ok: true, user: userProfile });

    } else {
      // File storage fallback (generic items)
      // Note: In file storage, passwords might be plain text
      const store = readStorage();
      const users = store['gym_users'] || [];
      const user = users.find(u => u.username === username && u.password === password);

      if (!user) {
        return res.status(401).json({ ok: false, error: 'Invalid username or password' });
      }
      const userProfile = Object.assign({}, user);
      delete userProfile.password;
      return res.json({ ok: true, user: userProfile });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

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
    const ok = await updateItemInStore(key, id, item);
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
    const deleted = await deleteItemInStore(key, id);
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

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password required' });
  }

  try {
    if (pool) {
      // Relational DB check
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
      const user = rows[0];
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Invalid username or password' });
      }

      let valid = false;
      if (user.password && user.password.includes(':')) {
        // Scrypt hash
        const [salt, key] = user.password.split(':');
        const derived = crypto.scryptSync(password, salt, 64).toString('hex');
        if (key === derived) valid = true;
      } else {
        // Plain text (legacy/migrated)
        if (user.password === password) valid = true;
      }

      if (!valid) {
        console.log('Login failed: invalid password for', username);
        return res.status(401).json({ ok: false, error: 'Invalid username or password' });
      }

      const userProfile = Object.assign({}, user);
      delete userProfile.password;
      console.log('Login success for', username, 'sending profile:', userProfile);
      return res.json({ ok: true, user: userProfile });

    } else {
      // File storage fallback (generic items)
      // Note: In file storage, passwords might be plain text
      const store = readStorage();
      const users = store['gym_users'] || [];
      const user = users.find(u => u.username === username && u.password === password);

      if (!user) {
        return res.status(401).json({ ok: false, error: 'Invalid username or password' });
      }
      const userProfile = Object.assign({}, user);
      delete userProfile.password;
      return res.json({ ok: true, user: userProfile });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// Health endpoint
app.get('/health', async (req, res) => {
  if (pool) {
    try {
      await pool.query('SELECT 1');
      return res.json({ ok: true, db: 'connected' });
    } catch (e) {
      return res.json({ ok: true, db: 'error', error: e.message });
    }
  }
  return res.json({ ok: true, db: 'file-storage' });
});

// Serve frontend from project root (index.html, css, js)
const FRONTEND_ROOT = path.join(__dirname, '..');
app.use(express.static(FRONTEND_ROOT));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});

app.listen(PORT, async () => {
  try {
    await initDb();
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
  } catch (err) {
    console.error('Failed to initialize DB, falling back to file storage:', err && err.message ? err.message : err);
    // fallback to file storage so the project can run without MySQL during development
    pool = null;
    useFileStorage = true;
    ensureFileStorage();
    console.log('File storage enabled. Server running on port', PORT);
  }
  // perform a quick DB check and print connection status
  if (pool) {
    try {
      await pool.query('SELECT 1');
      console.log('Connected to MySQL (startup check)');
    } catch (e) {
      console.error('Warning: MySQL appears unreachable at startup:', e.message);
    }
  } else {
    console.log('Running with file storage (no DB)');
  }
});