import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAiProviderFromEnv } from './aiProvider';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('accounting.db');
const ai = createAiProviderFromEnv();
const VALID_STATUSES = new Set(['confirmed', 'unconfirmed']);

function normalizeStoreName(storeName: string): string {
  return storeName
    .trim()
    .replace(/[\uFF01-\uFF5E]/g, (ch: string) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function validateTransactionStatus(status: unknown): status is 'confirmed' | 'unconfirmed' {
  return typeof status === 'string' && VALID_STATUSES.has(status);
}

function createDedupKey(date: string, amount: number, normalizedStoreName: string): string {
  return `${date}_${amount}_${normalizedStoreName}`;
}

function sanitizeText(input: unknown, fallback = ''): string {
  return typeof input === 'string' ? input.trim() : fallback;
}

function parseAmount(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) return Math.round(input);
  if (typeof input === 'string') {
    const numeric = Number(input);
    if (Number.isFinite(numeric)) return Math.round(numeric);
  }
  throw new Error('Invalid amount');
}

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    store_name TEXT NOT NULL,
    normalized_store_name TEXT NOT NULL,
    direction TEXT NOT NULL,
    dedup_key TEXT NOT NULL,
    status TEXT DEFAULT 'unconfirmed',
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    household_category TEXT,
    business_category TEXT,
    purpose TEXT,
    confidence REAL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  );

  CREATE TABLE IF NOT EXISTS classification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_pattern TEXT NOT NULL,
    household_category TEXT,
    business_category TEXT,
    purpose TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_action_date TEXT
  );
