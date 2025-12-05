import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, decimal } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

// Campaigns table schema
const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  bizchatCampaignId: text('bizchat_campaign_id'),
  statusCode: integer('status_code').default(5),
  status: text('status').default('draft'),
  sentCount: integer('sent_count').default(0),
  successCount: integer('success_count').default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

// BizChat 상태 코드 매핑
const STATUS_CODE_MAP: Record<number, { status: string; label: string }> = {
  5: { status: 'draft', label: '초안' },
  10: { status: 'approval_requested', label: '검수 중' },
  11: { status: 'approved', label: '발송 대기' },
  17: { status: 'rejected', label: '반려' },
  20: { status: 'send_ready', label: '발송 준비중' },
  25: { status: 'cancelled', label: '취소' },
  30: { status: 'running', label: '발송 중' },
  35: { status: 'stopped', label: '발송 중단' },
  40: { status: 'completed', label: '발송 완료' },
};

// Callback 인증 검증
function verifyCallbackAuth(req: VercelRequest): boolean {
  const authKey = process.env.BIZCHAT_CALLBACK_AUTH_KEY;
  if (!authKey) {
    console.warn('[Callback] BIZCHAT_CALLBACK_AUTH_KEY not configured');
    return true; // 키가 없으면 검증 건너뜀 (개발 편의)
  }

  const providedKey = req.headers['x-auth-key'] || 
                      req.headers['authorization'] || 
                      req.query.authKey;

  if (providedKey === authKey) {
    return true;
  }

  console.warn('[Callback] Auth key mismatch');
  return false;
}

// 캠페인 상태 변경 Callback
// BizChat에서 캠페인 상태가 변경되면 이 엔드포인트로 알림
interface StateCallbackPayload {
  campaignId: string;       // BizChat 캠페인 ID
  statusCode: number;       // 새 상태 코드
  prevStatusCode?: number;  // 이전 상태 코드
  message?: string;         // 상태 변경 메시지
  sentCount?: number;       // 발송 건수
  successCount?: number;    // 성공 건수
  failCount?: number;       // 실패 건수
  timestamp?: string;       // 변경 시간
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 인증 검증
  if (!verifyCallbackAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body as StateCallbackPayload;
    
    console.log('[Callback] Received state change:', JSON.stringify(payload));

    if (!payload.campaignId || payload.statusCode === undefined) {
      return res.status(400).json({ 
        error: 'Invalid payload',
        required: ['campaignId', 'statusCode'],
      });
    }

    const db = getDb();

    // BizChat 캠페인 ID로 내부 캠페인 찾기
    const campaignResult = await db.select()
      .from(campaigns)
      .where(eq(campaigns.bizchatCampaignId, payload.campaignId));

    if (campaignResult.length === 0) {
      console.warn(`[Callback] Campaign not found: ${payload.campaignId}`);
      // BizChat에 200 응답 (재시도 방지)
      return res.status(200).json({ 
        success: false,
        message: 'Campaign not found in local database',
        campaignId: payload.campaignId,
      });
    }

    const campaign = campaignResult[0];
    const statusInfo = STATUS_CODE_MAP[payload.statusCode] || { 
      status: 'unknown', 
      label: `상태코드: ${payload.statusCode}` 
    };

    // 캠페인 상태 업데이트
    const updateData: Record<string, unknown> = {
      statusCode: payload.statusCode,
      status: statusInfo.status,
      updatedAt: new Date(),
    };

    // 발송 통계 업데이트
    if (payload.sentCount !== undefined) {
      updateData.sentCount = payload.sentCount;
    }
    if (payload.successCount !== undefined) {
      updateData.successCount = payload.successCount;
    }

    await db.update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, campaign.id));

    console.log(`[Callback] Updated campaign ${campaign.id}: ${statusInfo.status} (${payload.statusCode})`);

    return res.status(200).json({
      success: true,
      campaignId: campaign.id,
      bizchatCampaignId: payload.campaignId,
      statusCode: payload.statusCode,
      status: statusInfo.status,
      label: statusInfo.label,
    });

  } catch (error) {
    console.error('[Callback] Error:', error);
    // BizChat에 500 응답하면 재시도할 수 있음
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
