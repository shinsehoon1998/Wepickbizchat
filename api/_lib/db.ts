import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../shared/schema';

neonConfig.fetchConnectionCache = true;

export function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable is not set');
    throw new Error('DATABASE_URL is not set');
  }
  
  const sql = neon(dbUrl);
  return drizzle(sql, { schema });
}

export const db = {
  select() {
    return getDb().select();
  },
  insert<T>(table: T) {
    return getDb().insert(table as any);
  },
  update<T>(table: T) {
    return getDb().update(table as any);
  },
  delete<T>(table: T) {
    return getDb().delete(table as any);
  },
};
