import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../shared/schema';

neonConfig.fetchConnectionCache = true;

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const sql = neon(process.env.DATABASE_URL);
  return neonDrizzle(sql, { schema });
}

export const db = getDb();
export { getDb };
