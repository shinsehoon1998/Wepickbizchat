import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../_lib/auth';
import { storage } from '../_lib/storage';
import { z } from 'zod';

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  messageType: z.enum(['LMS', 'MMS', 'RCS']).optional(),
  title: z.string().max(60).optional(),
  content: z.string().min(1).max(2000).optional(),
  imageUrl: z.string().optional(),
});

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const userId = req.userId;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid template ID' });
  }

  if (req.method === 'GET') {
    try {
      const template = await storage.getTemplate(id);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      return res.status(200).json(template);
    } catch (error) {
      console.error('Error fetching template:', error);
      return res.status(500).json({ error: 'Failed to fetch template' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const template = await storage.getTemplate(id);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      if (template.status !== 'draft' && template.status !== 'rejected') {
        return res.status(400).json({ error: 'Only draft or rejected templates can be edited' });
      }
      
      const data = updateTemplateSchema.parse(req.body);
      const updatedTemplate = await storage.updateTemplate(id, data);
      
      return res.status(200).json(updatedTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid template data', details: error.errors });
      }
      console.error('Error updating template:', error);
      return res.status(500).json({ error: 'Failed to update template' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const template = await storage.getTemplate(id);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      if (template.status === 'pending') {
        return res.status(400).json({ error: 'Cannot delete template under review' });
      }
      
      await storage.deleteTemplate(id);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting template:', error);
      return res.status(500).json({ error: 'Failed to delete template' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
