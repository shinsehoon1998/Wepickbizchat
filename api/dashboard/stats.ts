import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
  statusCode: integer('status_code').default(5),
  templateId: text('template_id'),
  budget: text('budget'),
  targetCount: integer('target_count'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  sent: integer('sent').default(0),
  delivered: integer('delivered').default(0),
  failed: integer('failed').default(0),
  clicked: integer('clicked').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const sql = neon(dbUrl);
  return drizzle(sql);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration is missing');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await verifyAuth(req);
    
    if (!auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const userCampaigns = await db.select().from(campaigns).where(eq(campaigns.userId, auth.userId));
    
    let totalSent = 0;
    let totalSuccess = 0;
    let totalClicks = 0;
    let activeCampaigns = 0;

    for (const campaign of userCampaigns) {
      if (campaign.statusCode === 20 || campaign.statusCode === 30) {
        activeCampaigns++;
      }
      const reportResult = await db.select().from(reports).where(eq(reports.campaignId, campaign.id));
      const report = reportResult[0];
      if (report) {
        totalSent += report.sent || 0;
        totalSuccess += report.delivered || 0;
        totalClicks += report.clicked || 0;
      }
    }

    const stats = {
      totalCampaigns: userCampaigns.length,
      activeCampaigns,
      totalSent,
      totalSuccess,
      totalClicks,
      successRate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0,
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
}
