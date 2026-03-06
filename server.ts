import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('accounting.db');

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

// Initialize user stats if empty
const statsCount = db.prepare('SELECT COUNT(*) as count FROM user_stats').get() as { count: number };
if (statsCount.count === 0) {
  db.prepare('INSERT INTO user_stats (level, exp, streak) VALUES (1, 0, 0)').run();
}

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Get user stats
  app.get('/api/stats', (req, res) => {
    const stats = db.prepare('SELECT * FROM user_stats LIMIT 1').get();
    res.json(stats);
  });

  // Add EXP
  app.post('/api/stats/exp', (req, res) => {
    const { amount } = req.body;
    const stats = db.prepare('SELECT * FROM user_stats LIMIT 1').get() as any;
    let newExp = stats.exp + amount;
    let newLevel = stats.level;
    const expNeeded = newLevel * 100;

    if (newExp >= expNeeded) {
      newLevel++;
      newExp -= expNeeded;
    }

    db.prepare('UPDATE user_stats SET exp = ?, level = ? WHERE id = ?').run(newExp, newLevel, stats.id);
    res.json({ level: newLevel, exp: newExp, leveledUp: newLevel > stats.level });
  });

  // Get transactions
  app.get('/api/transactions', (req, res) => {
    const { status } = req.query;
    let query = `
      SELECT t.*, c.household_category, c.business_category, c.purpose, c.confidence
      FROM transactions t
      LEFT JOIN classifications c ON t.id = c.transaction_id
    `;
    if (status) {
      query += ` WHERE t.status = '${status}'`;
    }
    query += ' ORDER BY t.date DESC';
    const transactions = db.prepare(query).all();
    res.json(transactions);
  });

  // Add manual transaction
  app.post('/api/transactions', (req, res) => {
    const { date, amount, store_name, direction, household_category, business_category, purpose, memo } = req.body;
    
    const normalized_store_name = store_name.trim().replace(/[\uFF01-\uFF5E]/g, (ch: string) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const dedup_key = `${date}_${amount}_${normalized_store_name}`;

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
  });

  // Confirm transaction
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

  // Bulk confirm
  app.post('/api/transactions/bulk-confirm', (req, res) => {
    const { ids, household_category, business_category, purpose } = req.body;
    
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

    const transaction = db.transaction((txIds) => {
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
    res.json({ success: true });
  });

  // Auto classify using AI
  app.post('/api/transactions/:id/auto-classify', async (req, res) => {
    if (!ai) {
      return res.status(500).json({ error: 'AI not configured' });
    }

    const { id } = req.params;
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as any;

    if (!tx) return res.status(404).json({ error: 'Not found' });

    try {
      const prompt = `
        Analyze this transaction and classify it.
        Store: ${tx.store_name}
        Amount: ${tx.amount}
        Direction: ${tx.direction}
        Date: ${tx.date}

        Return JSON format:
        {
          "household_category": "string (e.g., 食費, 日用品, 通信費, 交通費, 交際費, 趣味, その他)",
          "business_category": "string (e.g., 消耗品費, 通信費, 旅費交通費, 接待交際費, 会議費, その他) or null",
          "purpose": "personal" | "business" | "mixed",
          "confidence": number (0.0 to 1.0)
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const result = JSON.parse(response.text || '{}');
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'AI classification failed' });
    }
  });

  // Bulk Add Transactions (CSV Import)
  app.post('/api/transactions/bulk', (req, res) => {
    const { transactions } = req.body;
    const insertTx = db.prepare(`
      INSERT INTO transactions (source, date, amount, store_name, normalized_store_name, direction, dedup_key, status, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'unconfirmed', ?)
    `);
    const checkDup = db.prepare('SELECT id FROM transactions WHERE dedup_key = ?');

    let added = 0;
    let skipped = 0;

    const runTransaction = db.transaction((txs) => {
      for (const tx of txs) {
        const normalized_store_name = tx.store_name.trim().replace(/[\uFF01-\uFF5E]/g, (ch: string) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
        const dedup_key = `${tx.date}_${tx.amount}_${normalized_store_name}`;

        if (checkDup.get(dedup_key)) {
          skipped++;
          continue;
        }

        insertTx.run(tx.source || 'csv', tx.date, tx.amount, tx.store_name, normalized_store_name, tx.direction, dedup_key, tx.memo || '');
        added++;
      }
    });

    runTransaction(transactions);
    res.json({ success: true, added, skipped });
  });

  // Receipt OCR
  app.post('/api/ocr', async (req, res) => {
    if (!ai) return res.status(500).json({ error: 'AI not configured' });
    try {
      const { imageBase64, mimeType } = req.body;
      const prompt = `
        Extract transaction details from this receipt image.
        Return ONLY a JSON object with the following structure:
        {
          "date": "YYYY-MM-DD",
          "amount": number (total amount, integer),
          "store_name": "string",
          "direction": "expense"
        }
      `;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            { text: prompt }
          ]
        },
        config: { responseMimeType: 'application/json' }
      });
      const result = JSON.parse(response.text || '{}');
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'OCR failed' });
    }
  });

  // Export Freee CSV
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
    
    transactions.forEach(tx => {
      const type = tx.direction === 'expense' ? '支出' : '収入';
      const date = tx.date;
      const category = tx.business_category || '未分類';
      const amount = tx.amount;
      const store = `"${tx.store_name.replace(/"/g, '""')}"`;
      const memo = `"${(tx.memo || '').replace(/"/g, '""')}"`;
      
      csv += `${type},${date},${category},${amount},${store},${memo}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="freee_export.csv"');
    res.send('\uFEFF' + csv);
  });

  // Vite middleware for development
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
