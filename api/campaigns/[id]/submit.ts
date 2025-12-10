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

// 지역명 → hcode 매핑 (BizChat API 규격 v0.29.0)
const REGION_HCODE_MAP: Record<string, string> = {
  '서울': '11', '경기': '41', '인천': '28', '부산': '26', '대구': '27',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36', '강원': '51',
  '충북': '43', '충남': '44', '전북': '52', '전남': '46', '경북': '47',
  '경남': '48', '제주': '50',
};

// BizChat API 규격 v0.31.0에 맞는 ATS 필터 조건 인터페이스
interface ATSFilterCondition {
  data: unknown;
  dataType: 'number' | 'code' | 'boolean' | 'cate';
  metaType: 'svc' | 'loc' | 'pro' | 'app' | 'tel' | 'STREET';
  code: string;
  desc: string;
  not: boolean;
}

// BizChat ATS 규격에 맞는 카테고리 데이터 인터페이스
interface CategoryData {
  cat1: string;
  cat2?: string;
  cat3?: string;
}

// 앱/웹 카테고리 코드 → 카테고리 구조 매핑
const APP_CATEGORY_MAP: Record<string, CategoryData> = {
  '11ST_002': { cat1: '가구/인테리어', cat2: '침대/소파' },
  'APP_002': { cat1: '게임', cat2: '보드게임' },
  'GAME_001': { cat1: '게임' },
  'EDU_001': { cat1: '교육/학습' },
  'ENT_001': { cat1: '엔터테인먼트' },
  'SHOP_001': { cat1: '쇼핑' },
  'FINANCE_001': { cat1: '금융' },
  'TRAVEL_001': { cat1: '여행/교통' },
  'FOOD_001': { cat1: '음식/배달' },
  'HEALTH_001': { cat1: '건강/의료' },
};

// 예측 모델(pro) 코드 매핑 - 규격서 기준
const PROFILING_CODE_MAP: Record<string, { code: string; dataType: 'boolean' | 'number' | 'code'; desc: string }> = {
  'CALL_002': { code: 'cpm12', dataType: 'number', desc: 'MMS스코어' },
  'LOC_001': { code: 'cpm04', dataType: 'number', desc: '이사 확률' },
  'GOLF': { code: 'cpm06', dataType: 'boolean', desc: '레저 관련 방문(골프)' },
  'CAMPING': { code: 'cpm07', dataType: 'boolean', desc: '레저 관련 방문(캠핑)' },
  'HIKING': { code: 'cpm08', dataType: 'boolean', desc: '레저 관련 방문(등산)' },
  'SKI': { code: 'cpm09', dataType: 'boolean', desc: '레저 관련 방문(스키장)' },
  'THEME_PARK': { code: 'cpm10', dataType: 'boolean', desc: '레저 관련 방문(워터파크/놀이공원)' },
  'LIFE_STAGE': { code: 'life_stage_seg', dataType: 'code', desc: 'Life Stage Seg.' },
  'SELF_EMPLOYED': { code: 'self_employed_yn', dataType: 'boolean', desc: '자영업자 추정' },
  'OFFICE_WORKER': { code: 'PF00003-s01', dataType: 'boolean', desc: '직장인 추정' },
};

