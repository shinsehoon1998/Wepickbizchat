import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../lib/auth';
import { storage } from '../lib/storage';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const userId = req.userId;

  if (req.method === 'GET') {
    try {
      const transactions = await storage.getTransactions(userId);
      return res.status(200).json(transactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
