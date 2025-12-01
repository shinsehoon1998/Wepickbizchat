import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { randomUUID } from 'crypto';

neonConfig.fetchConnectionCache = true;

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  balance: text('balance').default('0').notNull(),
});

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  templateId: text('template_id'),
  messageType: text('message_type'),
  sndNum: text('snd_num'),
  statusCode: text('status_code').default('00'),
  status: text('status').default('작성중'),
  targetCount: integer('target_count'),
  budget: text('budget'),
  scheduledAt: timestamp('scheduled_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

const targeting = pgTable('targeting', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  gender: text('gender'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  regions: text('regions').array(),
  createdAt: timestamp('created_at').defaultNow(),
});

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  status: text('status').default('draft'),
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

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().min(1),
  messageType: z.enum(['LMS', 'MMS', 'RCS']),
  sndNum: z.string().min(1),
  gender: z.enum(['all', 'male', 'female']).default('all'),
  ageMin: z.number().min(10).max(100).default(20),
  ageMax: z.number().min(10).max(100).default(60),
  regions: z.array(z.string()).default([]),
  targetCount: z.number().min(100).default(1000),
  budget: z.number().min(10000),
  scheduledAt: z.string().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();
  const userId = auth.userId;

  if (req.method === 'GET') {
    try {
      const result = await db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
  }

  if (req.method === 'POST') {
    try {
      const userResult = await db.select().from(users).where(eq(users.id, userId));
      const user = userResult[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      const data = createCampaignSchema.parse(req.body);

      const templateResult = await db.select().from(templates).where(eq(templates.id, data.templateId));
      const template = templateResult[0];
      if (!template) return res.status(404).json({ error: 'Template not found' });
      if (template.userId !== userId) return res.status(403).json({ error: 'Access denied to template' });
      if (template.status !== 'approved') return res.status(400).json({ error: 'Template must be approved' });

      const userBalance = parseFloat(user.balance || '0');
      const estimatedCost = data.targetCount * 50;
      if (userBalance < estimatedCost) return res.status(400).json({ error: '잔액이 부족합니다' });

      const campaignId = randomUUID();
      const campaignResult = await db.insert(campaigns).values({
        id: campaignId,
        userId,
        name: data.name,
        templateId: data.templateId,
        messageType: data.messageType,
        sndNum: data.sndNum,
        statusCode: '00',
        status: '작성중',
        targetCount: data.targetCount,
        budget: data.budget.toString(),
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      }).returning();

      await db.insert(messages).values({
        id: randomUUID(),
        campaignId,
        title: template.title,
        content: template.content,
        imageUrl: template.imageUrl,
      });

      await db.insert(targeting).values({
        id: randomUUID(),
        campaignId,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
      });

      return res.status(201).json(campaignResult[0]);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error('Error creating campaign:', error);
      return res.status(500).json({ error: 'Failed to create campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