// 구형 sndMosuQuery 형식을 BizChat API 규격에 맞게 변환
function convertLegacySndMosuQuery(queryStr: string): { query: string; desc: string } {
  try {
    const parsed = JSON.parse(queryStr);
    
    // 이미 올바른 형식인지 확인
    // Case 1: $and/$or 컨테이너가 있는 경우 - 내부 조건 검증 후 반환
    if (parsed['$and'] || parsed['$or']) {
      console.log('[Submit] sndMosuQuery has $and/$or container, validating conditions...');
      const container = parsed['$and'] || parsed['$or'];
      const operator = parsed['$and'] ? '$and' : '$or';
      
      // 각 조건 검증 및 변환
      const validatedConditions: ATSFilterCondition[] = [];
      const descParts: string[] = [];
      
      for (const cond of container) {
        const validated = validateAndConvertCondition(cond);
        if (validated) {
          validatedConditions.push(validated);
          if (validated.desc) descParts.push(validated.desc);
        }
      }
      
      const newQuery = { [operator]: validatedConditions };
      console.log('[Submit] Validated sndMosuQuery:', JSON.stringify(newQuery));
      return { query: JSON.stringify(newQuery), desc: descParts.join(', ') };
    }
    
    // Case 2: 단일 조건 객체 (metaType/code/dataType 필드가 있는 경우)
    if (parsed.metaType && parsed.dataType) {
      console.log('[Submit] sndMosuQuery is single condition, validating and wrapping in $and');
      const validated = validateAndConvertCondition(parsed);
      if (validated) {
        const wrapped = { '$and': [validated] };
        return { query: JSON.stringify(wrapped), desc: validated.desc || '' };
      }
      return { query: JSON.stringify({ '$and': [] }), desc: '' };
    }

    // 구형 형식: { age: { min, max }, gender, region: [...], interest: [...], behavior: [...] }
    const conditions: ATSFilterCondition[] = [];
    const descParts: string[] = [];

    // 연령 변환 (BizChat 규격: gt/lt 사용)
    if (parsed.age && (parsed.age.min !== undefined || parsed.age.max !== undefined)) {
      const min = parsed.age.min ?? 0;
      const max = parsed.age.max ?? 100;
      conditions.push({
        data: { gt: min, lt: max },
        dataType: 'number',
        metaType: 'svc',
        code: 'cust_age_cd',
        desc: `연령: ${min}세 ~ ${max}세`,
        not: false,
      });
      descParts.push(`연령: ${min}세 ~ ${max}세`);
    }

    // 성별 변환 (BizChat API 규격: code는 'sex_cd', data는 ['1'] 또는 ['2'])
    if (parsed.gender && parsed.gender !== 'all') {
      const genderValue = parsed.gender === 'male' || parsed.gender === 'M' ? '1' : '2';
      const genderName = genderValue === '1' ? '남자' : '여자';
      conditions.push({
        data: [genderValue],
        dataType: 'code',
        metaType: 'svc',
        code: 'sex_cd',
        desc: `성별: ${genderName}`,
        not: false,
      });
      descParts.push(`성별: ${genderName}`);
    }

    // 지역 변환 (region 또는 regions 둘 다 지원)
    const regions = parsed.region || parsed.regions;
    if (regions && Array.isArray(regions) && regions.length > 0) {
      const hcodes: string[] = [];
      const regionNames: string[] = [];
      for (const region of regions) {
        const hcode = REGION_HCODE_MAP[region];
        if (hcode) {
          hcodes.push(hcode);
          regionNames.push(region);
        }
      }
      if (hcodes.length > 0) {
        conditions.push({
          data: hcodes,
          dataType: 'code',
          metaType: 'loc',
          code: 'home_location',
          desc: `추정 집주소: ${regionNames.join(', ')}`,
          not: false,
        });
        descParts.push(`지역: ${regionNames.join(', ')}`);
      }
    }

    // 관심사(interests) - BizChat ATS에서 실제 지원하는 카테고리가 아닌 경우 스킵
    // 현재 UI에서 선택하는 관심사 코드(11ST_002, APP_002 등)는 내부 코드이며,
    // BizChat ATS는 실제 카테고리명(예: "게임", "VR/AR게임")만 지원
    // 정확한 카테고리 매핑이 완료되기 전까지는 app 필터를 제외
    const interests = parsed.interest || parsed.interests;
    if (interests && Array.isArray(interests) && interests.length > 0) {
      console.log('[Submit] Skipping app filter until proper category mapping is implemented:', interests);
      // TODO: BizChat /api/v1/ats/meta/webapp API로 실제 카테고리 조회 후 매핑 필요
    }

    // 행동(behaviors) - BizChat ATS에서 실제 지원하는 pro 코드만 허용
    // 현재 UI에서 선택하는 행동 코드(LOC_001, CALL_002 등)는 내부 코드이며,
    // 정확한 매핑이 완료되기 전까지는 pro 필터를 제외
    const behaviors = parsed.behavior || parsed.behaviors;
    if (behaviors && Array.isArray(behaviors) && behaviors.length > 0) {
      console.log('[Submit] Skipping pro filter until proper code mapping is verified:', behaviors);
      // TODO: BizChat /api/v1/ats/meta/filter?type=pro API로 실제 코드 확인 후 매핑 필요
    }

    // 통신사(carrier) - BizChat 규격에 없음, 스킵
    const carrier = parsed.carrier || parsed.carrierTypes;
    if (carrier && Array.isArray(carrier) && carrier.length > 0) {
      console.log('[Submit] Skipping carrier filter (not in BizChat spec):', carrier);
    }

    // 기기(device) - BizChat 규격에 없음, 스킵
    const device = parsed.device || parsed.deviceTypes;
    if (device && Array.isArray(device) && device.length > 0) {
      console.log('[Submit] Skipping device filter (not in BizChat spec):', device);
    }

    // BizChat API 규격: 루트 객체는 항상 $and 컨테이너여야 함
    const newQuery = { '$and': conditions };
    const result = JSON.stringify(newQuery);
    console.log('[Submit] Converted legacy sndMosuQuery:', result);
    return { query: result, desc: descParts.join(', ') };
  } catch (e) {
    console.error('[Submit] Failed to convert sndMosuQuery:', e);
    return { query: JSON.stringify({ '$and': [] }), desc: '' };
  }
}

