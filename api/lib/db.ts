import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-http';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '../../shared/schema';

neonConfig.fetchConnectionCache = true;

let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable is not set');
    throw new Error('DATABASE_URL is not set');
  }
  
  try {
    const sql = neon(dbUrl);
    _db = neonDrizzle(sql, { schema });
    return _db;
  } catch (error) {
    console.error('Failed to initialize database connection:', error);
    throw error;
  }
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(target, prop) {
    return getDb()[prop as keyof NeonHttpDatabase<typeof schema>];
  }
});
