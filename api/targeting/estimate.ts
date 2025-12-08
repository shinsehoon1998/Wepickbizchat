import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

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

async function callBizChatATS(
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
  const url = `${baseUrl}/api/v1/ats/filter/count?tid=${tid}`;
  
  console.log(`[BizChat ATS] POST ${url}`);
  console.log(`[BizChat ATS] Payload:`, JSON.stringify(filterPayload));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify(filterPayload),
  });

  const responseText = await response.text();
  console.log(`[BizChat ATS] Response: ${response.status} - ${responseText.substring(0, 300)}`);

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
        const filterPayload: Record<string, unknown> = {};
        
        if (gender && gender !== 'all') {
          filterPayload.gender = gender === 'male' ? 'M' : 'F';
        }
        
        filterPayload.age = {
          min: ageMin,
          max: ageMax,
        };
        
        if (regions && Array.isArray(regions) && regions.length > 0) {
          filterPayload.region = regions;
        }
        
        if (districts && Array.isArray(districts) && districts.length > 0) {
          filterPayload.district = districts;
        }
        
        if (carrierTypes && Array.isArray(carrierTypes) && carrierTypes.length > 0) {
          filterPayload.carrier = carrierTypes;
        }
        
        if (deviceTypes && Array.isArray(deviceTypes) && deviceTypes.length > 0) {
          filterPayload.device = deviceTypes;
        }
        
        const interests: string[] = [];
        if (shopping11stCategories && Array.isArray(shopping11stCategories)) {
          interests.push(...shopping11stCategories);
        }
        if (webappCategories && Array.isArray(webappCategories)) {
          interests.push(...webappCategories);
        }
        if (interests.length > 0) {
          filterPayload.interest = interests;
        }
        
        const behaviors: string[] = [];
        if (callUsageTypes && Array.isArray(callUsageTypes)) {
          behaviors.push(...callUsageTypes);
        }
        if (locationTypes && Array.isArray(locationTypes)) {
          behaviors.push(...locationTypes);
        }
        if (mobilityPatterns && Array.isArray(mobilityPatterns)) {
          behaviors.push(...mobilityPatterns);
        }
        if (behaviors.length > 0) {
          filterPayload.behavior = behaviors;
        }
        
        if (geofenceIds && Array.isArray(geofenceIds) && geofenceIds.length > 0) {
          filterPayload.geofence = geofenceIds;
        }

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
        const atsResult = await callBizChatATS(filterPayload, useProduction);
        
        if (atsResult.code === 'S000001') {
          const count = atsResult.data?.count || 0;
          return res.status(200).json({
            estimatedCount: count,
            minCount: Math.round(count * 0.9),
            maxCount: Math.round(count * 1.1),
            reachRate: 90,
            source: 'bizchat',
            rawResponse: atsResult,
          });
        }
        
        console.error('[Targeting] BizChat ATS failed with code:', atsResult.code, 'msg:', atsResult.msg);
        
        return res.status(200).json({
          ...calculateLocalEstimate(gender, ageMin, ageMax, regions, advancedOptions),
          bizChatError: {
            code: atsResult.code,
            message: atsResult.msg || 'BizChat ATS 조회 실패',
          },
          warning: 'BizChat ATS 조회 실패로 로컬 추정치를 사용합니다',
        });
      } catch (error) {
        console.error('[Targeting] BizChat ATS error:', error);
        
        return res.status(200).json({
          ...calculateLocalEstimate(gender, ageMin, ageMax, regions, advancedOptions),
          bizChatError: {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'BizChat 서버 연결 실패',
          },
          warning: 'BizChat 서버 연결 실패로 로컬 추정치를 사용합니다',
        });
      }
    }

    const localEstimate = calculateLocalEstimate(gender, ageMin, ageMax, regions, advancedOptions);
    return res.status(200).json(localEstimate);
    
  } catch (error) {
    console.error('Error estimating targeting:', error);
    return res.status(500).json({ error: 'Failed to estimate targeting' });
  }
}
