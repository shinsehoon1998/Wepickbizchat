import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../_lib/auth';
import { storage } from '../_lib/storage';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = req.userId;

  try {
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { amount, paymentMethod } = req.body;
    
    if (!amount || amount < 10000) {
      return res.status(400).json({ error: 'Minimum charge amount is 10,000 KRW' });
    }
    
    const currentBalance = parseFloat(user.balance as string || '0');
    const newBalance = currentBalance + amount;
    
    const transaction = await storage.createTransaction({
      userId,
      type: 'charge',
      amount: amount.toString(),
      balanceAfter: newBalance.toString(),
      description: '잔액 충전',
      paymentMethod: paymentMethod || 'card',
    });
    
    await storage.updateUserBalance(userId, newBalance.toString());
    
    return res.status(201).json(transaction);
  } catch (error) {
    console.error('Error processing charge:', error);
    return res.status(500).json({ error: 'Failed to process charge' });
  }
}

export default withAuth(handler);
