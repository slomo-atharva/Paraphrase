import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'app.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    is_subscribed BOOLEAN DEFAULT 0,
    subscription_id TEXT
  )
`);

export function getUser(id: string) {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!user) {
    db.prepare('INSERT INTO users (id) VALUES (?)').run(id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  return user;
}

export function updateUserSubscription(id: string, isSubscribed: boolean, subscriptionId?: string) {
  db.prepare('UPDATE users SET is_subscribed = ?, subscription_id = ? WHERE id = ?').run(isSubscribed ? 1 : 0, subscriptionId || null, id);
}
