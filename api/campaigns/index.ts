import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { randomUUID } from 'crypto';

neonConfig.fetchConnectionCache = true;

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

// Callback URL (Vercel 배포 도메인)
const CALLBACK_BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://wepickbizchat-new.vercel.app';

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  balance: numeric('balance').default('0').notNull(),
});

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  tgtCompanyName: text('tgt_company_name'),
  templateId: text('template_id'),
  messageType: text('message_type'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  sndNum: text('snd_num'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  sndMosuQuery: text('snd_mosu_query'),
  sndMosuDesc: text('snd_mosu_desc'),
  settleCnt: integer('settle_cnt').default(0),
  targetCount: integer('target_count'),
  sentCount: integer('sent_count'),
  successCount: integer('success_count'),
  budget: numeric('budget'),
  costPerMessage: numeric('cost_per_message'),
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

// Transaction ID 생성 (밀리초 타임스탬프)
function generateTid(): string {
  return Date.now().toString();
}

// 환경 감지 함수
function detectProductionEnvironment(req: VercelRequest): boolean {
  if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
  if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
  if (process.env.VERCEL_ENV === 'production') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return false;
}

// BizChat API 호출 (API 키가 없으면 시뮬레이션 모드)
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

  // API 키가 없으면 시뮬레이션 모드 반환
  if (!apiKey) {
    console.log('[BizChat] No API key configured, returning simulated response');
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
    console.log(`[BizChat] Request body:`, JSON.stringify(body).substring(0, 1000));
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

// 타겟팅 정보를 ATS 쿼리 형식으로 변환
function buildAtsQuery(targetingData: {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  regions?: string[];
  districts?: string[];
  carrierTypes?: string[];
  deviceTypes?: string[];
  shopping11stCategories?: string[];
  webappCategories?: string[];
  callUsageTypes?: string[];
  locationTypes?: string[];
  mobilityPatterns?: string[];
  geofenceIds?: string[];
}): { query: Record<string, unknown>; description: string } {
  const query: Record<string, unknown> = {};
  const descParts: string[] = [];

  // 성별
  if (targetingData.gender && targetingData.gender !== 'all') {
    query.gender = targetingData.gender === 'male' ? 'M' : 'F';
    descParts.push(`성별: ${targetingData.gender === 'male' ? '남성' : '여성'}`);
  }

  // 연령
  if (targetingData.ageMin !== undefined || targetingData.ageMax !== undefined) {
    query.age = {
      min: targetingData.ageMin || 20,
      max: targetingData.ageMax || 60,
    };
    descParts.push(`나이: ${targetingData.ageMin || 20}~${targetingData.ageMax || 60}세`);
  }

  // 지역
  if (targetingData.regions && targetingData.regions.length > 0) {
    query.region = targetingData.regions;
    descParts.push(`지역: ${targetingData.regions.join(', ')}`);
  }

  // 세부 지역 (시/군/구)
  if (targetingData.districts && targetingData.districts.length > 0) {
    query.district = targetingData.districts;
    descParts.push(`세부지역: ${targetingData.districts.join(', ')}`);
  }

  // 통신사
  if (targetingData.carrierTypes && targetingData.carrierTypes.length > 0) {
    query.carrier = targetingData.carrierTypes;
    descParts.push(`통신사: ${targetingData.carrierTypes.join(', ')}`);
  }

  // 단말기
  if (targetingData.deviceTypes && targetingData.deviceTypes.length > 0) {
    query.device = targetingData.deviceTypes;
    descParts.push(`단말기: ${targetingData.deviceTypes.join(', ')}`);
  }

  // 관심사 (쇼핑 + 앱 카테고리)
  const interests: string[] = [];
  if (targetingData.shopping11stCategories && targetingData.shopping11stCategories.length > 0) {
    interests.push(...targetingData.shopping11stCategories);
  }
  if (targetingData.webappCategories && targetingData.webappCategories.length > 0) {
    interests.push(...targetingData.webappCategories);
  }
  if (interests.length > 0) {
    query.interest = interests;
    descParts.push(`관심사: ${interests.join(', ')}`);
  }

  // 행동 (통화량 + 위치 + 이동패턴)
  const behaviors: string[] = [];
  if (targetingData.callUsageTypes && targetingData.callUsageTypes.length > 0) {
    behaviors.push(...targetingData.callUsageTypes);
  }
  if (targetingData.locationTypes && targetingData.locationTypes.length > 0) {
    behaviors.push(...targetingData.locationTypes);
  }
  if (targetingData.mobilityPatterns && targetingData.mobilityPatterns.length > 0) {
    behaviors.push(...targetingData.mobilityPatterns);
  }
  if (behaviors.length > 0) {
    query.behavior = behaviors;
    descParts.push(`행동: ${behaviors.join(', ')}`);
  }

  // 지오펜스
  if (targetingData.geofenceIds && targetingData.geofenceIds.length > 0) {
    query.geofence = targetingData.geofenceIds;
    descParts.push(`지오펜스: ${targetingData.geofenceIds.length}개`);
  }

  return {
    query,
    description: descParts.length > 0 ? descParts.join(' | ') : '전체 대상',
  };
}

// BizChat 캠페인 생성 (POST /api/v1/cmpn/create)
async function createCampaignInBizChat(
  campaignData: {
    name: string;
    tgtCompanyName?: string;
    messageType: string;
    sndNum: string;
    targetCount: number;
    rcsType?: number;
    rcvType?: number;
    atsSndStartDate?: Date | null;
    sndMosuQuery?: string;
    sndMosuDesc?: string;
  },
  messageData: {
    title?: string;
    content: string;
    imageUrl?: string | null;
  },
  useProduction: boolean = false
) {
  // billingType: 0=LMS, 1=RCS MMS, 2=MMS, 3=RCS LMS
  let billingType = 0;
  if (campaignData.messageType === 'RCS') {
    billingType = campaignData.rcsType === 2 ? 1 : 3;
  } else if (campaignData.messageType === 'MMS') {
    billingType = 2;
  }

  const sndGoalCnt = campaignData.targetCount || 1000;
  const sndMosu = Math.min(Math.ceil(sndGoalCnt * 1.5), 400000);

  // rcvType: 0=ATS 타겟팅, 10=MDN 직접 지정
  const rcvType = campaignData.rcvType ?? 0;

  // atsSndStartDate: rcvType=0,10일 때 필수 (Unix timestamp 초단위)
  // BizChat 규칙: 현재 시간 + 1시간 이후, 10분 단위로 올림
  const calculateValidSendDate = (requestedDate: Date | null | undefined): number => {
    const now = new Date();
    const minStartTime = new Date(now.getTime() + 60 * 60 * 1000); // 현재 + 1시간
    
    // 요청된 시간이 없거나 최소 시작 시간보다 이전이면 최소 시작 시간 사용
    let targetDate = requestedDate ? new Date(requestedDate) : minStartTime;
    if (targetDate < minStartTime) {
      targetDate = minStartTime;
    }
    
    // 항상 초/밀리초를 0으로 초기화
    targetDate.setSeconds(0);
    targetDate.setMilliseconds(0);
    
    // 10분 단위로 올림 (예: 11:13 → 11:20, 11:20 → 11:20)
    const minutes = targetDate.getMinutes();
    const remainder = minutes % 10;
    if (remainder > 0) {
      targetDate.setMinutes(minutes + (10 - remainder));
    }
    
    // 올림 후 다시 최소 시작 시간 확인 (경계 케이스)
    if (targetDate < minStartTime) {
      targetDate = new Date(minStartTime.getTime());
      targetDate.setSeconds(0);
      targetDate.setMilliseconds(0);
      const mins = targetDate.getMinutes();
      const rem = mins % 10;
      if (rem > 0) {
        targetDate.setMinutes(mins + (10 - rem));
      }
    }
    
    return Math.floor(targetDate.getTime() / 1000);
  };

  const payload: Record<string, unknown> = {
    tgtCompanyName: campaignData.tgtCompanyName || '위픽',
    name: campaignData.name,
    sndNum: campaignData.sndNum,
    rcvType: rcvType,
    sndGoalCnt: sndGoalCnt,
    billingType: billingType,
    isTmp: 0, // 임시저장 아님
    settleCnt: sndGoalCnt,
    sndMosu: sndMosu,
    sndMosuFlag: 0,
    adverDeny: '1504',
    // rcvType=0,10일 때 atsSndStartDate 필수 (10분 단위 올림, 현재+1시간 이후)
    atsSndStartDate: calculateValidSendDate(campaignData.atsSndStartDate),
    cb: {
      state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
    },
    mms: {
      title: messageData.title || '',
      msg: messageData.content || '',
      fileInfo: {},
      urlLink: { list: [] },
    },
    rcs: [],
  };

  // 발송 모수 설명/쿼리 (ATS 타겟팅 정보)
  if (campaignData.sndMosuDesc) {
    payload.sndMosuDesc = campaignData.sndMosuDesc;
  }
  if (campaignData.sndMosuQuery) {
    payload.sndMosuQuery = campaignData.sndMosuQuery;
  }

  // MMS 이미지 첨부
  if (campaignData.messageType === 'MMS' && messageData.imageUrl) {
    payload.mms = {
      ...payload.mms as object,
      fileInfo: {
        list: [{ origId: messageData.imageUrl }],
      },
    };
  }

  // RCS 타입
  if (campaignData.messageType === 'RCS' && campaignData.rcsType !== undefined) {
    payload.rcsType = campaignData.rcsType;
  }

  return callBizChatAPI('/api/v1/cmpn/create', 'POST', payload, useProduction);
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
  districts: z.array(z.string()).optional(),
  carrierTypes: z.array(z.string()).optional(),
  deviceTypes: z.array(z.string()).optional(),
  shopping11stCategories: z.array(z.string()).optional(),
  webappCategories: z.array(z.string()).optional(),
  callUsageTypes: z.array(z.string()).optional(),
  locationTypes: z.array(z.string()).optional(),
  mobilityPatterns: z.array(z.string()).optional(),
  geofenceIds: z.array(z.string()).optional(),
  targetCount: z.number().min(100).default(1000),
  budget: z.number().min(10000),
  scheduledAt: z.string().datetime().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();
  const userId = auth.userId;
  const useProduction = detectProductionEnvironment(req);

  console.log(`[Campaign] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

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

      // 타겟팅 정보를 ATS 쿼리로 변환
      const atsResult = buildAtsQuery({
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
        districts: data.districts,
        carrierTypes: data.carrierTypes,
        deviceTypes: data.deviceTypes,
        shopping11stCategories: data.shopping11stCategories,
        webappCategories: data.webappCategories,
        callUsageTypes: data.callUsageTypes,
        locationTypes: data.locationTypes,
        mobilityPatterns: data.mobilityPatterns,
        geofenceIds: data.geofenceIds,
      });

      const campaignId = randomUUID();

      // 1. 로컬 DB에 캠페인 저장 (초기 상태: draft)
      const campaignResult = await db.insert(campaigns).values({
        id: campaignId,
        userId,
        name: data.name,
        tgtCompanyName: '위픽',
        templateId: data.templateId,
        messageType: data.messageType,
        sndNum: data.sndNum,
        statusCode: 5, // draft (BizChat 등록 전)
        status: 'draft',
        rcvType: 0,
        billingType: data.messageType === 'MMS' ? 2 : (data.messageType === 'RCS' ? 3 : 0),
        sndGoalCnt: data.targetCount,
        sndMosu: Math.min(Math.ceil(data.targetCount * 1.5), 400000),
        sndMosuQuery: JSON.stringify(atsResult.query),
        sndMosuDesc: atsResult.description,
        settleCnt: data.targetCount,
        targetCount: data.targetCount,
        budget: data.budget.toString(),
        costPerMessage: '50',
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
        districts: data.districts || [],
        carrierTypes: data.carrierTypes || [],
        deviceTypes: data.deviceTypes || [],
        shopping11stCategories: data.shopping11stCategories || [],
        webappCategories: data.webappCategories || [],
        callUsageTypes: data.callUsageTypes || [],
        locationTypes: data.locationTypes || [],
        mobilityPatterns: data.mobilityPatterns || [],
        geofenceIds: data.geofenceIds || [],
        atsQuery: JSON.stringify(atsResult.query),
      });

      // 2. BizChat API에 캠페인 등록 (임시등록 상태 0)
      // rcvType=0일 때 atsSndStartDate 필수 - 없으면 기본값 설정 (현재 시간 + 1시간)
      const defaultSendDate = new Date();
      defaultSendDate.setHours(defaultSendDate.getHours() + 1);
      const atsSndStartDate = data.scheduledAt ? new Date(data.scheduledAt) : defaultSendDate;

      try {
        const bizchatResult = await createCampaignInBizChat(
          {
            name: data.name,
            tgtCompanyName: '위픽',
            messageType: data.messageType,
            sndNum: data.sndNum,
            targetCount: data.targetCount,
            rcvType: 0,
            atsSndStartDate: atsSndStartDate,
            sndMosuQuery: JSON.stringify(atsResult.query),
            sndMosuDesc: atsResult.description,
          },
          {
            title: template.title || undefined,
            content: template.content,
            imageUrl: template.imageUrl,
          },
          useProduction
        );

        if (bizchatResult.data.code === 'S000001') {
          const responseData = bizchatResult.data.data as { id?: string } | undefined;
          const bizchatCampaignId = responseData?.id;
          
          if (bizchatCampaignId) {
            // BizChat 캠페인 ID 저장
            await db.update(campaigns)
              .set({ 
                bizchatCampaignId,
                statusCode: 0, // 임시등록
                status: 'temp_registered',
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, campaignId));

            console.log(`[Campaign] Created in BizChat: ${bizchatCampaignId}`);

            return res.status(201).json({
              ...campaignResult[0],
              bizchatCampaignId,
              statusCode: 0,
              status: 'temp_registered',
              bizchatRegistered: true,
            });
          }
        }

        // BizChat 등록 실패 시 draft 상태 유지
        console.error('[Campaign] BizChat registration failed:', bizchatResult.data);
        
        return res.status(201).json({
          ...campaignResult[0],
          statusCode: 5,
          status: 'draft',
          bizchatRegistered: false,
          bizchatError: {
            code: bizchatResult.data.code,
            message: bizchatResult.data.msg || 'BizChat 등록 실패',
          },
          warning: 'BizChat 등록에 실패했습니다. 캠페인 상세에서 다시 등록해주세요.',
        });

      } catch (bizchatError) {
        console.error('[Campaign] BizChat API error:', bizchatError);
        
        return res.status(201).json({
          ...campaignResult[0],
          statusCode: 5,
          status: 'draft',
          bizchatRegistered: false,
          bizchatError: {
            code: 'API_ERROR',
            message: bizchatError instanceof Error ? bizchatError.message : 'BizChat API 오류',
          },
          warning: 'BizChat 서버 연결에 실패했습니다. 캠페인 상세에서 다시 등록해주세요.',
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error('Error creating campaign:', error);
      return res.status(500).json({ error: 'Failed to create campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
