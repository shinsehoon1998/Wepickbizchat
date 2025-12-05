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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const useProduction = req.query.env === 'prod' || req.body?.env === 'prod';
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'BizChat API key not configured' });
  }

  try {
    const { fileData, fileName, fileType } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: 'fileData is required (base64 encoded)' });
    }

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const tid = generateTid();
    const url = `${baseUrl}/api/v1/file/upload?tid=${tid}`;
    
    console.log(`[BizChat File] Uploading file: ${fileName}`);

    const formData = new FormData();
    
    const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');
    const blob = new Blob([binaryData], { type: fileType || 'image/jpeg' });
    
    formData.append('file', blob, fileName);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
      },
      body: formData,
    });

    const responseText = await response.text();
    console.log(`[BizChat File] Response: ${response.status} - ${responseText.substring(0, 300)}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { code: response.status.toString(), msg: responseText };
    }

    if (data.code === 'S000001') {
      return res.status(200).json({
        success: true,
        fileId: data.data?.origId || data.data?.id,
        fileName,
        rawResponse: data,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: data.msg || 'File upload failed',
        rawResponse: data,
      });
    }

  } catch (error) {
    console.error('[BizChat File] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
