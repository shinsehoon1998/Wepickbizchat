import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  templateId: text('template_id'),
  messageType: text('message_type'),
  sndNum: text('snd_num'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  targetCount: integer('target_count'),
  sentCount: integer('sent_count'),
  successCount: integer('success_count'),
  clickCount: integer('click_count'),
  budget: numeric('budget'),
  costPerMessage: numeric('cost_per_message'),
  scheduledAt: timestamp('scheduled_at'),
  completedAt: timestamp('completed_at'),
  rejectionReason: text('rejection_reason'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  tgtCompanyName: text('tgt_company_name'),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  sndMosuQuery: text('snd_mosu_query'),
  sndMosuDesc: text('snd_mosu_desc'),
  settleCnt: integer('settle_cnt').default(0),
  mdnFileId: text('mdn_file_id'),
  atsSndStartDate: timestamp('ats_snd_start_date'),
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

const targeting = pgTable('targeting', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  gender: text('gender'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  regions: text('regions').array(),
  districts: text('districts').array(),
  carrierTypes: text('carrier_types').array(),
  deviceTypes: text('device_types').array(),
  shopping11stCategories: text('shopping_11st_categories').array(),
  webappCategories: text('webapp_categories').array(),
  callUsageTypes: text('call_usage_types').array(),
  locationTypes: text('location_types').array(),
  mobilityPatterns: text('mobility_patterns').array(),
  geofenceIds: text('geofence_ids').array(),
  atsQuery: text('ats_query'),
  estimatedCount: integer('estimated_count'),
  createdAt: timestamp('created_at').defaultNow(),
});

const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  successCount: integer('success_count').default(0),
  failedCount: integer('failed_count').default(0),
  clickCount: integer('click_count').default(0),
  optOutCount: integer('opt_out_count').default(0),
  conversionRate: numeric('conversion_rate'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid campaign ID' });

  const db = getDb();
  const userId = auth.userId;

  if (req.method === 'GET') {
    try {
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      const messageResult = await db.select().from(messages).where(eq(messages.campaignId, id));
      const targetingResult = await db.select().from(targeting).where(eq(targeting.campaignId, id));
      const reportResult = await db.select().from(reports).where(eq(reports.campaignId, id));

      return res.status(200).json({
        ...campaign,
        message: messageResult[0],
        targeting: targetingResult[0],
        report: reportResult[0],
      });
    } catch (error) {
      console.error('Error fetching campaign:', error);
      return res.status(500).json({ error: 'Failed to fetch campaign' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      // 메시지 정보 가져오기
      const messageResult = await db.select().from(messages).where(eq(messages.campaignId, id));
      const message = messageResult[0];

      const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date() };
      
      // Date 필드 변환
      const dateFields = ['scheduledAt', 'atsSndStartDate', 'completedAt'];
      for (const field of dateFields) {
        if (updateData[field] && typeof updateData[field] === 'string') {
          updateData[field] = new Date(updateData[field] as string);
        } else if (updateData[field] === '' || updateData[field] === null) {
          updateData[field] = null;
        }
      }
      
      // 숫자 필드 변환 (문자열로 전달된 경우)
      const intFields = ['sndMosu', 'sndGoalCnt', 'targetCount', 'rcvType', 'billingType', 'rcsType', 'settleCnt', 'statusCode'];
      for (const field of intFields) {
        if (updateData[field] !== undefined && updateData[field] !== null) {
          const value = updateData[field];
          if (typeof value === 'string') {
            updateData[field] = parseInt(value, 10);
          }
        }
      }

      console.log('[Campaign PATCH] Updating campaign:', id, 'Fields:', Object.keys(updateData).filter(k => k !== 'updatedAt'));
      if (updateData.sndMosu !== undefined) {
        console.log('[Campaign PATCH] sndMosu value:', updateData.sndMosu);
      }

      // 로컬 DB 업데이트
      const updatedResult = await db.update(campaigns).set(updateData).where(eq(campaigns.id, id)).returning();
      const updatedCampaign = updatedResult[0];

      // BizChat에 등록된 캠페인이면 BizChat도 업데이트
      // SIM_ 접두사는 시뮬레이션 ID이므로 BizChat 호출 생략
      const bizchatId = campaign.bizchatCampaignId;
      const isSimulation = bizchatId?.startsWith('SIM_');
      
      // 수정 가능 상태: 임시등록(0), 검수완료(2), 반려(17)
      const editableStates = [0, 2, 17];
      const canUpdateBizChat = bizchatId && !isSimulation && editableStates.includes(campaign.statusCode || 0);

      if (canUpdateBizChat) {
        try {
          const host = req.headers.host || process.env.VERCEL_URL || 'localhost:5000';
          const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
          const protocol = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
          const baseUrl = `${protocol}://${host}`;
          
          // 메시지 업데이트가 있으면 messages 테이블도 업데이트
          const messageUpdate = req.body.message;
          let currentMessage = message;
          if (messageUpdate) {
            const messageUpdateData: Record<string, unknown> = {};
            if (messageUpdate.title !== undefined) messageUpdateData.title = messageUpdate.title;
            if (messageUpdate.content !== undefined) messageUpdateData.content = messageUpdate.content;
            if (messageUpdate.imageUrl !== undefined) messageUpdateData.imageUrl = messageUpdate.imageUrl;
            
            if (Object.keys(messageUpdateData).length > 0 && message) {
              await db.update(messages).set(messageUpdateData).where(eq(messages.campaignId, id));
              currentMessage = { ...message, ...messageUpdateData };
            }
          }

          // BizChat에서 기존 캠페인 정보 조회하여 누락 필드 보완 (필수)
          let existingBizchatData: Record<string, unknown> | null = null;
          try {
            const readResponse = await fetch(`${baseUrl}/api/bizchat/campaigns`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
              },
              body: JSON.stringify({
                campaignId: id,
                action: 'read',
              }),
            });
            const readResult = await readResponse.json();
            if (readResult.success && readResult.campaign) {
              existingBizchatData = readResult.campaign;
              console.log('[Campaign PATCH] Retrieved existing BizChat data for campaign:', bizchatId);
            } else {
              console.error('[Campaign PATCH] Failed to read BizChat campaign:', readResult);
              return res.status(400).json({
                error: 'BizChat에서 기존 캠페인 정보를 조회할 수 없습니다.',
                bizchatError: readResult.error || readResult.bizchatError,
                ...updatedCampaign,
              });
            }
          } catch (readError) {
            console.error('[Campaign PATCH] Error reading BizChat campaign:', readError);
            return res.status(500).json({
              error: 'BizChat 캠페인 조회 중 오류가 발생했습니다.',
              ...updatedCampaign,
            });
          }

          // BizChat update payload 구성 (연동규격서 7.3 캠페인 수정)
          const rcvType = updatedCampaign.rcvType ?? campaign.rcvType ?? 0;
          const billingType = updatedCampaign.billingType ?? campaign.billingType ?? 0;
          const sndGoalCnt = updatedCampaign.sndGoalCnt || campaign.sndGoalCnt || 1;
          
          // Unix timestamp (초 단위) 계산
          const atsSndStartDate = updatedCampaign.atsSndStartDate || campaign.atsSndStartDate;
          const atsSndStartTimestamp = atsSndStartDate 
            ? Math.floor(new Date(atsSndStartDate).getTime() / 1000) 
            : undefined;
          
          // MMS 객체 구성 - 기존 BizChat 데이터에서 urlLink, urlFile, fileInfo 보존
          const existingMms = existingBizchatData?.mms as Record<string, unknown> | undefined;
          const mmsPayload: Record<string, unknown> = {
            title: currentMessage?.title || updatedCampaign.name || campaign.name || '',
            msg: currentMessage?.content || '',
            fileInfo: existingMms?.fileInfo || {},
            urlFile: existingMms?.urlFile ?? '',
            urlLink: existingMms?.urlLink || { list: [] },
          };
          
          // 이미지가 변경된 경우에만 fileInfo 덮어쓰기
          // imageUrl이 존재하고 비어있지 않으면 새 이미지로 사용
          if (currentMessage?.imageUrl && currentMessage.imageUrl.trim()) {
            mmsPayload.fileInfo = {
              list: [{ origId: currentMessage.imageUrl }],
            };
          }

          // BizChat update API payload
          const bizchatUpdatePayload: Record<string, unknown> = {
            tgtCompanyName: updatedCampaign.tgtCompanyName || campaign.tgtCompanyName || existingBizchatData?.tgtCompanyName || 'wepick',
            name: updatedCampaign.name || campaign.name || existingBizchatData?.name,
            sndNum: updatedCampaign.sndNum || campaign.sndNum || existingBizchatData?.sndNum || '001001',
            rcvType: rcvType,
            sndGoalCnt: sndGoalCnt,
            billingType: billingType,
            isTmp: 0,
            settleCnt: updatedCampaign.settleCnt ?? campaign.settleCnt ?? existingBizchatData?.settleCnt ?? 0,
            mms: mmsPayload,
            rcs: existingBizchatData?.rcs || [],
            cb: existingBizchatData?.cb || {},
          };

          // rcvType에 따른 조건부 필드 추가
          if (rcvType === 0) {
            // ATS 일반 타겟팅
            if (atsSndStartTimestamp) {
              bizchatUpdatePayload.atsSndStartDate = atsSndStartTimestamp;
            } else if (existingBizchatData?.atsSndStartDate) {
              bizchatUpdatePayload.atsSndStartDate = existingBizchatData.atsSndStartDate;
            }
            
            // sndMosu 검증: 최소값은 sndGoalCnt의 150%, 최대값은 400,000
            const sndMosu = updatedCampaign.sndMosu || campaign.sndMosu || (existingBizchatData?.sndMosu as number) || 0;
            const minSndMosu = Math.ceil(sndGoalCnt * 1.5);
            const maxSndMosu = 400000;
            
            if (sndMosu < minSndMosu) {
              return res.status(400).json({
                error: `발송 모수가 최소값(${minSndMosu.toLocaleString()})보다 작습니다. 발송 목표(${sndGoalCnt.toLocaleString()})의 150% 이상이어야 합니다.`,
                currentSndMosu: sndMosu,
                minSndMosu,
                sndGoalCnt,
                ...updatedCampaign,
              });
            }
            if (sndMosu > maxSndMosu) {
              return res.status(400).json({
                error: `발송 모수가 최대값(${maxSndMosu.toLocaleString()})을 초과합니다.`,
                currentSndMosu: sndMosu,
                maxSndMosu,
                ...updatedCampaign,
              });
            }
            
            bizchatUpdatePayload.sndMosu = sndMosu;
            bizchatUpdatePayload.sndMosuQuery = updatedCampaign.sndMosuQuery || campaign.sndMosuQuery || (existingBizchatData?.sndMosuQuery as string) || '';
            bizchatUpdatePayload.sndMosuDesc = updatedCampaign.sndMosuDesc || campaign.sndMosuDesc || (existingBizchatData?.sndMosuDesc as string) || '';
            
            // sndMosuQuery가 비어있으면 에러
            if (!bizchatUpdatePayload.sndMosuQuery) {
              return res.status(400).json({
                error: 'ATS 타겟팅 캠페인은 sndMosuQuery가 필요합니다.',
                ...updatedCampaign,
              });
            }
          } else if (rcvType === 10) {
            // MDN 직접 지정
            if (atsSndStartTimestamp) {
              bizchatUpdatePayload.atsSndStartDate = atsSndStartTimestamp;
            } else if (existingBizchatData?.atsSndStartDate) {
              bizchatUpdatePayload.atsSndStartDate = existingBizchatData.atsSndStartDate;
            }
            const mdnFileId = updatedCampaign.mdnFileId || campaign.mdnFileId || (existingBizchatData?.mdnFileId as string);
            if (!mdnFileId) {
              return res.status(400).json({
                error: 'MDN 직접 지정 캠페인은 mdnFileId가 필요합니다.',
                ...updatedCampaign,
              });
            }
            bizchatUpdatePayload.mdnFileId = mdnFileId;
          } else if (rcvType === 1 || rcvType === 2) {
            // Maptics 타겟팅 - 기존 BizChat 데이터에서 필드 보존 및 검증
            const collStartDate = existingBizchatData?.collStartDate;
            const collEndDate = existingBizchatData?.collEndDate;
            const sndGeofenceId = existingBizchatData?.sndGeofenceId;
            
            if (!collStartDate || !collEndDate || !sndGeofenceId) {
              return res.status(400).json({
                error: 'Maptics 타겟팅 캠페인에 필수 필드(collStartDate, collEndDate, sndGeofenceId)가 없습니다.',
                ...updatedCampaign,
              });
            }
            
            bizchatUpdatePayload.collStartDate = collStartDate;
            bizchatUpdatePayload.collEndDate = collEndDate;
            bizchatUpdatePayload.sndGeofenceId = sndGeofenceId;
            
            if (rcvType === 1) {
              // 실시간 보내기
              const rtStartHhmm = existingBizchatData?.rtStartHhmm;
              const rtEndHhmm = existingBizchatData?.rtEndHhmm;
              if (!rtStartHhmm || !rtEndHhmm) {
                return res.status(400).json({
                  error: 'Maptics 실시간 캠페인에 발송 시간(rtStartHhmm, rtEndHhmm)이 필요합니다.',
                  ...updatedCampaign,
                });
              }
              bizchatUpdatePayload.rtStartHhmm = rtStartHhmm;
              bizchatUpdatePayload.rtEndHhmm = rtEndHhmm;
              if (existingBizchatData?.sndDayDiv !== undefined) {
                bizchatUpdatePayload.sndDayDiv = existingBizchatData.sndDayDiv;
              }
            } else if (rcvType === 2) {
              // 모아서 보내기
              const collSndDate = existingBizchatData?.collSndDate;
              if (!collSndDate) {
                return res.status(400).json({
                  error: 'Maptics 모아서 보내기 캠페인에 발송 시작 일시(collSndDate)가 필요합니다.',
                  ...updatedCampaign,
                });
              }
              bizchatUpdatePayload.collSndDate = collSndDate;
            }
          }

          // RCS 타입 설정 (billingType이 1 또는 3인 경우)
          if (billingType === 1 || billingType === 3) {
            bizchatUpdatePayload.rcsType = updatedCampaign.rcsType ?? campaign.rcsType ?? (existingBizchatData?.rcsType as number) ?? 0;
          }

          console.log('[Campaign PATCH] Calling BizChat update API for:', bizchatId);
          console.log('[Campaign PATCH] BizChat payload:', JSON.stringify(bizchatUpdatePayload, null, 2));

          const updateResponse = await fetch(`${baseUrl}/api/bizchat/campaigns`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
            },
            body: JSON.stringify({
              campaignId: id,
              action: 'update',
              updateData: bizchatUpdatePayload,
            }),
          });

          const updateResult = await updateResponse.json();
          
          if (!updateResponse.ok || !updateResult.success) {
            console.error('[Campaign PATCH] BizChat update failed:', updateResult);
            // BizChat 업데이트 실패 시 에러 반환 (로컬은 이미 업데이트됨)
            return res.status(400).json({
              ...updatedCampaign,
              bizchatUpdateFailed: true,
              bizchatError: updateResult.bizchatError || updateResult.error,
              bizchatCode: updateResult.bizchatCode,
              bizchatMessage: updateResult.bizchatMessage,
            });
          }

          console.log('[Campaign PATCH] BizChat update successful:', updateResult);
          return res.status(200).json({
            ...updatedCampaign,
            bizchatUpdated: true,
          });

        } catch (bizchatError) {
          console.error('[Campaign PATCH] Error calling BizChat update API:', bizchatError);
          // BizChat 통신 오류 시에도 로컬 업데이트 결과 반환
          return res.status(200).json({
            ...updatedCampaign,
            bizchatUpdateFailed: true,
            bizchatCommunicationError: bizchatError instanceof Error ? bizchatError.message : 'Unknown error',
          });
        }
      } else if (bizchatId && !isSimulation && !editableStates.includes(campaign.statusCode || 0)) {
        console.log(`[Campaign PATCH] Skipping BizChat update - status ${campaign.statusCode} not editable`);
      } else if (isSimulation) {
        console.log(`[Campaign PATCH] Skipping BizChat update for simulation campaign: ${bizchatId}`);
      }

      return res.status(200).json(updatedCampaign);
    } catch (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({ error: 'Failed to update campaign' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.userId !== userId) return res.status(403).json({ error: 'Access denied' });
      
      // BizChat API 규격: isTmp=1 또는 state=0 (임시등록) 캠페인만 삭제 가능
      const DELETABLE_STATUS_CODES = [0];
      if (!DELETABLE_STATUS_CODES.includes(campaign.statusCode || 0)) {
        console.error(`Cannot delete campaign with status ${campaign.statusCode}`);
        return res.status(400).json({ 
          error: '임시등록(0) 상태의 캠페인만 삭제할 수 있습니다.' 
        });
      }

      // BizChat에 등록된 캠페인인 경우 BizChat API 호출
      // SIM_ 접두사는 시뮬레이션 ID이므로 BizChat 호출 생략
      const bizchatId = campaign.bizchatCampaignId;
      const isSimulation = bizchatId?.startsWith('SIM_');
      
      if (bizchatId && !isSimulation) {
        try {
          const host = req.headers.host || process.env.VERCEL_URL || 'localhost:5000';
          const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
          const protocol = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
          const baseUrl = `${protocol}://${host}`;
          
          const deleteResponse = await fetch(`${baseUrl}/api/bizchat/campaigns`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
            },
            body: JSON.stringify({
              action: 'delete',
              campaignIds: [bizchatId],
            }),
          });

          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json();
            console.error('BizChat deletion failed:', errorData);
            // BizChat 삭제 실패해도 로컬 삭제는 진행 (경고 로그만 남김)
            console.warn(`[DELETE] BizChat deletion failed for ${bizchatId}, proceeding with local deletion`);
          }
        } catch (bizchatError) {
          console.error('Error calling BizChat delete API:', bizchatError);
          // BizChat 통신 오류 시에도 로컬 삭제는 진행
          console.warn(`[DELETE] BizChat API communication failed, proceeding with local deletion`);
        }
      } else if (isSimulation) {
        console.log(`[DELETE] Skipping BizChat API call for simulation campaign: ${bizchatId}`);
      }

      await db.delete(messages).where(eq(messages.campaignId, id));
      await db.delete(targeting).where(eq(targeting.campaignId, id));
      await db.delete(reports).where(eq(reports.campaignId, id));
      await db.delete(campaigns).where(eq(campaigns.id, id));

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({ error: 'Failed to delete campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
