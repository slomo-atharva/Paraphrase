import fs from 'fs';
import path from 'path';

// Ensure we don't try to write to read-only dirs in Vercel
const dataDir = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.json');

function readDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading DB:', e);
  }
  return { users: {} };
}

function writeDb(data: any) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data));
  } catch (e) {
    console.error('Error writing DB:', e);
  }
}

export function getUser(id: string) {
  const db = readDb();
  if (!db.users[id]) {
    db.users[id] = { id, is_subscribed: false, subscription_id: null };
    writeDb(db);
  }
  return db.users[id];
}

export function updateUserSubscription(id: string, isSubscribed: boolean, subscriptionId?: string) {
  const db = readDb();
  if (!db.users[id]) {
    db.users[id] = { id, is_subscribed: false, subscription_id: null };
  }
  db.users[id].is_subscribed = isSubscribed;
  db.users[id].subscription_id = subscriptionId || null;
  writeDb(db);
}
