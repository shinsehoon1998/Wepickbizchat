import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

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

function generateEncData(mid: string, ediDate: string, goodsAmt: string, merchantKey: string): string {
  const data = mid + ediDate + goodsAmt + merchantKey;
  return createHash('sha256').update(data).digest('hex');
}

function getEdiDate(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstTime = new Date(now.getTime() + kstOffset);
  const year = kstTime.getUTCFullYear().toString();
  const month = (kstTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = kstTime.getUTCDate().toString().padStart(2, '0');
  const hours = kstTime.getUTCHours().toString().padStart(2, '0');
  const minutes = kstTime.getUTCMinutes().toString().padStart(2, '0');
  const seconds = kstTime.getUTCSeconds().toString().padStart(2, '0');
  return year + month + day + hours + minutes + seconds;
}

function generateOrderNo(userId: string): string {
  const timestamp = Date.now().toString().slice(-10);
  const shortUserId = userId.replace(/-/g, '').slice(0, 8);
  return `BC${timestamp}_${shortUserId}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { amount } = req.body;

    if (!amount || amount < 10000) {
      return res.status(400).json({ error: '최소 충전 금액은 10,000원입니다' });
    }

    const mid = process.env.KISPG_MID;
    const merchantKey = process.env.KISPG_MERCHANT_KEY;

    if (!mid || !merchantKey) {
      return res.status(500).json({ error: 'KISPG configuration is missing' });
    }

    const ediDate = getEdiDate();
    const ordNo = generateOrderNo(auth.userId);
    const goodsAmt = amount.toString();
    const encData = generateEncData(mid, ediDate, goodsAmt, merchantKey);

    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.REPLIT_DOMAINS?.split(',')[0]
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';

    const returnUrl = `${baseUrl}/api/kispg/callback`;

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const kispgAuthUrl = isProduction 
      ? 'https://api.kispg.co.kr/v2/auth'
      : 'https://testapi.kispg.co.kr/v2/auth';

    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

    const authParams = {
      payMethod: 'CARD',
      model: isMobile ? 'MOB' : 'WEB',
      trxCd: '0',
      mid,
      goodsNm: 'BizChat 잔액 충전',
      currencyType: 'KRW',
      ordNo,
      goodsAmt,
      ordNm: auth.email?.split('@')[0] || '고객',
      ordTel: '01000000000',
      userIp: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || '127.0.0.1',
      ediDate,
      encData,
      returnUrl,
      payReqType: '1',
    };

    return res.status(200).json({
      success: true,
      kispgAuthUrl,
      params: authParams,
    });
  } catch (error) {
    console.error('KISPG auth error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
}
