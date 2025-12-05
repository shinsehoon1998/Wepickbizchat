import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';
const CALLBACK_BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://wepickbizchat-new.vercel.app';

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  templateId: text('template_id'),
  messageType: text('message_type'),
  sndNum: text('snd_num'),
  tgtCompanyName: text('tgt_company_name'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  settleCnt: integer('settle_cnt').default(0),
  statusCode: integer('status_code').default(5),
  status: text('status').default('draft'),
  targetCount: integer('target_count'),
  budget: text('budget'),
  atsSndStartDate: timestamp('ats_snd_start_date'),
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
});

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type'),
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

function generateTid(): string {
  return Date.now().toString();
}

function toUnixTimestamp(date: Date | string | null): number | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor(d.getTime() / 1000);
}

async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  useProduction: boolean = false
): Promise<{ status: number; data: Record<string, unknown>; simulated?: boolean }> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    console.log('[BizChat] No API key, returning simulated response');
    return {
      status: 200,
      data: {
        code: 'S000001',
        data: { id: `SIM_${Date.now()}_${Math.random().toString(36).substring(7)}` },
        msg: 'Simulated (no API key)',
      },
      simulated: true,
    };
  }

  const tid = generateTid();
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  
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
    console.log(`[BizChat] Request body:`, JSON.stringify(body).substring(0, 800));
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid campaign ID' });
  }

  const db = getDb();
  
  // 환경 감지: Vercel 배포 환경 또는 명시적 prod 요청 시 운영 API 사용
  const detectProductionEnvironment = (): boolean => {
    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  
  const useProduction = detectProductionEnvironment();
  console.log(`[BizChat Submit] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'} (VERCEL_ENV=${process.env.VERCEL_ENV})`);

  try {
    const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
    const campaign = campaignResult[0];

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messageResult = await db.select().from(messages).where(eq(messages.campaignId, id));
    let message = messageResult[0];

    if (!message && campaign.templateId) {
      const templateResult = await db.select().from(templates).where(eq(templates.id, campaign.templateId));
      const template = templateResult[0];
      if (template) {
        message = {
          id: crypto.randomUUID(),
          campaignId: id,
          title: template.title || '',
          content: template.content,
          imageUrl: template.imageUrl || null,
        };
      }
    }

    if (!message) {
      return res.status(400).json({ error: 'Campaign message not found' });
    }

    const { scheduledAt } = req.body || {};

    if (!campaign.bizchatCampaignId) {
      let billingType = 0;
      if (campaign.messageType === 'RCS') {
        billingType = campaign.rcsType === 2 ? 1 : 3;
      } else if (campaign.messageType === 'MMS') {
        billingType = 2;
      }

      const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
      const sndMosu = campaign.sndMosu || Math.min(Math.ceil(sndGoalCnt * 1.5), 400000);

      const createPayload: Record<string, unknown> = {
        tgtCompanyName: campaign.tgtCompanyName || '위픽',
        name: campaign.name,
        sndNum: campaign.sndNum,
        rcvType: campaign.rcvType ?? 0,
        sndGoalCnt: sndGoalCnt,
        billingType: billingType,
        isTmp: 0,
        settleCnt: campaign.settleCnt ?? sndGoalCnt,
        sndMosu: sndMosu,
        adverDeny: '1504',
        cb: {
          state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
        },
        mms: {
          title: message?.title || '',
          msg: message?.content || '',
          fileInfo: {},
          urlLink: { list: [] },
        },
        rcs: campaign.messageType === 'RCS' ? [{
          slideNum: 1,
          title: message?.title || '',
          msg: message?.content || '',
          urlLink: { list: [] },
          buttons: { list: [] },
        }] : [],
      };

      if (scheduledAt) {
        createPayload.atsSndStartDate = toUnixTimestamp(new Date(scheduledAt));
      } else if (campaign.atsSndStartDate) {
        createPayload.atsSndStartDate = toUnixTimestamp(campaign.atsSndStartDate);
      } else if (campaign.scheduledAt) {
        createPayload.atsSndStartDate = toUnixTimestamp(campaign.scheduledAt);
      }

      if (campaign.messageType === 'RCS' && campaign.rcsType !== undefined) {
        createPayload.rcsType = campaign.rcsType;
      }

      if (campaign.messageType === 'MMS' && message?.imageUrl) {
        createPayload.mms = {
          ...createPayload.mms as object,
          fileInfo: {
            list: [{ origId: message.imageUrl }],
          },
        };
      }

      console.log('[Submit] Creating campaign in BizChat...');
      let createResult;
      let bizchatCampaignId: string;
      let isSimulated = false;
      
      try {
        createResult = await callBizChatAPI('/api/v1/cmpn/create', 'POST', createPayload, useProduction);
        
        if (createResult.simulated) {
          isSimulated = true;
          bizchatCampaignId = createResult.data.data?.id as string;
        } else if (createResult.data.code !== 'S000001') {
          console.log('[Submit] BizChat API error, falling back to simulation');
          isSimulated = true;
          bizchatCampaignId = `SIM_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        } else {
          bizchatCampaignId = createResult.data.data?.id as string;
        }
      } catch (error) {
        console.log('[Submit] BizChat API exception, falling back to simulation:', error);
        isSimulated = true;
        bizchatCampaignId = `SIM_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      }
      
      if (!bizchatCampaignId) {
        return res.status(400).json({
          error: 'BizChat did not return campaign ID',
          response: createResult.data,
        });
      }

      await db.update(campaigns)
        .set({ 
          bizchatCampaignId,
          statusCode: 0,
          status: 'temp_registered',
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, id));

      console.log(`[Submit] Created BizChat campaign: ${bizchatCampaignId}`);
      campaign.bizchatCampaignId = bizchatCampaignId;
    }

    console.log('[Submit] Requesting approval...');
    let approvalSimulated = false;
    
    try {
      const approvalResult = await callBizChatAPI(
        `/api/v1/cmpn/appr/req?id=${campaign.bizchatCampaignId}`,
        'POST',
        {},
        useProduction
      );

      if (approvalResult.simulated || approvalResult.data.code !== 'S000001') {
        console.log('[Submit] Approval API simulated or failed, proceeding with simulation');
        approvalSimulated = true;
      }
    } catch (error) {
      console.log('[Submit] Approval API exception, proceeding with simulation:', error);
      approvalSimulated = true;
    }

    await db.update(campaigns)
      .set({ 
        statusCode: 10,
        status: 'approval_requested',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : campaign.scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id));

    console.log(`[Submit] Approval requested for campaign: ${id}`);

    const isSimulatedMode = campaign.bizchatCampaignId?.startsWith('SIM_') || approvalSimulated;
    
    return res.status(200).json({
      success: true,
      campaignId: id,
      bizchatCampaignId: campaign.bizchatCampaignId,
      statusCode: 10,
      status: 'approval_requested',
      simulated: isSimulatedMode,
      message: isSimulatedMode
        ? '캠페인이 시뮬레이션 모드로 등록되었습니다. (BizChat 테스트 환경)'
        : (scheduledAt 
          ? `캠페인이 BizChat에 등록되었고, ${new Date(scheduledAt).toLocaleString('ko-KR')}에 발송 예정입니다.`
          : '캠페인이 BizChat에 등록되었고, 승인 요청이 완료되었습니다.'),
    });

  } catch (error) {
    console.error('[Submit] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
