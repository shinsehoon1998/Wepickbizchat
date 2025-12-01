import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
    });
    throw new Error('Supabase configuration is missing');
  }
  
  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  return _supabaseAdmin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    return getSupabaseAdmin()[prop as keyof SupabaseClient];
  }
});

export interface AuthenticatedRequest extends VercelRequest {
  userId: string;
  userEmail: string;
}

export async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No authorization header found');
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
      console.error('Supabase auth error:', error.message);
      return null;
    }
    
    if (!user) {
      console.log('No user found for token');
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
  handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<VercelResponse | void>
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

export async function authenticateRequest(req: VercelRequest) {
  const auth = await verifyAuth(req);
  
  if (!auth) {
    return null;
  }

  const { storage } = await import('./storage');
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
