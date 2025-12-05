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
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  
  console.log(`[BizChat ATS] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat ATS] Request body:`, JSON.stringify(body).substring(0, 500));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat ATS] Response: ${response.status} - ${responseText.substring(0, 300)}`);

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // 환경 감지: Vercel 배포 환경 또는 명시적 prod 요청 시 운영 API 사용
  const detectEnv = (): boolean => {
    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    if (process.env.VERCEL_ENV === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat ATS] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  const action = req.body?.action || 'count';

  try {
    switch (action) {
      case 'meta': {
        const result = await callBizChatAPI('/api/v1/ats/meta/filter', 'POST', {}, useProduction);
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'meta',
          data: result.data,
        });
      }

      case 'count': {
        const { gender, ageMin, ageMax, regions, interests, behaviors } = req.body;
        
        const filterPayload: Record<string, unknown> = {};
        
        if (gender && gender !== 'all') {
          filterPayload.gender = gender === 'male' ? 'M' : 'F';
        }
        
        if (ageMin !== undefined || ageMax !== undefined) {
          filterPayload.age = {
            min: ageMin ?? 20,
            max: ageMax ?? 60,
          };
        }
        
        if (regions && Array.isArray(regions) && regions.length > 0) {
          filterPayload.region = regions;
        }
        
        if (interests && Array.isArray(interests) && interests.length > 0) {
          filterPayload.interest = interests;
        }
        
        if (behaviors && Array.isArray(behaviors) && behaviors.length > 0) {
          filterPayload.behavior = behaviors;
        }

        const result = await callBizChatAPI('/api/v1/ats/filter/count', 'POST', filterPayload, useProduction);
        
        if (result.data.code === 'S000001') {
          return res.status(200).json({
            success: true,
            action: 'count',
            estimatedCount: result.data.data?.count || 0,
            filterApplied: filterPayload,
            rawResponse: result.data,
          });
        } else {
          return res.status(200).json({
            success: false,
            action: 'count',
            error: result.data.msg || 'Failed to get count',
            rawResponse: result.data,
          });
        }
      }

      case 'filter': {
        const { gender, ageMin, ageMax, regions, interests, behaviors, pageNumber, pageSize } = req.body;
        
        const filterPayload: Record<string, unknown> = {
          pageNumber: pageNumber || 1,
          pageSize: pageSize || 100,
        };
        
        if (gender && gender !== 'all') {
          filterPayload.gender = gender === 'male' ? 'M' : 'F';
        }
        
        if (ageMin !== undefined || ageMax !== undefined) {
          filterPayload.age = {
            min: ageMin ?? 20,
            max: ageMax ?? 60,
          };
        }
        
        if (regions && Array.isArray(regions) && regions.length > 0) {
          filterPayload.region = regions;
        }
        
        if (interests && Array.isArray(interests) && interests.length > 0) {
          filterPayload.interest = interests;
        }
        
        if (behaviors && Array.isArray(behaviors) && behaviors.length > 0) {
          filterPayload.behavior = behaviors;
        }

        const result = await callBizChatAPI('/api/v1/ats/filter', 'POST', filterPayload, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'filter',
          data: result.data.data,
          rawResponse: result.data,
        });
      }

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['meta', 'count', 'filter'],
        });
    }
  } catch (error) {
    console.error('[BizChat ATS] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
