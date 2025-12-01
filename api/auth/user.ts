import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../lib/auth';
import { storage } from '../lib/storage';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Fetching user:', req.userId);
    let user = await storage.getUser(req.userId);

    if (!user) {
      console.log('User not found, creating new user:', req.userId, req.userEmail);
      user = await storage.upsertUser({
        id: req.userId,
        email: req.userEmail,
      });
    }

    console.log('User fetched successfully:', user.id);
    return res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ 
      error: 'Failed to fetch user',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
}

export default withAuth(handler);
