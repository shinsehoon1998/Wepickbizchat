import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../lib/auth';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gender, ageMin: rawAgeMin, ageMax: rawAgeMax, regions } = req.body;
    
    const ageMin = typeof rawAgeMin === 'number' ? rawAgeMin : 20;
    const ageMax = typeof rawAgeMax === 'number' ? rawAgeMax : 60;
    
    if (ageMin < 0 || ageMax < 0 || ageMin > 100 || ageMax > 100) {
      return res.status(400).json({ error: '나이는 0~100 사이여야 합니다' });
    }
    
    if (ageMin > ageMax) {
      return res.status(400).json({ error: '최소 나이가 최대 나이보다 클 수 없습니다' });
    }
    
    if (gender && !['all', 'male', 'female'].includes(gender)) {
      return res.status(400).json({ error: '성별은 all, male, female 중 하나여야 합니다' });
    }
    
    let baseAudience = 500000;
    
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
    
    const estimatedCount = Math.round(baseAudience);
    const minCount = Math.round(estimatedCount * 0.85);
    const maxCount = Math.round(estimatedCount * 1.15);
    
    return res.status(200).json({
      estimatedCount: Math.max(1000, estimatedCount),
      minCount: Math.max(850, minCount),
      maxCount: Math.max(1150, maxCount),
      reachRate: 85 + Math.floor(Math.random() * 10),
    });
  } catch (error) {
    console.error('Error estimating targeting:', error);
    return res.status(500).json({ error: 'Failed to estimate targeting' });
  }
}

export default withAuth(handler);
