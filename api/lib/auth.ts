import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export interface AuthenticatedRequest extends VercelRequest {
  userId: string;
  userEmail: string;
}

export async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export function withAuth(
  handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const auth = await verifyAuth(req);

    if (!auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    (req as AuthenticatedRequest).userId = auth.userId;
    (req as AuthenticatedRequest).userEmail = auth.email;

    return handler(req as AuthenticatedRequest, res);
  };
}

import { storage } from './storage';

export async function authenticateRequest(req: VercelRequest) {
  const auth = await verifyAuth(req);
  
  if (!auth) {
    return null;
  }

  const user = await storage.getUser(auth.userId);
  
  if (!user) {
    const newUser = await storage.upsertUser({
      id: auth.userId,
      email: auth.email,
    });
    return newUser;
  }

  return user;
}
