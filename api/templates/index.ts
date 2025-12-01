import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc, and } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { randomUUID } from 'crypto';

neonConfig.fetchConnectionCache = true;

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  status: text('status').default('draft'),
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  templateId: text('template_id'),
  completedAt: timestamp('completed_at'),
});

const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  sent: integer('sent').default(0),
  delivered: integer('delivered').default(0),
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

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  messageType: z.enum(['LMS', 'MMS', 'RCS']),
  title: z.string().max(60).optional(),
  content: z.string().min(1).max(2000),
  imageUrl: z.string().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();
  const userId = auth.userId;

  if (req.method === 'GET') {
    try {
      const templateList = await db.select().from(templates).where(eq(templates.userId, userId)).orderBy(desc(templates.createdAt));
      
      const templatesWithStats = await Promise.all(
        templateList.map(async (template) => {
          const templateCampaigns = await db.select().from(campaigns).where(and(eq(campaigns.templateId, template.id), eq(campaigns.userId, userId)));
          let totalSent = 0, totalDelivered = 0;
          let lastSentAt: Date | null = null;
          
          for (const c of templateCampaigns) {
            const reportResult = await db.select().from(reports).where(eq(reports.campaignId, c.id));
            const report = reportResult[0];
            if (report) {
              totalSent += report.sent || 0;
              totalDelivered += report.delivered || 0;
            }
            if (c.completedAt && (!lastSentAt || c.completedAt > lastSentAt)) {
              lastSentAt = c.completedAt;
            }
          }
          
          return {
            ...template,
            sendHistory: {
              campaignCount: templateCampaigns.length,
              totalSent,
              totalDelivered,
              lastSentAt,
            },
          };
        })
      );
      
      return res.status(200).json(templatesWithStats);
    } catch (error) {
      console.error('Error fetching templates:', error);
      return res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createTemplateSchema.parse(req.body);
      
      const result = await db.insert(templates).values({
        id: randomUUID(),
        userId,
        name: data.name,
        messageType: data.messageType,
        title: data.title,
        content: data.content,
        imageUrl: data.imageUrl,
        status: 'draft',
      }).returning();
      
      return res.status(201).json(result[0]);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid template data', details: error.errors });
      console.error('Error creating template:', error);
      return res.status(500).json({ error: 'Failed to create template' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
