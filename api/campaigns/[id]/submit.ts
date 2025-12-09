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
  sndMosuQuery: text('snd_mosu_query'),
  sndMosuDesc: text('snd_mosu_desc'),
  settleCnt: integer('settle_cnt').default(0),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
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

// 한국 시간대(KST, UTC+9) 기준으로 시간 정보 추출
function getKSTTimeComponents(date: Date): { hours: number; minutes: number; date: Date } {
  // KST는 UTC+9
  const kstOffset = 9 * 60; // 분 단위
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
  const kstTime = new Date(utcTime + (kstOffset * 60 * 1000));
  return {
    hours: kstTime.getHours(),
    minutes: kstTime.getMinutes(),
    date: kstTime,
  };
}

// 발송 시간 유효성 검증 (BizChat API 규격 v0.29.0)
// 1. 현재 시간 대비 1시간 이후여야 함
// 2. 9시부터 19시(19시 미포함) 사이여야 함 (KST 기준)
// 3. 10분 단위로 시간 체크
function validateSendTime(sendDate: Date | string | null): { valid: boolean; error?: string; adjustedDate?: Date } {
  if (!sendDate) return { valid: true };
  
  const targetDate = typeof sendDate === 'string' ? new Date(sendDate) : new Date(sendDate);
  const now = new Date();
  
  // KST 기준 시간 추출
  const kstTarget = getKSTTimeComponents(targetDate);
  
  // 1. 발송 시간대 체크 (09:00~19:00, 19시 미포함) - KST 기준
  if (kstTarget.hours < 9 || kstTarget.hours >= 19) {
    return { 
      valid: false, 
      error: `발송 시간은 09:00~19:00 사이여야 합니다 (현재: ${kstTarget.hours}:${kstTarget.minutes.toString().padStart(2, '0')} KST)` 
    };
  }
  
  // 2. 최소 1시간 여유 체크
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  if (targetDate < oneHourFromNow) {
    return { valid: false, error: '발송 시간은 현재 시간으로부터 최소 1시간 이후여야 합니다' };
  }
  
  // 3. 10분 단위 체크 (자동 올림 처리)
  const adjustedDate = new Date(targetDate);
  adjustedDate.setSeconds(0);
  adjustedDate.setMilliseconds(0);
  const minutes = adjustedDate.getMinutes();
  const remainder = minutes % 10;
  if (remainder !== 0) {
    adjustedDate.setMinutes(minutes + (10 - remainder));
  }
  
  // 조정 후 KST 기준으로 다시 체크
  const kstAdjusted = getKSTTimeComponents(adjustedDate);
  if (kstAdjusted.hours >= 19) {
    return { valid: false, error: '발송 시간은 19:00 이전이어야 합니다 (KST)' };
  }
  
  return { valid: true, adjustedDate };
}

// 문자열 길이 검증 (BizChat API 규격 v0.29.0)
function validateStringLengths(data: {
  name?: string;
  tgtCompanyName?: string;
  title?: string;
  msg?: string;
}): { valid: boolean; error?: string } {
  if (data.name && data.name.length > 40) {
    return { valid: false, error: `캠페인명은 최대 40자까지 입력 가능합니다 (현재: ${data.name.length}자)` };
  }
  if (data.tgtCompanyName && data.tgtCompanyName.length > 100) {
    return { valid: false, error: `고객사명은 최대 100자까지 입력 가능합니다 (현재: ${data.tgtCompanyName.length}자)` };
  }
  if (data.title && data.title.length > 30) {
    return { valid: false, error: `메시지 제목은 최대 30자까지 입력 가능합니다 (현재: ${data.title.length}자)` };
  }
  if (data.msg && data.msg.length > 1000) {
    return { valid: false, error: `메시지 본문은 최대 1000자까지 입력 가능합니다 (현재: ${data.msg.length}자)` };
  }
  return { valid: true };
}

