import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

function getSimulatedAtsMeta(metaType: string) {
  switch (metaType) {
    case "11st":
      return [
        { categoryCode: "11ST_001", categoryName: "패션/의류", level: 1, parentCode: null },
        { categoryCode: "11ST_002", categoryName: "뷰티/화장품", level: 1, parentCode: null },
        { categoryCode: "11ST_003", categoryName: "디지털/가전", level: 1, parentCode: null },
        { categoryCode: "11ST_004", categoryName: "식품/건강", level: 1, parentCode: null },
        { categoryCode: "11ST_005", categoryName: "생활/주방", level: 1, parentCode: null },
        { categoryCode: "11ST_006", categoryName: "스포츠/레저", level: 1, parentCode: null },
        { categoryCode: "11ST_007", categoryName: "유아/출산", level: 1, parentCode: null },
        { categoryCode: "11ST_008", categoryName: "도서/문구", level: 1, parentCode: null },
      ];
    case "webapp":
      return [
        { categoryCode: "APP_001", categoryName: "금융/은행", level: 1, parentCode: null },
        { categoryCode: "APP_002", categoryName: "쇼핑", level: 1, parentCode: null },
        { categoryCode: "APP_003", categoryName: "게임", level: 1, parentCode: null },
        { categoryCode: "APP_004", categoryName: "음악/동영상", level: 1, parentCode: null },
        { categoryCode: "APP_005", categoryName: "소셜/커뮤니티", level: 1, parentCode: null },
        { categoryCode: "APP_006", categoryName: "여행/교통", level: 1, parentCode: null },
        { categoryCode: "APP_007", categoryName: "배달/음식", level: 1, parentCode: null },
        { categoryCode: "APP_008", categoryName: "건강/운동", level: 1, parentCode: null },
      ];
    case "call":
      return [
        { categoryCode: "CALL_001", categoryName: "고빈도 통화자 (월 100회+)", level: 1, parentCode: null },
        { categoryCode: "CALL_002", categoryName: "중빈도 통화자 (월 30-100회)", level: 1, parentCode: null },
        { categoryCode: "CALL_003", categoryName: "저빈도 통화자 (월 30회 미만)", level: 1, parentCode: null },
        { categoryCode: "CALL_004", categoryName: "장시간 통화자 (평균 5분+)", level: 1, parentCode: null },
        { categoryCode: "CALL_005", categoryName: "단시간 통화자 (평균 2분 미만)", level: 1, parentCode: null },
        { categoryCode: "CALL_006", categoryName: "비즈니스 통화 패턴", level: 1, parentCode: null },
      ];
    case "loc":
      return [
        { categoryCode: "LOC_001", categoryName: "출퇴근 패턴 (9-6)", level: 1, parentCode: null },
        { categoryCode: "LOC_002", categoryName: "야간 활동 (18-24시)", level: 1, parentCode: null },
        { categoryCode: "LOC_003", categoryName: "주말 활동 중심", level: 1, parentCode: null },
        { categoryCode: "LOC_004", categoryName: "상업지구 빈번 방문", level: 1, parentCode: null },
        { categoryCode: "LOC_005", categoryName: "주거지역 중심", level: 1, parentCode: null },
        { categoryCode: "LOC_006", categoryName: "대중교통 이용자", level: 1, parentCode: null },
        { categoryCode: "LOC_007", categoryName: "자가용 이용자", level: 1, parentCode: null },
      ];
    case "filter":
      return [
        { categoryCode: "DEVICE_ANDROID", categoryName: "Android 기기", level: 1, parentCode: null, metadata: { type: "device" } },
        { categoryCode: "DEVICE_IOS", categoryName: "iOS 기기", level: 1, parentCode: null, metadata: { type: "device" } },
        { categoryCode: "CARRIER_5G", categoryName: "5G 이용자", level: 1, parentCode: null, metadata: { type: "carrier" } },
        { categoryCode: "CARRIER_LTE", categoryName: "LTE 이용자", level: 1, parentCode: null, metadata: { type: "carrier" } },
        { categoryCode: "PLAN_UNLIMITED", categoryName: "무제한 요금제", level: 1, parentCode: null, metadata: { type: "plan" } },
        { categoryCode: "PLAN_DATA", categoryName: "데이터 요금제", level: 1, parentCode: null, metadata: { type: "plan" } },
      ];
    default:
      return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { metaType } = req.query;
  
  if (typeof metaType !== 'string') {
    return res.status(400).json({ error: 'Invalid meta type' });
  }

  const validTypes = ["11st", "webapp", "call", "loc", "filter"];
  
  if (!validTypes.includes(metaType)) {
    return res.status(400).json({ error: 'Invalid meta type' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    const cachedMeta = await sql`
      SELECT * FROM ats_meta WHERE meta_type = ${metaType} ORDER BY category_code
    `;
    
    if (cachedMeta.length > 0) {
      const formattedMeta = cachedMeta.map(row => ({
        categoryCode: row.category_code,
        categoryName: row.category_name,
        level: row.level,
        parentCode: row.parent_code,
        metadata: row.metadata,
      }));
      return res.status(200).json(formattedMeta);
    }
    
    const simulatedMeta = getSimulatedAtsMeta(metaType);
    return res.status(200).json(simulatedMeta);
  } catch (error) {
    console.error('[ATS Meta] Error:', error);
    const simulatedMeta = getSimulatedAtsMeta(metaType);
    return res.status(200).json(simulatedMeta);
  }
}
