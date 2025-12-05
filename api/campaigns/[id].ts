import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  templateId: text('template_id'),
  messageType: text('message_type'),
  sndNum: text('snd_num'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('draft'),
  targetCount: integer('target_count'),
  sentCount: integer('sent_count'),
  successCount: integer('success_count'),
  clickCount: integer('click_count'),
  budget: numeric('budget'),
  costPerMessage: numeric('cost_per_message'),
  scheduledAt: timestamp('scheduled_at'),
  completedAt: timestamp('completed_at'),
  rejectionReason: text('rejection_reason'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
});

const targeting = pgTable('targeting', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  gender: text('gender'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  regions: text('regions').array(),
});

const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  successCount: integer('success_count').default(0),
  failedCount: integer('failed_count').default(0),
  clickCount: integer('click_count').default(0),
  optOutCount: integer('opt_out_count').default(0),
  conversionRate: numeric('conversion_rate'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function verifyAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid campaign ID' });

  const db = getDb();
  const userId = auth.userId;

  if (req.method === 'GET') {
    try {
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      const messageResult = await db.select().from(messages).where(eq(messages.campaignId, id));
      const targetingResult = await db.select().from(targeting).where(eq(targeting.campaignId, id));
      const reportResult = await db.select().from(reports).where(eq(reports.campaignId, id));

      return res.status(200).json({
        ...campaign,
        message: messageResult[0],
        targeting: targetingResult[0],
        report: reportResult[0],
      });
    } catch (error) {
      console.error('Error fetching campaign:', error);
      return res.status(500).json({ error: 'Failed to fetch campaign' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      const updatedResult = await db.update(campaigns).set(req.body).where(eq(campaigns.id, id)).returning();
      return res.status(200).json(updatedResult[0]);
    } catch (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({ error: 'Failed to update campaign' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.userId !== userId) return res.status(403).json({ error: 'Access denied' });
      if (campaign.statusCode !== '00') return res.status(400).json({ error: 'Only draft campaigns can be deleted' });

      await db.delete(messages).where(eq(messages.campaignId, id));
      await db.delete(targeting).where(eq(targeting.campaignId, id));
      await db.delete(reports).where(eq(reports.campaignId, id));
      await db.delete(campaigns).where(eq(campaigns.id, id));

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({ error: 'Failed to delete campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