// 개별 조건 검증 및 변환
function validateAndConvertCondition(cond: Record<string, unknown>): ATSFilterCondition | null {
  if (!cond.metaType || !cond.dataType) {
    console.log('[Submit] Invalid condition (missing metaType/dataType):', cond);
    return null;
  }

  const metaType = cond.metaType as string;
  const dataType = cond.dataType as string;
  const code = cond.code as string || '';
  const desc = cond.desc as string || '';
  const not = cond.not as boolean || false;
  let data = cond.data;

  // svc 메타타입 검증
  if (metaType === 'svc') {
    const validSvcCodes = ['cust_age_cd', 'sex_cd', 'ad_agr_yn', 'sms_rejt_yn', 'smile_yn', 'prod_scrb', 'mbr_card_gr_cd'];
    if (!validSvcCodes.includes(code)) {
      console.log(`[Submit] Invalid svc code "${code}", skipping`);
      return null;
    }
  }

  // app/tel 메타타입 - 정확한 카테고리 매핑이 완료되기 전까지 스킵
  // BizChat ATS는 실제 카테고리명(예: "게임", "VR/AR게임")만 지원하며,
  // 현재 UI에서 사용하는 코드(11ST_002 등)와 매핑되지 않음
  if (metaType === 'app' || metaType === 'tel') {
    console.log(`[Submit] Skipping ${metaType} filter until proper category mapping is implemented`);
    return null;
  }

  // pro 메타타입 - 정확한 코드 매핑이 완료되기 전까지 스킵
  // 현재 UI에서 사용하는 코드(LOC_001, CALL_002 등)가 BizChat ATS 코드와 매핑되지 않음
  if (metaType === 'pro') {
    console.log(`[Submit] Skipping pro filter until proper code mapping is verified`);
    return null;
  }

  // loc 메타타입 검증
  if (metaType === 'loc') {
    const validLocCodes = ['home_location', 'work_location'];
    if (!validLocCodes.includes(code)) {
      console.log(`[Submit] Invalid loc code "${code}", skipping`);
      return null;
    }
  }

  return {
    data,
    dataType: dataType as 'number' | 'code' | 'boolean' | 'cate',
    metaType: metaType as 'svc' | 'loc' | 'pro' | 'app' | 'tel',
    code,
    desc,
    not,
  };
}

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

