import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  bizchatCampaignId: text('bizchat_campaign_id'),
  statusCode: integer('status_code').default(5),
  status: text('status').default('draft'),
  stateReason: text('state_reason'),
  sentCount: integer('sent_count').default(0),
  successCount: integer('success_count').default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

// BizChat 상태 코드 매핑 (문서 v0.29.0 규격)
const STATUS_CODE_MAP: Record<number, { status: string; label: string }> = {
  0: { status: 'temp_registered', label: '임시 등록' },
  1: { status: 'inspection_requested', label: '검수 요청' },
  2: { status: 'inspection_completed', label: '검수 완료' },
  10: { status: 'approval_requested', label: '승인 요청' },
  11: { status: 'approved', label: '승인 완료' },
  17: { status: 'rejected', label: '반려' },
  20: { status: 'send_ready', label: '발송 준비' },
  25: { status: 'cancelled', label: '취소' },
  30: { status: 'running', label: '진행중' },
  35: { status: 'stopped', label: '중단' },
  40: { status: 'completed', label: '종료' },
};

// Callback 인증 검증
function verifyCallbackAuth(req: VercelRequest): boolean {
  const authKey = process.env.BIZCHAT_CALLBACK_AUTH_KEY;
  if (!authKey) {
    console.warn('[Callback] BIZCHAT_CALLBACK_AUTH_KEY not configured - skipping auth');
    return true;
  }

  // BizChat에서 전송하는 인증 헤더 확인
  const providedKey = req.headers['bizchat-callback-auth-key'] || 
                      req.headers['x-auth-key'] || 
                      req.headers['authorization'];

  if (providedKey === authKey) {
    return true;
  }

  console.warn('[Callback] Auth key mismatch');
  return false;
}

// BizChat 캠페인 상태 변경 Callback 페이로드 (문서 규격)
interface BizChatStateCallback {
  id: string;              // BizChat 캠페인 ID
  state: number;           // 상태 코드
  stateUpdateDate: number; // 상태 변경 일시 (unix timestamp)
  stateReason: string;     // 상태 사유 (반려 시 사유 포함)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, bizchat-callback-auth-key, X-Auth-Key');

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
    const payload = req.body as BizChatStateCallback;
    
    console.log('[Callback] Received state change:', JSON.stringify(payload));

    // 필수 필드 검증 (문서 규격)
    if (!payload.id || payload.state === undefined) {
      return res.status(400).json({ 
        error: 'Invalid payload',
        required: ['id', 'state'],
        received: payload,
      });
    }

    const db = getDb();

    // BizChat 캠페인 ID로 내부 캠페인 찾기
    const campaignResult = await db.select()
      .from(campaigns)
      .where(eq(campaigns.bizchatCampaignId, payload.id));

    if (campaignResult.length === 0) {
      console.warn(`[Callback] Campaign not found for bizchat ID: ${payload.id}`);
      // BizChat에 200 응답 반환 (재시도 방지)
      return res.status(200).json({ 
        success: false,
        message: 'Campaign not found in local database',
        bizchatCampaignId: payload.id,
      });
    }

    const campaign = campaignResult[0];
    const statusInfo = STATUS_CODE_MAP[payload.state] || { 
      status: 'unknown', 
      label: `상태코드: ${payload.state}` 
    };

    // 캠페인 상태 업데이트
    const updateData: Record<string, unknown> = {
      statusCode: payload.state,
      status: statusInfo.status,
      updatedAt: new Date(),
    };

    // 반려 사유 저장
    if (payload.stateReason) {
      updateData.stateReason = payload.stateReason;
    }

    await db.update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, campaign.id));

    console.log(`[Callback] Updated campaign ${campaign.id}: ${statusInfo.status} (state=${payload.state})`);

    // BizChat에 HTTP 200 응답 필수
    return res.status(200).json({
      success: true,
      campaignId: campaign.id,
      bizchatCampaignId: payload.id,
      state: payload.state,
      status: statusInfo.status,
      label: statusInfo.label,
    });

  } catch (error) {
    console.error('[Callback] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
