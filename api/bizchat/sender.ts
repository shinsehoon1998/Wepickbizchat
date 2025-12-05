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
  
  console.log(`[BizChat Sender] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat Sender] Request body:`, JSON.stringify(body).substring(0, 500));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat Sender] Response: ${response.status} - ${responseText.substring(0, 300)}`);

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

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const useProduction = req.query.env === 'prod' || req.body?.env === 'prod';
  const action = req.body?.action || req.query.action || 'list';

  try {
    switch (action) {
      case 'list': {
        const result = await callBizChatAPI('/api/v1/sndnum/list', 'POST', {}, useProduction);
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'list',
          senderNumbers: result.data.data?.list || [],
          rawResponse: result.data,
        });
      }

      case 'create': {
        const { number, name, comment, certFiles } = req.body;
        
        if (!number) {
          return res.status(400).json({ error: 'number is required' });
        }

        const payload: Record<string, unknown> = {
          num: number.replace(/[^0-9]/g, ''),
          name: name || '',
          comment: comment || '',
        };

        if (certFiles && Array.isArray(certFiles) && certFiles.length > 0) {
          payload.certFiles = certFiles;
        }

        const result = await callBizChatAPI('/api/v1/sndnum/create', 'POST', payload, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'create',
          senderNumberId: result.data.data?.id,
          rawResponse: result.data,
        });
      }

      case 'read': {
        const { senderId } = req.body;
        
        if (!senderId) {
          return res.status(400).json({ error: 'senderId is required' });
        }

        const result = await callBizChatAPI(`/api/v1/sndnum?id=${senderId}`, 'GET', undefined, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'read',
          senderNumber: result.data.data,
          rawResponse: result.data,
        });
      }

      case 'update': {
        const { senderId, name, comment, certFiles } = req.body;
        
        if (!senderId) {
          return res.status(400).json({ error: 'senderId is required' });
        }

        const payload: Record<string, unknown> = {};
        if (name !== undefined) payload.name = name;
        if (comment !== undefined) payload.comment = comment;
        if (certFiles) payload.certFiles = certFiles;

        const result = await callBizChatAPI(`/api/v1/sndnum/update?id=${senderId}`, 'POST', payload, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'update',
          rawResponse: result.data,
        });
      }

      case 'delete': {
        const { senderId } = req.body;
        
        if (!senderId) {
          return res.status(400).json({ error: 'senderId is required' });
        }

        const result = await callBizChatAPI(`/api/v1/sndnum/delete?id=${senderId}`, 'POST', {}, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'delete',
          rawResponse: result.data,
        });
      }

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['list', 'create', 'read', 'update', 'delete'],
        });
    }
  } catch (error) {
    console.error('[BizChat Sender] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
