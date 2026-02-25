import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

export function createSqlLiteDb(dataDir: string) {
    try {
        // Using eval('require') to hide the dependency from Vercel's bundler
        const Database = eval('require')('better-sqlite3');

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const dbPath = path.join(dataDir, 'app.db');
        const db = new Database(dbPath, { verbose: console.log });

        db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        is_subscribed BOOLEAN DEFAULT 0,
        subscription_id TEXT
      )
    `);

        return db;
    } catch (error: any) {
        console.error('NATIVE SQLITE INITIALIZATION FAILED:', error.message);
        throw error;
    }
}
