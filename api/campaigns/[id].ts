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
  status: text('status').default('temp_registered'),
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
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  tgtCompanyName: text('tgt_company_name'),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  sndMosuQuery: text('snd_mosu_query'),
  sndMosuDesc: text('snd_mosu_desc'),
  settleCnt: integer('settle_cnt').default(0),
  mdnFileId: text('mdn_file_id'),
  atsSndStartDate: timestamp('ats_snd_start_date'),
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
  districts: text('districts').array(),
  carrierTypes: text('carrier_types').array(),
  deviceTypes: text('device_types').array(),
  shopping11stCategories: text('shopping_11st_categories').array(),
  webappCategories: text('webapp_categories').array(),
  callUsageTypes: text('call_usage_types').array(),
  locationTypes: text('location_types').array(),
  mobilityPatterns: text('mobility_patterns').array(),
  geofenceIds: text('geofence_ids').array(),
  atsQuery: text('ats_query'),
  estimatedCount: integer('estimated_count'),
  createdAt: timestamp('created_at').defaultNow(),
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

      const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date() };
      
      // Date 필드 변환
      const dateFields = ['scheduledAt', 'atsSndStartDate', 'completedAt'];
      for (const field of dateFields) {
        if (updateData[field] && typeof updateData[field] === 'string') {
          updateData[field] = new Date(updateData[field] as string);
        } else if (updateData[field] === '' || updateData[field] === null) {
          updateData[field] = null;
        }
      }
      
      // 숫자 필드 변환 (문자열로 전달된 경우)
      const intFields = ['sndMosu', 'sndGoalCnt', 'targetCount', 'rcvType', 'billingType', 'rcsType', 'settleCnt', 'statusCode'];
      for (const field of intFields) {
        if (updateData[field] !== undefined && updateData[field] !== null) {
          const value = updateData[field];
          if (typeof value === 'string') {
            updateData[field] = parseInt(value, 10);
          }
        }
      }

      console.log('[Campaign PATCH] Updating campaign:', id, 'Fields:', Object.keys(updateData).filter(k => k !== 'updatedAt'));
      if (updateData.sndMosu !== undefined) {
        console.log('[Campaign PATCH] sndMosu value:', updateData.sndMosu);
      }

      const updatedResult = await db.update(campaigns).set(updateData).where(eq(campaigns.id, id)).returning();
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
      
      // BizChat API 규격: isTmp=1 또는 state=0 (임시등록) 캠페인만 삭제 가능
      const DELETABLE_STATUS_CODES = [0];
      if (!DELETABLE_STATUS_CODES.includes(campaign.statusCode || 0)) {
        console.error(`Cannot delete campaign with status ${campaign.statusCode}`);
        return res.status(400).json({ 
          error: '임시등록(0) 상태의 캠페인만 삭제할 수 있습니다.' 
        });
      }

      // BizChat에 등록된 캠페인인 경우 BizChat API 호출
      // SIM_ 접두사는 시뮬레이션 ID이므로 BizChat 호출 생략
      const bizchatId = campaign.bizchatCampaignId;
      const isSimulation = bizchatId?.startsWith('SIM_');
      
      if (bizchatId && !isSimulation) {
        try {
          const host = req.headers.host || process.env.VERCEL_URL || 'localhost:5000';
          const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
          const protocol = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
          const baseUrl = `${protocol}://${host}`;
          
          const deleteResponse = await fetch(`${baseUrl}/api/bizchat/campaigns`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
            },
            body: JSON.stringify({
              action: 'delete',
              campaignIds: [bizchatId],
            }),
          });

          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json();
            console.error('BizChat deletion failed:', errorData);
            // BizChat 삭제 실패해도 로컬 삭제는 진행 (경고 로그만 남김)
            console.warn(`[DELETE] BizChat deletion failed for ${bizchatId}, proceeding with local deletion`);
          }
        } catch (bizchatError) {
          console.error('Error calling BizChat delete API:', bizchatError);
          // BizChat 통신 오류 시에도 로컬 삭제는 진행
          console.warn(`[DELETE] BizChat API communication failed, proceeding with local deletion`);
        }
      } else if (isSimulation) {
        console.log(`[DELETE] Skipping BizChat API call for simulation campaign: ${bizchatId}`);
      }

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
