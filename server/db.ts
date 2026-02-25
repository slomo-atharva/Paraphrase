import fs from 'fs';
import path from 'path';

// Ensure we don't try to write to read-only dirs in Vercel
const dataDir = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data');

let db: any;
const memoryStore = new Map<string, any>();

// ZERO-IMPORT VERCEL DB (Bulletproof isolation)
function getMemoryDb() {
  if (db) return db;
  db = {
    prepare: (sql: string) => {
      const sqlLower = sql.toLowerCase();
      const isSelect = sqlLower.includes('select');
      const isInsert = sqlLower.includes('insert');
      const isUpdate = sqlLower.includes('update');

      return {
        get: (id: string) => {
          if (isSelect) return memoryStore.get(id) || null;
          return null;
        },
        run: (...args: any[]) => {
          if (isInsert) {
            const id = args[0];
            memoryStore.set(id, { id, is_subscribed: 0, subscription_id: null });
          } else if (isUpdate) {
            const [isSub, subId, id] = args;
            const user = memoryStore.get(id) || { id };
            memoryStore.set(id, { ...user, is_subscribed: isSub, subscription_id: subId });
          }
          return { changes: 1 };
        },
        all: () => Array.from(memoryStore.values())
      };
    },
    exec: (sql: string) => {
      console.log('[MEM-DB] Executed:', sql.trim());
    }
  };
  return db;
}

async function getDb() {
  if (db) return db;

  if (process.env.VERCEL) {
    console.log('[SERVER] ZERO-IMPORT Vercel path active.');
    return getMemoryDb();
  }

  try {
    // STEALTH LOADER: Invisible to Vercel's NFT bundler
    // We use a dynamically constructed import to bypass static analysis
    const target = ['./', 'sqlite', '.ts'].join('');
    const sqliteModule = await import(target);
    db = sqliteModule.createSqlLiteDb(dataDir);
    return db;
  } catch (error: any) {
    console.warn('[SERVER] Stealth load failed, falling back to memory store:', error.message);
    return getMemoryDb();
  }
}

export async function getUser(id: string) {
  try {
    const database = await getDb();
    let user = database.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      database.prepare('INSERT INTO users (id) VALUES (?)').run(id);
      user = database.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    return user || { id, is_subscribed: 0 };
  } catch (e) {
    console.error('DB getUser Error:', e);
    return { id, is_subscribed: 0 };
  }
}

export async function updateUserSubscription(id: string, isSubscribed: boolean, subscriptionId?: string) {
  try {
    const database = await getDb();
    database.prepare('UPDATE users SET is_subscribed = ?, subscription_id = ? WHERE id = ?').run(isSubscribed ? 1 : 0, subscriptionId || null, id);
  } catch (e) {
    console.error('DB updateUserSubscription Error:', e);
  }
}