// ATS 발송 모수 API 호출하여 SQL 형식의 query 획득
// BizChat API 규격: /api/v1/ats/mosu 호출 후 응답의 query 필드를 sndMosuQuery에 사용
async function callATSMosuAPI(
  filterPayload: Record<string, unknown>,
  useProduction: boolean = false
): Promise<{ success: boolean; query: string; filterStr: string; count: number; error?: string }> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    return { success: false, query: '', filterStr: '', count: 0, error: 'API key not configured' };
  }

  const tid = generateTid();
  const url = `${baseUrl}/api/v1/ats/mosu?tid=${tid}`;
  
  console.log(`[ATS Mosu] POST ${url}`);
  console.log(`[ATS Mosu] Payload:`, JSON.stringify(filterPayload, null, 2));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify(filterPayload),
    });

    const responseText = await response.text();
    console.log(`[ATS Mosu] Response: ${response.status} - ${responseText.substring(0, 1000)}`);

    const data = JSON.parse(responseText);
    
    if (data.code === 'S000001' && data.data?.query) {
      console.log(`[ATS Mosu] Success - query: ${data.data.query.substring(0, 200)}...`);
      return {
        success: true,
        query: data.data.query, // SQL 형식의 query 문자열
        filterStr: data.data.filterStr || '',
        count: data.data.cnt || 0,
      };
    }
    
    console.error(`[ATS Mosu] Failed - code: ${data.code}, msg: ${data.msg}`);
    return { 
      success: false, 
      query: '', 
      filterStr: '', 
      count: 0, 
      error: `ATS API failed: ${data.code} - ${data.msg}` 
    };
  } catch (error) {
    console.error(`[ATS Mosu] Error:`, error);
    return { 
      success: false, 
      query: '', 
      filterStr: '', 
      count: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
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
      
      // BizChat API 규격 v0.29.0: MMS 메시지 객체
      // - fileInfo: 파일이 있으면 { list: [...] }, 없으면 빈 객체 {} (문서 예제 참고)
      // - urlLink: URL이 있으면 { list: [...] }, 없으면 빈 객체 {} (문서 예제 참고)
      // URL 리스트 추출 (message에서 urlLinks 또는 urls 필드)
      const mmsUrlList: string[] = (message as any)?.urlLinks || (message as any)?.urls || [];
      const mmsUrlLink = mmsUrlList.length > 0 
        ? { list: mmsUrlList.slice(0, 3) }
        : {}; // 링크가 없으면 빈 객체 {} (문서 규격)
        
      const mmsObject: Record<string, unknown> = {
        title: message?.title || '',
        msg: message?.content || '',
        fileInfo: (needsFile && message?.imageUrl) 
          ? { list: [{ origId: message.imageUrl }] } 
          : {}, // 파일이 없으면 빈 객체 {} (문서 규격)
        urlFile: (message as any)?.urlFile || '', // 필수 필드: 실제 값 있으면 사용, 없으면 빈 문자열 (문서 규격)
        urlLink: mmsUrlLink,
      };
      
      // BizChat API 규격 v0.29.0: RCS 배열
      // 문서 예제: LMS(billingType=0)일 때도 "rcs": [] 빈 배열 포함
      // billingType 1(RCS MMS), 3(RCS LMS)일 때는 rcs 슬라이드 데이터 필요
      const rcsUrlLink = mmsUrlList.length > 0 
        ? { list: mmsUrlList.slice(0, 3) }
        : {}; // 링크가 없으면 빈 객체 {} (문서 규격)
        
      const rcsArray = isRcs ? [{
        slideNum: 1,
        title: message?.title || '',
        msg: message?.content || '',
        imgOrigId: (needsFile && message?.imageUrl) ? message.imageUrl : undefined,
        urlFile: (message as any)?.rcsUrlFile || '', // 필수 필드: 실제 값 있으면 사용, 없으면 빈 문자열 (문서 규격)
        urlLink: rcsUrlLink,
        buttons: (message as any)?.rcsButtons?.length > 0 
          ? { list: (message as any).rcsButtons.map((btn: any) => ({ ...btn, type: String(btn.type) })) }
          : {}, // 버튼이 없으면 빈 객체 {} (문서 규격)
        opts: (message as any)?.rcsOpts?.list?.length > 0 
          ? (message as any).rcsOpts 
          : {}, // 상품소개세로가 아니면 빈 객체 {} (문서 규격)
      }] : []; // LMS/MMS일 때는 빈 배열 [] (문서 예제 참고)

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
      };
      
      // BizChat API 규격 v0.29.0: rcs 필드는 항상 포함 (문서 예제: "rcs": [])
      createPayload.rcs = rcsArray;

      // 타겟팅 정보 추가 (ATS 발송 모수 필터)
      // BizChat API 규격: sndMosuQuery는 ATS mosu API 응답의 query 문자열(SQL 형식)을 사용해야 함
      let atsFilterStr = '';
      if (campaign.sndMosuQuery) {
        const queryString = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
        
        // JSON 형식의 필터 조건을 ATS mosu API에 전송하여 SQL query 획득
        const { query: convertedQuery, desc } = convertLegacySndMosuQuery(queryString);
        let filterPayload: Record<string, unknown>;
        try {
          filterPayload = JSON.parse(convertedQuery);
        } catch {
          filterPayload = { '$and': [] };
        }
        
        console.log('[Submit] Calling ATS mosu API to get SQL query...');
        console.log('[Submit] Filter payload:', JSON.stringify(filterPayload, null, 2));
        
        // ATS mosu API 호출하여 SQL 형식의 query 획득
        const atsResult = await callATSMosuAPI(filterPayload, useProduction);
        
        if (atsResult.success && atsResult.query) {
          // ATS API 응답의 SQL query를 sndMosuQuery로 사용
          createPayload.sndMosuQuery = atsResult.query;
          atsFilterStr = atsResult.filterStr;
          console.log('[Submit] sndMosuQuery (SQL from ATS):', atsResult.query.substring(0, 200) + '...');
          console.log('[Submit] ATS count:', atsResult.count);
        } else {
          // ATS API 실패 시 에러 반환
          console.error('[Submit] ATS mosu API failed:', atsResult.error);
          return res.status(400).json({
            error: `ATS 타겟팅 조회 실패: ${atsResult.error || 'Unknown error'}`,
            hint: 'ATS 발송 모수 API 호출에 실패했습니다. 타겟팅 조건을 확인해주세요.',
          });
        }
      }
      
      // BizChat API 규격: sndMosuDesc는 HTML 형식이어야 함
      // 우선순위: 1. ATS API 응답의 filterStr, 2. DB에 저장된 sndMosuDesc
      if (atsFilterStr || campaign.sndMosuDesc) {
        const desc = atsFilterStr || campaign.sndMosuDesc || '';
        const isHtml = desc.startsWith('<html>') || desc.includes('<body>') || desc.includes('<table>');
        createPayload.sndMosuDesc = isHtml 
          ? desc 
          : `<html><body><p>${desc}</p></body></html>`;
        console.log('[Submit] sndMosuDesc:', createPayload.sndMosuDesc?.toString().substring(0, 200) + '...');
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
      
      // URL 리스트 추출
      const updateMmsUrlList: string[] = (message as any)?.urlLinks || (message as any)?.urls || [];
      const updateMmsUrlLink = updateMmsUrlList.length > 0 
        ? { list: updateMmsUrlList.slice(0, 3) }
        : {}; // 링크가 없으면 빈 객체 {} (문서 규격)
      
      // BizChat API 규격 v0.29.0: 전체 업데이트 페이로드 구성
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
            : {}, // 파일 없으면 빈 객체 {} (문서 규격)
          urlFile: (message as any)?.urlFile || '', // 필수 필드: 실제 값 있으면 사용, 없으면 빈 문자열 (문서 규격)
          urlLink: updateMmsUrlLink,
        },
      };
      
      // BizChat API 규격 v0.29.0: rcs 필드는 항상 포함
      const updateRcsUrlLink = updateMmsUrlList.length > 0 
        ? { list: updateMmsUrlList.slice(0, 3) }
        : {}; // 링크가 없으면 빈 객체 {} (문서 규격)
        
      if (isRcs) {
        updatePayload.rcs = [{
          slideNum: 1,
          title: message?.title || '',
          msg: message?.content || '',
          imgOrigId: (needsFile && message?.imageUrl) ? message.imageUrl : undefined,
          urlFile: (message as any)?.rcsUrlFile || '', // 필수 필드: 실제 값 있으면 사용, 없으면 빈 문자열 (문서 규격)
          urlLink: updateRcsUrlLink,
          buttons: (message as any)?.rcsButtons?.length > 0 
            ? { list: (message as any).rcsButtons.map((btn: any) => ({ ...btn, type: String(btn.type) })) }
            : {}, // 버튼이 없으면 빈 객체 {} (문서 규격)
          opts: (message as any)?.rcsOpts?.list?.length > 0 
            ? (message as any).rcsOpts 
            : {}, // 상품소개세로가 아니면 빈 객체 {} (문서 규격)
        }];
      } else {
        // LMS/MMS일 때도 rcs 필드는 빈 배열로 포함 (문서 예제 참고)
        updatePayload.rcs = [];
      }
      
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
      // BizChat API 규격: sndMosuQuery는 ATS mosu API 응답의 query 문자열(SQL 형식)을 사용해야 함
      let updateAtsFilterStr = '';
      if (campaign.sndMosuQuery) {
        const queryString = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
        
        // JSON 형식의 필터 조건을 ATS mosu API에 전송하여 SQL query 획득
        const { query: convertedQuery } = convertLegacySndMosuQuery(queryString);
        let filterPayload: Record<string, unknown>;
        try {
          filterPayload = JSON.parse(convertedQuery);
        } catch {
          filterPayload = { '$and': [] };
        }
        
        console.log('[Submit Update] Calling ATS mosu API to get SQL query...');
        console.log('[Submit Update] Filter payload:', JSON.stringify(filterPayload, null, 2));
        
        // ATS mosu API 호출하여 SQL 형식의 query 획득
        const atsResult = await callATSMosuAPI(filterPayload, useProduction);
        
        if (atsResult.success && atsResult.query) {
          // ATS API 응답의 SQL query를 sndMosuQuery로 사용
          updatePayload.sndMosuQuery = atsResult.query;
          updateAtsFilterStr = atsResult.filterStr;
          console.log('[Submit Update] sndMosuQuery (SQL from ATS):', atsResult.query.substring(0, 200) + '...');
        } else {
          // ATS API 실패 시 에러 반환
          console.error('[Submit Update] ATS mosu API failed:', atsResult.error);
          return res.status(400).json({
            error: `ATS 타겟팅 조회 실패: ${atsResult.error || 'Unknown error'}`,
            hint: 'ATS 발송 모수 API 호출에 실패했습니다. 타겟팅 조건을 확인해주세요.',
          });
        }
      }
      
      if (updateAtsFilterStr || campaign.sndMosuDesc) {
        const desc = updateAtsFilterStr || campaign.sndMosuDesc || '';
        const isHtml = desc.startsWith('<html>') || desc.includes('<body>') || desc.includes('<table>');
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
