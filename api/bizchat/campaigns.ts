import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

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
  tgtCompanyName: text('tgt_company_name'),
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
  sndMosu: integer('snd_mosu'),
  settleCnt: integer('settle_cnt').default(0),
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

// Transaction ID 생성
function generateTid(): string {
  return Date.now().toString();
}

// BizChat API 호출 (v0.29.0 규격)
async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  useProduction: boolean = false
) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error(`BizChat API key not configured`);
  }

  const tid = generateTid();
  const url = `${baseUrl}${endpoint}?tid=${tid}`;
  console.log(`[BizChat] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
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
    data = { code: response.status.toString(), msg: responseText };
  }

  return { status: response.status, data };
}

// 날짜 포맷 변환 (ISO -> yyyyMMddHHmmss)
function formatDateForBizChat(date: Date | string | null): string | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// BizChat 캠페인 생성 (POST /api/v1/cmpn/create)
async function createCampaignInBizChat(campaign: any, message: any, useProduction: boolean = false) {
  // billingType: 0=LMS, 1=RCS MMS, 2=MMS, 3=RCS LMS
  let billingType = 0;
  if (campaign.messageType === 'RCS') {
    billingType = campaign.rcsType === 2 ? 1 : 3;
  } else if (campaign.messageType === 'MMS') {
    billingType = 2;
  }

  const payload: Record<string, unknown> = {
    cpName: campaign.name,
    tgtCompanyName: campaign.tgtCompanyName || '위픽',
    rcvType: campaign.rcvType || 0,
    billingType: billingType,
    sndNum: campaign.sndNum,
    sndGoalCnt: campaign.sndGoalCnt || campaign.targetCount || 1000,
    sndMosu: campaign.sndMosu || Math.ceil((campaign.sndGoalCnt || campaign.targetCount || 1000) * 1.5),
    settleCnt: campaign.settleCnt || campaign.sndGoalCnt || campaign.targetCount || 1000,
    adverDeny: 1504,
  };

  // 발송 시작일
  if (campaign.atsSndStartDate || campaign.scheduledAt) {
    payload.atsSndStartDate = formatDateForBizChat(campaign.atsSndStartDate || campaign.scheduledAt);
  }

  // RCS 타입
  if (campaign.messageType === 'RCS' && campaign.rcsType !== undefined) {
    payload.rcsType = campaign.rcsType;
  }

  // LMS/MMS 메시지
  if (campaign.messageType === 'LMS' || campaign.messageType === 'MMS') {
    payload.mms = {
      title: message?.title || '',
      body: message?.content || '',
    };
    if (campaign.messageType === 'MMS' && message?.imageUrl) {
      payload.mms = {
        ...payload.mms as object,
        imgFileId: message.imageUrl,
      };
    }
  }

  // RCS 메시지
  if (campaign.messageType === 'RCS') {
    payload.rcs = [{
      title: message?.title || '',
      body: message?.content || '',
    }];
  }

  return callBizChatAPI('/api/v1/cmpn/create', 'POST', payload, useProduction);
}

// BizChat 캠페인 수정 (POST /api/v1/cmpn/update)
async function updateCampaignInBizChat(bizchatCampaignId: string, updateData: Record<string, unknown>, useProduction: boolean = false) {
  const payload = {
    cpId: bizchatCampaignId,
    ...updateData,
  };
  return callBizChatAPI('/api/v1/cmpn/update', 'POST', payload, useProduction);
}

// BizChat 캠페인 승인 요청 (POST /api/v1/cmpn/appr/req)
async function requestCampaignApproval(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI('/api/v1/cmpn/appr/req', 'POST', { cpId: bizchatCampaignId }, useProduction);
}

// BizChat 캠페인 조회 (GET /api/v1/cmpn)
async function getCampaignFromBizChat(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn?cpId=${bizchatCampaignId}`, 'GET', undefined, useProduction);
}

// BizChat 캠페인 테스트 발송 (POST /api/v1/cmpn/test/send)
async function testSendCampaign(bizchatCampaignId: string, mdnList: string[], useProduction: boolean = false) {
  return callBizChatAPI('/api/v1/cmpn/test/send', 'POST', {
    cpId: bizchatCampaignId,
    mdnList: mdnList,
  }, useProduction);
}

// BizChat 캠페인 통계 조회 (GET /api/v1/cmpn/stat/read)
async function getCampaignStats(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/stat/read?cpId=${bizchatCampaignId}`, 'GET', undefined, useProduction);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  // POST: 캠페인 액션 처리
  if (req.method === 'POST') {
    try {
      const { campaignId, action, mdnList } = req.body;

      if (!campaignId) {
        return res.status(400).json({ error: 'campaignId is required' });
      }

      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      if (campaignResult.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = campaignResult[0];

      if (campaign.userId !== auth.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const messageResult = await db.select().from(messages).where(eq(messages.campaignId, campaignId));
      const message = messageResult[0];

      switch (action) {
        case 'create': {
          if (campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign already registered to BizChat' });
          }

          const result = await createCampaignInBizChat(campaign, message, useProduction);
          
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              error: 'Failed to create campaign in BizChat',
              bizchatError: result.data,
            });
          }

          const bizchatCampaignId = result.data.data?.cpId;
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
            action: 'create',
            bizchatCampaignId,
            result: result.data,
          });
        }

        case 'approve': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await requestCampaignApproval(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code !== 'S000001') {
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

        case 'test': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          if (!mdnList || !Array.isArray(mdnList) || mdnList.length === 0) {
            return res.status(400).json({ error: 'mdnList is required for test send' });
          }

          if (mdnList.length > 20) {
            return res.status(400).json({ error: 'Maximum 20 numbers for test send' });
          }

          const result = await testSendCampaign(campaign.bizchatCampaignId, mdnList, useProduction);
          
          return res.status(200).json({
            success: result.data.code === 'S000001',
            action: 'test',
            result: result.data,
          });
        }

        case 'stats': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await getCampaignStats(campaign.bizchatCampaignId, useProduction);
          
          return res.status(200).json({
            success: result.data.code === 'S000001',
            action: 'stats',
            result: result.data,
          });
        }

        default:
          return res.status(400).json({ 
            error: 'Invalid action',
            validActions: ['create', 'approve', 'test', 'stats'],
          });
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

      const result = await getCampaignFromBizChat(campaign.bizchatCampaignId, useProduction);

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
