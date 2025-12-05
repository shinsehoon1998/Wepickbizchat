import type { VercelRequest, VercelResponse } from '@vercel/node';

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

interface BizChatResponse {
  code: string;
  message: string;
  data?: unknown;
}

// BizChat API 클라이언트
async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown,
  useProduction: boolean = false
): Promise<BizChatResponse> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error(`BizChat API key not configured for ${useProduction ? 'production' : 'development'}`);
  }

  const url = `${baseUrl}${endpoint}`;
  console.log(`[BizChat] Calling ${method} ${url}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': apiKey,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat] Response status: ${response.status}`);
  console.log(`[BizChat] Response body: ${responseText.substring(0, 500)}`);

  let data: BizChatResponse;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = {
      code: response.status.toString(),
      message: responseText || response.statusText,
    };
  }

  return data;
}

// 발신번호 목록 조회 API (연결 테스트용)
async function getSenderNumbers(useProduction: boolean = false): Promise<BizChatResponse> {
  return callBizChatAPI('/bizchat/sndnum', 'GET', undefined, useProduction);
}

// 캠페인 목록 조회 API (연결 테스트용)
async function getCampaigns(useProduction: boolean = false): Promise<BizChatResponse> {
  return callBizChatAPI('/bizchat/campaign', 'GET', undefined, useProduction);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const useProduction = req.query.env === 'prod' || req.body?.env === 'prod';
    const testType = req.query.type || req.body?.type || 'sndnum';

    console.log(`[BizChat Test] Environment: ${useProduction ? 'Production' : 'Development'}`);
    console.log(`[BizChat Test] Test type: ${testType}`);

    let result: BizChatResponse;

    switch (testType) {
      case 'sndnum':
        result = await getSenderNumbers(useProduction);
        break;
      case 'campaign':
        result = await getCampaigns(useProduction);
        break;
      default:
        result = await getSenderNumbers(useProduction);
    }

    return res.status(200).json({
      success: true,
      environment: useProduction ? 'production' : 'development',
      testType,
      baseUrl: useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL,
      result,
    });
  } catch (error) {
    console.error('[BizChat Test] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: req.query.env === 'prod' ? 'production' : 'development',
    });
  }
}