`);

const statsCount = db.prepare('SELECT COUNT(*) as count FROM user_stats').get() as { count: number };
if (statsCount.count === 0) {
  db.prepare('INSERT INTO user_stats (level, exp, streak) VALUES (1, 0, 0)').run();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', aiProvider: ai?.provider ?? null });
  });

  app.get('/api/stats', (req, res) => {
    const stats = db.prepare('SELECT * FROM user_stats LIMIT 1').get();
    res.json(stats);
  });

  app.post('/api/stats/exp', (req, res) => {
    const { amount } = req.body;
    const stats = db.prepare('SELECT * FROM user_stats LIMIT 1').get() as any;
    const gain = Number(amount) || 0;

    let newExp = stats.exp + gain;
    let newLevel = stats.level;
    const expNeeded = newLevel * 100;

    if (newExp >= expNeeded) {
      newLevel++;
      newExp -= expNeeded;
    }

    db.prepare('UPDATE user_stats SET exp = ?, level = ? WHERE id = ?').run(newExp, newLevel, stats.id);
    res.json({ level: newLevel, exp: newExp, leveledUp: newLevel > stats.level });
  });

  app.get('/api/transactions', (req, res) => {
    const rawStatus = req.query.status;
    const baseQuery = `
      SELECT t.*, c.household_category, c.business_category, c.purpose, c.confidence
      FROM transactions t
      LEFT JOIN classifications c ON t.id = c.transaction_id
    `;

    if (rawStatus === undefined) {
      const transactions = db.prepare(`${baseQuery} ORDER BY t.date DESC`).all();
      res.json(transactions);
      return;
    }

    if (!validateTransactionStatus(rawStatus)) {
      res.status(400).json({ error: 'Invalid status. Use confirmed or unconfirmed.' });
      return;
    }

    const transactions = db
      .prepare(`${baseQuery} WHERE t.status = ? ORDER BY t.date DESC`)
      .all(rawStatus);
    res.json(transactions);
  });

  app.post('/api/transactions', (req, res) => {
    try {
      const date = sanitizeText(req.body.date);
      const amount = parseAmount(req.body.amount);
      const store_name = sanitizeText(req.body.store_name);
      const direction = sanitizeText(req.body.direction, 'expense');
      const household_category = sanitizeText(req.body.household_category);
      const business_category = sanitizeText(req.body.business_category);
      const purpose = sanitizeText(req.body.purpose, 'personal');
      const memo = sanitizeText(req.body.memo);

      if (!date || !store_name) {
        res.status(400).json({ error: 'date and store_name are required' });
        return;
      }

      const normalized_store_name = normalizeStoreName(store_name);
      const dedup_key = createDedupKey(date, amount, normalized_store_name);

      const stmt = db.prepare(`
        INSERT INTO transactions (source, date, amount, store_name, normalized_store_name, direction, dedup_key, status, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
      `);

      const info = stmt.run('manual', date, amount, store_name, normalized_store_name, direction, dedup_key, memo);

      if (household_category || business_category || purpose) {
        db.prepare(`
          INSERT INTO classifications (transaction_id, household_category, business_category, purpose, confidence)
          VALUES (?, ?, ?, ?, 1.0)
        `).run(info.lastInsertRowid, household_category, business_category, purpose);
      }

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(400).json({ error: 'Invalid transaction payload' });
    }
  });

  app.post('/api/transactions/:id/confirm', (req, res) => {
    const { id } = req.params;
    const { household_category, business_category, purpose, memo, save_rule } = req.body;

    db.prepare('UPDATE transactions SET status = ?, memo = ? WHERE id = ?').run('confirmed', memo, id);

    const existingClass = db.prepare('SELECT id FROM classifications WHERE transaction_id = ?').get(id);
    if (existingClass) {
      db.prepare(`
        UPDATE classifications 
        SET household_category = ?, business_category = ?, purpose = ?, confidence = 1.0
        WHERE transaction_id = ?
      `).run(household_category, business_category, purpose, id);
    } else {
      db.prepare(`
        INSERT INTO classifications (transaction_id, household_category, business_category, purpose, confidence)
        VALUES (?, ?, ?, ?, 1.0)
      `).run(id, household_category, business_category, purpose);
    }

    if (save_rule) {
      const tx = db.prepare('SELECT normalized_store_name FROM transactions WHERE id = ?').get(id) as any;
      if (tx) {
        db.prepare(`
          INSERT INTO classification_rules (store_pattern, household_category, business_category, purpose)
          VALUES (?, ?, ?, ?)
        `).run(tx.normalized_store_name, household_category, business_category, purpose);
      }
    }

    res.json({ success: true });
  });

  app.post('/api/transactions/bulk-confirm', (req, res) => {
    const { ids, household_category, business_category, purpose } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids is required' });
      return;
    }

    const updateTx = db.prepare('UPDATE transactions SET status = ? WHERE id = ?');
    const insertClass = db.prepare(`
      INSERT INTO classifications (transaction_id, household_category, business_category, purpose, confidence)
      VALUES (?, ?, ?, ?, 1.0)
    `);
    const updateClass = db.prepare(`
      UPDATE classifications 
      SET household_category = ?, business_category = ?, purpose = ?, confidence = 1.0
      WHERE transaction_id = ?
    `);

    const transaction = db.transaction((txIds: number[]) => {
      for (const id of txIds) {
        updateTx.run('confirmed', id);
        const existing = db.prepare('SELECT id FROM classifications WHERE transaction_id = ?').get(id);
        if (existing) {
          updateClass.run(household_category, business_category, purpose, id);
        } else {
          insertClass.run(id, household_category, business_category, purpose);
        }
      }
    });

    transaction(ids);
    res.json({ success: true, count: ids.length });
  });

  app.post('/api/transactions/:id/auto-classify', async (req, res) => {
    if (!ai) {
      res.status(500).json({ error: 'AI not configured' });
      return;
    }

    const { id } = req.params;
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as any;

    if (!tx) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    try {
      const result = await ai.classifyTransaction({
        storeName: tx.store_name,
        amount: tx.amount,
        direction: tx.direction,
        date: tx.date,
      });
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'AI classification failed' });
    }
  });

  app.post('/api/transactions/bulk', (req, res) => {
    const { transactions } = req.body;

    if (!Array.isArray(transactions)) {
      res.status(400).json({ error: 'transactions must be an array' });
      return;
    }

    const insertTx = db.prepare(`
      INSERT INTO transactions (source, date, amount, store_name, normalized_store_name, direction, dedup_key, status, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'unconfirmed', ?)
    `);
    const checkDup = db.prepare('SELECT id FROM transactions WHERE dedup_key = ?');

    let added = 0;
    let skipped = 0;

    const runTransaction = db.transaction((txs: any[]) => {
      for (const tx of txs) {
        const date = sanitizeText(tx.date);
        const store_name = sanitizeText(tx.store_name);
        if (!date || !store_name) {
          skipped++;
          continue;
        }

        const amount = parseAmount(tx.amount);
        const normalized_store_name = normalizeStoreName(store_name);
        const dedup_key = createDedupKey(date, amount, normalized_store_name);

        if (checkDup.get(dedup_key)) {
          skipped++;
          continue;
        }

        insertTx.run(
          tx.source || 'csv',
          date,
          amount,
          store_name,
          normalized_store_name,
          tx.direction === 'income' ? 'income' : 'expense',
          dedup_key,
          tx.memo || '',
        );
        added++;
      }
    });

    runTransaction(transactions);
    res.json({ success: true, added, skipped });
  });

  app.post('/api/ocr', async (req, res) => {
    if (!ai) {
      res.status(500).json({ error: 'AI not configured' });
      return;
    }

    try {
      const { imageBase64, mimeType } = req.body;
      const result = await ai.readReceipt({ imageBase64, mimeType });
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'OCR failed' });
    }
  });

  app.get('/api/export/freee', (req, res) => {
    const query = `
      SELECT t.*, c.business_category, c.purpose 
      FROM transactions t
      LEFT JOIN classifications c ON t.id = c.transaction_id
      WHERE t.status = 'confirmed' AND c.purpose IN ('business', 'mixed')
      ORDER BY t.date ASC
    `;
    const transactions = db.prepare(query).all() as any[];

    let csv = '収支区分,発生日,勘定科目,金額,取引先,備考\n';

    transactions.forEach((tx) => {
      const type = tx.direction === 'expense' ? '支出' : '収入';
      const category = tx.business_category || '未分類';
      const store = `"${tx.store_name.replace(/"/g, '""')}"`;
      const memo = `"${(tx.memo || '').replace(/"/g, '""')}"`;

      csv += `${type},${tx.date},${category},${tx.amount},${store},${memo}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="freee_export.csv"');
    res.send('\uFEFF' + csv);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