async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  useProduction: boolean = false
): Promise<{ status: number; data: Record<string, unknown> }> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const envKeyName = useProduction ? 'BIZCHAT_PROD_API_KEY' : 'BIZCHAT_DEV_API_KEY';
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  console.log(`[BizChat Submit] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[BizChat Submit] Looking for env var: ${envKeyName}`);
  console.log(`[BizChat Submit] API key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
  console.log(`[BizChat Submit] VERCEL_ENV: ${process.env.VERCEL_ENV}, NODE_ENV: ${process.env.NODE_ENV}`);

  if (!apiKey) {
    console.error(`[BizChat Submit] ❌ API key not configured: ${envKeyName}`);
    console.error(`[BizChat Submit] Available keys - DEV: ${!!process.env.BIZCHAT_DEV_API_KEY}, PROD: ${!!process.env.BIZCHAT_PROD_API_KEY}`);
    throw new Error(`BizChat API 키가 설정되지 않았습니다 (${envKeyName}). Vercel 환경변수를 확인해주세요.`);
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
    // 전체 Request body 로깅 (truncation 없이)
    console.log(`[BizChat] Request body:`, JSON.stringify(body, null, 2));
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
  
  // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
  // SK 담당자 요청: 개발 완료될 때까지 상용 URL이 아닌 개발 URL(gw-dev.bizchat1.co.kr:8443)로 요청
  const detectProductionEnvironment = (): boolean => {
    // ⚠️ 개발 완료 전까지 항상 개발 API 사용
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
    if (forceDevMode) {
      console.log('[BizChat Submit] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
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

    // BizChat API 규격 v0.29.0: 문자열 길이 검증
    const lengthValidation = validateStringLengths({
      name: campaign.name,
      tgtCompanyName: campaign.tgtCompanyName || undefined,
      title: message?.title || undefined,
      msg: message?.content,
    });
    if (!lengthValidation.valid) {
      return res.status(400).json({ error: lengthValidation.error });
    }

    // BizChat API 규격 v0.29.0: 발송 시간 검증
    const sendDateToValidate = scheduledAt || campaign.atsSndStartDate || campaign.scheduledAt;
    const timeValidation = validateSendTime(sendDateToValidate);
    if (!timeValidation.valid) {
      return res.status(400).json({ error: timeValidation.error });
    }
    
    // 10분 단위로 조정된 발송 시간 사용
    const adjustedSendDate = timeValidation.adjustedDate || sendDateToValidate;

    if (!campaign.bizchatCampaignId) {
      // billingType 결정 (BizChat API 규격 v0.29.0)
      // 0: LMS (파일 없음, rcs 비어있음)
      // 1: RCS MMS (파일 있음, rcs 슬라이드)
      // 2: MMS (파일 있음, rcs 비어있음)
      // 3: RCS LMS (파일 없음, rcs 슬라이드)
      let billingType = 0;
      const hasImage = !!message?.imageUrl;
      if (campaign.messageType === 'RCS') {
        billingType = hasImage ? 1 : 3; // RCS MMS or RCS LMS
      } else if (campaign.messageType === 'MMS' || hasImage) {
        billingType = 2; // MMS
      }
      // else: LMS (0)

      const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
      const sndMosu = campaign.sndMosu || Math.min(Math.ceil(sndGoalCnt * 1.5), 400000);

      // BizChat API 규격 v0.29.0: billingType별 mms/rcs 구성
      // - LMS(0): mms만, fileInfo 없음, rcs 빈 배열
      // - RCS MMS(1): mms + rcs, 파일 있음
      // - MMS(2): mms만, fileInfo 있음, rcs 빈 배열
      // - RCS LMS(3): mms + rcs, 파일 없음
      const isRcs = billingType === 1 || billingType === 3;
      const needsFile = billingType === 1 || billingType === 2;
      
      // MMS 메시지 객체
      const mmsObject: Record<string, unknown> = {
        title: message?.title || '',
        msg: message?.content || '',
        fileInfo: (needsFile && message?.imageUrl) 
          ? { list: [{ origId: message.imageUrl }] } 
          : {}, // 파일이 없거나 불필요하면 empty object
        urlLink: {}, // 링크가 없으면 empty object
      };
      
      // RCS 메시지 배열 (billingType 1 또는 3일 때만 구성)
      const rcsArray = isRcs ? [{
        slideNum: 1,
        title: message?.title || '',
        msg: message?.content || '',
        imgOrigId: (needsFile && message?.imageUrl) ? message.imageUrl : undefined,
        urlLink: {}, // 링크가 없으면 empty object
        buttons: {}, // 버튼이 없으면 empty object
      }] : [];

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
        sndMosuFlag: 0, // 150% 체크 사용
        adverDeny: '1504',
        cb: {
          state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
        },
        mms: mmsObject,
        rcs: rcsArray,
      };

      // 타겟팅 정보 추가 (ATS 발송 모수 필터)
      // BizChat API는 sndMosuQuery를 JSON 문자열로 받음
      if (campaign.sndMosuQuery) {
        // 이미 문자열이면 그대로, 객체면 stringify
        const queryString = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
        createPayload.sndMosuQuery = queryString;
        console.log('[Submit] sndMosuQuery (string):', queryString);
      }
      // BizChat API 규격: sndMosuDesc는 HTML 형식이어야 함
      // 예: "<html><body><p>서울시 강남구, 남자, 25세 이상</p></body></html>"
      if (campaign.sndMosuDesc) {
        // 이미 HTML 형식이면 그대로 사용, 아니면 HTML로 감싸기
        const desc = campaign.sndMosuDesc;
        const isHtml = desc.startsWith('<html>') || desc.includes('<body>');
        createPayload.sndMosuDesc = isHtml 
          ? desc 
          : `<html><body><p>${desc}</p></body></html>`;
        console.log('[Submit] sndMosuDesc (html):', createPayload.sndMosuDesc);
      }

      // 10분 단위로 조정된 발송 시간 적용
      if (adjustedSendDate) {
        const adjustedTimestamp = toUnixTimestamp(
          typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate
        );
        createPayload.atsSndStartDate = adjustedTimestamp;
        console.log('[Submit] atsSndStartDate (adjusted):', adjustedTimestamp, new Date((adjustedTimestamp || 0) * 1000).toISOString());
      }

      // RCS 타입 설정 (billingType 1 또는 3일 때)
      if (isRcs && campaign.rcsType !== undefined) {
        createPayload.rcsType = campaign.rcsType;
        // slideCnt: rcsType=2(캐러셀)일 때 슬라이드 개수
        if (campaign.rcsType === 2) {
          createPayload.slideCnt = rcsArray.length || 1;
        }
      }

      console.log('[Submit] Creating campaign in BizChat...');
      console.log('[Submit] Full createPayload:', JSON.stringify(createPayload, null, 2));
      const createResult = await callBizChatAPI('/api/v1/cmpn/create', 'POST', createPayload, useProduction);
      
      if (createResult.data.code !== 'S000001') {
        console.error('[Submit] BizChat API error:', createResult.data);
        return res.status(400).json({
          error: `BizChat 캠페인 생성 실패: ${createResult.data.msg || createResult.data.code}`,
          response: createResult.data,
        });
      }
      
      const bizchatCampaignId = createResult.data.data?.id as string;
      
      if (!bizchatCampaignId) {
        return res.status(400).json({
          error: 'BizChat did not return campaign ID',
          response: createResult.data,
        });
      }

      // DB에 조정된 발송 시간도 저장 (재제출 시 일관성 유지)
      const updateData: Record<string, unknown> = { 
        bizchatCampaignId,
        statusCode: 0,
        status: 'temp_registered',
        updatedAt: new Date(),
      };
      if (adjustedSendDate) {
        updateData.atsSndStartDate = typeof adjustedSendDate === 'string' 
          ? new Date(adjustedSendDate) 
          : adjustedSendDate;
        updateData.scheduledAt = updateData.atsSndStartDate;
      }
      await db.update(campaigns)
        .set(updateData)
        .where(eq(campaigns.id, id));

      console.log(`[Submit] Created BizChat campaign: ${bizchatCampaignId}`);
      campaign.bizchatCampaignId = bizchatCampaignId;
    } else {
      // 재제출 시: 기존 BizChat 캠페인의 전체 페이로드 업데이트
      // billingType 재계산 (메시지 변경 시 반영)
      let billingType = 0;
      const hasImage = !!message?.imageUrl;
      if (campaign.messageType === 'RCS') {
        billingType = hasImage ? 1 : 3;
      } else if (campaign.messageType === 'MMS' || hasImage) {
        billingType = 2;
      }
      
      const isRcs = billingType === 1 || billingType === 3;
      const needsFile = billingType === 1 || billingType === 2;
      
      // 타겟팅/발송 수량 재계산
      const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
      const sndMosu = campaign.sndMosu || Math.min(Math.ceil(sndGoalCnt * 1.5), 400000);
      
      // 전체 업데이트 페이로드 구성 (생성 시와 동일한 필드 포함)
      const updatePayload: Record<string, unknown> = {
        name: campaign.name,
        tgtCompanyName: campaign.tgtCompanyName || '위픽',
        sndNum: campaign.sndNum,
        rcvType: campaign.rcvType ?? 0,
        sndGoalCnt: sndGoalCnt,
        billingType: billingType,
        settleCnt: campaign.settleCnt ?? sndGoalCnt,
        sndMosu: sndMosu,
        sndMosuFlag: 0,
        mms: {
          title: message?.title || '',
          msg: message?.content || '',
          fileInfo: (needsFile && message?.imageUrl) 
            ? { list: [{ origId: message.imageUrl }] } 
            : {},
          urlLink: {},
        },
        rcs: isRcs ? [{
          slideNum: 1,
          title: message?.title || '',
          msg: message?.content || '',
          imgOrigId: (needsFile && message?.imageUrl) ? message.imageUrl : undefined,
          urlLink: {},
          buttons: {},
        }] : [],
      };
      
      // 발송 시간 업데이트
      if (adjustedSendDate) {
        updatePayload.atsSndStartDate = toUnixTimestamp(
          typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate
        );
      }
      
      // RCS 타입 설정
      if (isRcs && campaign.rcsType !== undefined) {
        updatePayload.rcsType = campaign.rcsType;
        if (campaign.rcsType === 2) {
          updatePayload.slideCnt = 1;
        }
      }
      
      // sndMosuDesc/sndMosuQuery 업데이트 (타겟팅 필터)
      if (campaign.sndMosuQuery) {
        updatePayload.sndMosuQuery = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
      }
      if (campaign.sndMosuDesc) {
        const desc = campaign.sndMosuDesc;
        const isHtml = desc.startsWith('<html>') || desc.includes('<body>');
        updatePayload.sndMosuDesc = isHtml ? desc : `<html><body><p>${desc}</p></body></html>`;
      }
      
      console.log('[Submit] Updating existing BizChat campaign...');
      console.log('[Submit] Update payload:', JSON.stringify(updatePayload, null, 2));
      
      const updateResult = await callBizChatAPI(
        `/api/v1/cmpn/update?id=${campaign.bizchatCampaignId}`,
        'POST',
        updatePayload,
        useProduction
      );
      
      if (updateResult.data.code !== 'S000001') {
        console.warn('[Submit] BizChat update warning:', updateResult.data);
        // 업데이트 실패해도 승인 요청은 계속 진행
      } else {
        console.log('[Submit] BizChat campaign updated successfully');
      }
      
      // DB에도 조정된 시간 저장
      if (adjustedSendDate) {
        await db.update(campaigns)
          .set({ 
            atsSndStartDate: typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate,
            scheduledAt: typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate,
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, id));
      }
    }

    console.log('[Submit] Requesting approval...');
    const approvalResult = await callBizChatAPI(
      `/api/v1/cmpn/appr/req?id=${campaign.bizchatCampaignId}`,
      'POST',
      {},
      useProduction
    );

    if (approvalResult.data.code !== 'S000001') {
      console.error('[Submit] Approval request failed:', approvalResult.data);
      return res.status(400).json({
        error: `승인 요청 실패: ${approvalResult.data.msg || approvalResult.data.code}`,
        response: approvalResult.data,
      });
    }

    // 승인 요청 후 상태 업데이트 (조정된 발송 시간 유지)
    const approvalUpdateData: Record<string, unknown> = { 
      statusCode: 10,
      status: 'approval_requested',
      updatedAt: new Date(),
    };
    if (adjustedSendDate) {
      approvalUpdateData.scheduledAt = typeof adjustedSendDate === 'string' 
        ? new Date(adjustedSendDate) 
        : adjustedSendDate;
      approvalUpdateData.atsSndStartDate = approvalUpdateData.scheduledAt;
    }
    await db.update(campaigns)
      .set(approvalUpdateData)
      .where(eq(campaigns.id, id));

    console.log(`[Submit] Approval requested for campaign: ${id}`);
    
    return res.status(200).json({
      success: true,
      campaignId: id,
      bizchatCampaignId: campaign.bizchatCampaignId,
      statusCode: 10,
      status: 'approval_requested',
      message: scheduledAt 
        ? `캠페인이 BizChat에 등록되었고, ${new Date(scheduledAt).toLocaleString('ko-KR')}에 발송 예정입니다.`
        : '캠페인이 BizChat에 등록되었고, 승인 요청이 완료되었습니다.',
    });

  } catch (error) {
    console.error('[Submit] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
