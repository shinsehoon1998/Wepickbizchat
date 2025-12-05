import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, decimal } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

// Database tables
const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  balance: text('balance').default('0'),
});

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  templateId: text('template_id'),
  messageType: text('message_type'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  statusCode: integer('status_code').default(5),
  status: text('status').default('draft'),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  sndNum: text('snd_num'),
  sndGoalCnt: integer('snd_goal_cnt'),
  targetCount: integer('target_count').default(0),
  budget: text('budget'),
  atsSndStartDate: timestamp('ats_snd_start_date'),
  scheduledAt: timestamp('scheduled_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
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

// BizChat API 호출
async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown,
  useProduction: boolean = false
) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error(`BizChat API key not configured`);
  }

  const url = `${baseUrl}${endpoint}`;
  console.log(`[BizChat] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
    console.log(`[BizChat] Request body:`, JSON.stringify(body).substring(0, 500));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat] Response: ${response.status} - ${responseText.substring(0, 500)}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), message: responseText };
  }

  return { status: response.status, data };
}

// BizChat 캠페인 등록
async function registerCampaignToBizChat(campaign: any, message: any, useProduction: boolean = false) {
  // billingType 결정: 0=LMS, 1=RCS MMS, 2=MMS, 3=RCS LMS
  let billingType = 0;
  if (campaign.messageType === 'RCS') {
    billingType = campaign.rcsType === 2 ? 1 : 3; // 슬라이드=MMS, 나머지=LMS
  } else if (campaign.messageType === 'MMS') {
    billingType = 2;
  }

  const payload = {
    cpName: campaign.name,
    tgtCompanyName: campaign.tgtCompanyName || '위픽',
    rcvType: campaign.rcvType || 0, // 0=ATS
    billingType: billingType,
    rcsType: campaign.rcsType,
    sndNum: campaign.sndNum,
    sndGoalCnt: campaign.targetCount || campaign.sndGoalCnt,
    atsSndStartDate: campaign.atsSndStartDate || campaign.scheduledAt,
    msgTitle: message?.title || '',
    msgBody: message?.content || '',
    imgUrl: message?.imageUrl || '',
  };

  return callBizChatAPI('/bizchat/campaign', 'POST', payload, useProduction);
}

// BizChat 캠페인 상태 변경 (승인요청)
async function requestCampaignApproval(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/bizchat/campaign/${bizchatCampaignId}/approval`, 'POST', {}, useProduction);
}

// BizChat 캠페인 발송 시작
async function startCampaignSend(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/bizchat/campaign/${bizchatCampaignId}/send`, 'POST', {}, useProduction);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const useProduction = req.query.env === 'prod' || req.body?.env === 'prod';

  // POST: 캠페인을 BizChat에 등록
  if (req.method === 'POST') {
    try {
      const { campaignId, action } = req.body;

      if (!campaignId) {
        return res.status(400).json({ error: 'campaignId is required' });
      }

      // 캠페인 조회
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      if (campaignResult.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = campaignResult[0];

      // 권한 확인
      if (campaign.userId !== auth.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // 메시지 조회
      const messageResult = await db.select().from(messages).where(eq(messages.campaignId, campaignId));
      const message = messageResult[0];

      // action에 따라 처리
      switch (action) {
        case 'register': {
          // BizChat에 캠페인 등록
          if (campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign already registered to BizChat' });
          }

          const result = await registerCampaignToBizChat(campaign, message, useProduction);
          
          if (result.status !== 200 || result.data.code !== '0000') {
            return res.status(400).json({
              error: 'Failed to register campaign to BizChat',
              bizchatError: result.data,
            });
          }

          // BizChat 캠페인 ID 저장
          const bizchatCampaignId = result.data.data?.campaignId;
          if (bizchatCampaignId) {
            await db.update(campaigns)
              .set({ 
                bizchatCampaignId,
                statusCode: 5,
                status: 'draft',
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, campaignId));
          }

          return res.status(200).json({
            success: true,
            action: 'register',
            bizchatCampaignId,
            result: result.data,
          });
        }

        case 'approve': {
          // 승인 요청
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await requestCampaignApproval(campaign.bizchatCampaignId, useProduction);
          
          if (result.status !== 200 || result.data.code !== '0000') {
            return res.status(400).json({
              error: 'Failed to request approval',
              bizchatError: result.data,
            });
          }

          await db.update(campaigns)
            .set({ 
              statusCode: 10,
              status: 'approval_requested',
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, campaignId));

          return res.status(200).json({
            success: true,
            action: 'approve',
            result: result.data,
          });
        }

        case 'send': {
          // 발송 시작
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          if (campaign.statusCode !== 11 && campaign.statusCode !== 20) {
            return res.status(400).json({ error: 'Campaign must be approved before sending' });
          }

          const result = await startCampaignSend(campaign.bizchatCampaignId, useProduction);
          
          if (result.status !== 200 || result.data.code !== '0000') {
            return res.status(400).json({
              error: 'Failed to start campaign send',
              bizchatError: result.data,
            });
          }

          await db.update(campaigns)
            .set({ 
              statusCode: 30,
              status: 'running',
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, campaignId));

          return res.status(200).json({
            success: true,
            action: 'send',
            result: result.data,
          });
        }

        default:
          return res.status(400).json({ error: 'Invalid action. Use: register, approve, send' });
      }

    } catch (error) {
      console.error('[BizChat Campaigns] Error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  // GET: BizChat 캠페인 상태 조회
  if (req.method === 'GET') {
    try {
      const { campaignId } = req.query;

      if (!campaignId || typeof campaignId !== 'string') {
        return res.status(400).json({ error: 'campaignId query parameter is required' });
      }

      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      if (campaignResult.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = campaignResult[0];

      if (campaign.userId !== auth.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!campaign.bizchatCampaignId) {
        return res.status(200).json({
          registered: false,
          campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            statusCode: campaign.statusCode,
          },
        });
      }

      // BizChat에서 최신 상태 조회
      const result = await callBizChatAPI(
        `/bizchat/campaign/${campaign.bizchatCampaignId}`,
        'GET',
        undefined,
        useProduction
      );

      return res.status(200).json({
        registered: true,
        bizchatCampaignId: campaign.bizchatCampaignId,
        localStatus: {
          status: campaign.status,
          statusCode: campaign.statusCode,
        },
        bizchatStatus: result.data,
      });

    } catch (error) {
      console.error('[BizChat Campaigns] Error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
