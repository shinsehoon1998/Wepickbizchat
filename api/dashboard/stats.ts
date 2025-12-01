import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../lib/auth';
import { storage } from '../lib/storage';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await storage.getDashboardStats(req.userId);
    return res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
}

export default withAuth(handler);
