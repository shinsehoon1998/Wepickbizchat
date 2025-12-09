import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

// 지역명 → hcode 매핑 (BizChat API 규격)
const REGION_HCODE_MAP: Record<string, string> = {
  '서울': '11',
  '경기': '41',
  '인천': '28',
  '부산': '26',
  '대구': '27',
  '광주': '29',
  '대전': '30',
  '울산': '31',
  '세종': '36',
  '강원': '51',
  '충북': '43',
  '충남': '44',
  '전북': '52',
  '전남': '46',
  '경북': '47',
  '경남': '48',
  '제주': '50',
};

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

// BizChat API 규격 v0.29.0에 맞는 ATS 필터 조건 생성
interface ATSFilterCondition {
  data: unknown;
  dataType: 'number' | 'code' | 'boolean' | 'cate';
  metaType: 'svc' | 'loc' | 'pro' | 'app' | 'STREET' | 'TEL';
  code: string;
  desc: string;
  not: boolean;
}

// 타겟팅 조건을 BizChat ATS mosu 형식으로 변환
function buildATSMosuPayload(params: {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  regions?: string[];
}): { payload: { '$and': ATSFilterCondition[] }; desc: string } {
  const conditions: ATSFilterCondition[] = [];
  const descParts: string[] = [];

  // 연령 필터 (metaType: svc, code: cust_age_cd)
  if (params.ageMin !== undefined || params.ageMax !== undefined) {
    const min = params.ageMin ?? 0;
    const max = params.ageMax ?? 100;
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

  // 성별 필터 (BizChat API 규격: code는 'sex_cd', data는 ['1'] 또는 ['2'])
  if (params.gender && params.gender !== 'all') {
    const genderValue = params.gender === 'male' ? '1' : '2';
    const genderName = params.gender === 'male' ? '남자' : '여자';
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

  // 지역 필터 (metaType: loc, code: home_location)
  if (params.regions && Array.isArray(params.regions) && params.regions.length > 0) {
    const hcodes: string[] = [];
    const regionNames: string[] = [];
    for (const region of params.regions) {
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

  // BizChat API 규격: 루트 객체는 항상 $and 또는 $or 컨테이너여야 함
  // 조건이 없어도 {$and: []}로 반환
  return { 
    payload: { '$and': conditions },
    desc: descParts.join(', ')
  };
}

async function callBizChatATSMosu(
  filterPayload: Record<string, unknown>,
  useProduction: boolean = false
) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const tid = generateTid();
  // BizChat API 규격: /api/v1/ats/mosu 엔드포인트 사용
  const url = `${baseUrl}/api/v1/ats/mosu?tid=${tid}`;
  
  console.log(`[BizChat ATS Mosu] POST ${url}`);
  console.log(`[BizChat ATS Mosu] Payload:`, JSON.stringify(filterPayload, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify(filterPayload),
  });

  const responseText = await response.text();
  console.log(`[BizChat ATS Mosu] Response: ${response.status} - ${responseText.substring(0, 500)}`);

  try {
    return JSON.parse(responseText);
  } catch {
    return { code: response.status.toString(), msg: responseText };
  }
}

interface AdvancedTargetingOptions {
  districts?: string[];
  carrierTypes?: string[];
  deviceTypes?: string[];
  shopping11stCategories?: string[];
  webappCategories?: string[];
  callUsageTypes?: string[];
  locationTypes?: string[];
  mobilityPatterns?: string[];
  geofenceIds?: string[];
}

function calculateLocalEstimate(
  gender: string, 
  ageMin: number, 
  ageMax: number, 
  regions: string[],
  advancedOptions?: AdvancedTargetingOptions
) {
  let baseAudience = 16000000;
  
  if (gender === 'male') {
    baseAudience = baseAudience * 0.52;
  } else if (gender === 'female') {
    baseAudience = baseAudience * 0.48;
  }
  
  const ageRange = ageMax - ageMin;
  const ageMultiplier = Math.max(0.1, ageRange / 60);
  baseAudience = baseAudience * ageMultiplier;
  
  const regionPopulationShare: Record<string, number> = {
    '서울': 0.19, '경기': 0.26, '인천': 0.06, '부산': 0.07, '대구': 0.05,
    '광주': 0.03, '대전': 0.03, '울산': 0.02, '세종': 0.01,
    '강원': 0.03, '충북': 0.03, '충남': 0.04, '전북': 0.04, '전남': 0.04,
    '경북': 0.05, '경남': 0.07, '제주': 0.01
  };
  
  if (regions && Array.isArray(regions) && regions.length > 0) {
    let regionMultiplier = 0;
    for (const region of regions) {
      regionMultiplier += regionPopulationShare[region] || 0.03;
    }
    baseAudience = baseAudience * regionMultiplier;
  }
  
  if (advancedOptions) {
    const { 
      districts, carrierTypes, deviceTypes, 
      shopping11stCategories, webappCategories, callUsageTypes,
      locationTypes, mobilityPatterns, geofenceIds 
    } = advancedOptions;
    
    if (districts && districts.length > 0) {
      baseAudience *= 0.3 * Math.min(districts.length / 5, 1);
    }
    if (carrierTypes && carrierTypes.length > 0) {
      baseAudience *= 0.6;
    }
    if (deviceTypes && deviceTypes.length > 0) {
      baseAudience *= 0.5;
    }
    if (shopping11stCategories && shopping11stCategories.length > 0) {
      baseAudience *= 0.15;
    }
    if (webappCategories && webappCategories.length > 0) {
      baseAudience *= 0.2;
    }
    if (callUsageTypes && callUsageTypes.length > 0) {
      baseAudience *= 0.25;
    }
    if (locationTypes && locationTypes.length > 0) {
      baseAudience *= 0.3;
    }
    if (mobilityPatterns && mobilityPatterns.length > 0) {
      baseAudience *= 0.35;
    }
    if (geofenceIds && geofenceIds.length > 0) {
      baseAudience *= 0.05 * Math.min(geofenceIds.length, 5);
    }
  }
  
  const estimatedCount = Math.round(Math.max(100, baseAudience));
  return {
    estimatedCount,
    minCount: Math.max(85, Math.round(estimatedCount * 0.85)),
    maxCount: Math.round(estimatedCount * 1.15),
    reachRate: 85 + Math.floor(Math.random() * 10),
    source: 'local'
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { 
      gender, ageMin: rawAgeMin, ageMax: rawAgeMax, regions, useBizChat,
      districts, carrierTypes, deviceTypes, 
      shopping11stCategories, webappCategories, callUsageTypes,
      locationTypes, mobilityPatterns, geofenceIds
    } = req.body;
    
    const ageMin = typeof rawAgeMin === 'number' ? rawAgeMin : 20;
    const ageMax = typeof rawAgeMax === 'number' ? rawAgeMax : 60;
    
    const advancedOptions: AdvancedTargetingOptions = {
      districts, carrierTypes, deviceTypes,
      shopping11stCategories, webappCategories, callUsageTypes,
      locationTypes, mobilityPatterns, geofenceIds
    };
    
    if (ageMin < 0 || ageMax < 0 || ageMin > 100 || ageMax > 100) {
      return res.status(400).json({ error: '나이는 0~100 사이여야 합니다' });
    }
    
    if (ageMin > ageMax) {
      return res.status(400).json({ error: '최소 나이가 최대 나이보다 클 수 없습니다' });
    }
    
    if (gender && !['all', 'male', 'female'].includes(gender)) {
      return res.status(400).json({ error: '성별은 all, male, female 중 하나여야 합니다' });
    }

    if (useBizChat !== false) {
      try {
        // BizChat ATS 규격에 맞는 페이로드 생성
        const { payload, desc } = buildATSMosuPayload({
          gender,
          ageMin,
          ageMax,
          regions,
        });

        // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
        const detectEnv = (): boolean => {
          const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
          if (forceDevMode) {
            console.log('[Targeting] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
            return false;
          }
          if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
          if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
          if (process.env.VERCEL_ENV === 'production') return true;
          if (process.env.NODE_ENV === 'production') return true;
          return false;
        };
        const useProduction = detectEnv();
        console.log(`[Targeting] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
        
        const atsResult = await callBizChatATSMosu(payload, useProduction);
        
        if (atsResult.code === 'S000001') {
          const count = atsResult.data?.cnt || 0;
          const filterStr = atsResult.data?.filterStr || '';
          const query = atsResult.data?.query || '';
          
          return res.status(200).json({
            estimatedCount: count,
            minCount: Math.round(count * 0.9),
            maxCount: Math.round(count * 1.1),
            reachRate: 90,
            source: 'bizchat',
            // ATS mosu 응답 값들 (캠페인 생성 시 사용)
            sndMosuQuery: JSON.stringify(payload),
            sndMosuDesc: filterStr,
            atsQuery: query,
            filterDescription: desc,
            rawResponse: atsResult,
          });
        }
        
        console.error('[Targeting] BizChat ATS failed with code:', atsResult.code, 'msg:', atsResult.msg);
        
        // 실패 시 로컬 추정치 + 올바른 형식의 sndMosuQuery 반환
        const localResult = calculateLocalEstimate(gender, ageMin, ageMax, regions, advancedOptions);
        return res.status(200).json({
          ...localResult,
          sndMosuQuery: JSON.stringify(payload),
          filterDescription: desc,
          bizChatError: {
            code: atsResult.code,
            message: atsResult.msg || 'BizChat ATS 조회 실패',
          },
          warning: 'BizChat ATS 조회 실패로 로컬 추정치를 사용합니다',
        });
      } catch (error) {
        console.error('[Targeting] BizChat ATS error:', error);
        
        // 에러 시에도 올바른 형식의 sndMosuQuery 반환
        const { payload, desc } = buildATSMosuPayload({
          gender,
          ageMin,
          ageMax,
          regions,
        });
        
        const localResult = calculateLocalEstimate(gender, ageMin, ageMax, regions, advancedOptions);
        return res.status(200).json({
          ...localResult,
          sndMosuQuery: JSON.stringify(payload),
          filterDescription: desc,
          bizChatError: {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'BizChat 서버 연결 실패',
          },
          warning: 'BizChat 서버 연결 실패로 로컬 추정치를 사용합니다',
        });
      }
    }

    // useBizChat=false인 경우 로컬 추정치만 반환
    const { payload, desc } = buildATSMosuPayload({
      gender,
      ageMin,
      ageMax,
      regions,
    });
    
    const localEstimate = calculateLocalEstimate(gender, ageMin, ageMax, regions, advancedOptions);
    return res.status(200).json({
      ...localEstimate,
      sndMosuQuery: JSON.stringify(payload),
      filterDescription: desc,
    });
    
  } catch (error) {
    console.error('Error estimating targeting:', error);
    return res.status(500).json({ error: 'Failed to estimate targeting' });
  }
}

// Helper: ATS 페이로드 빌더 export (다른 모듈에서 사용)
export { buildATSMosuPayload, REGION_HCODE_MAP };
