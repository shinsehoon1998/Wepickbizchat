import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../../lib/auth';
import { storage } from '../../lib/storage';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = req.userId;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid template ID' });
  }

  try {
    const template = await storage.getTemplate(id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (template.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (template.status !== 'draft' && template.status !== 'rejected') {
      return res.status(400).json({ error: 'Only draft or rejected templates can be submitted for review' });
    }
    
    const updatedTemplate = await storage.updateTemplate(id, {
      status: 'pending',
      submittedAt: new Date(),
    });
    
    return res.status(200).json(updatedTemplate);
  } catch (error) {
    console.error('Error submitting template:', error);
    return res.status(500).json({ error: 'Failed to submit template for review' });
  }
}

export default withAuth(handler);
