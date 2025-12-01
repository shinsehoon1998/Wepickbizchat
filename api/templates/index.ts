import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../_lib/auth';
import { storage } from '../_lib/storage';
import { z } from 'zod';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  messageType: z.enum(['LMS', 'MMS', 'RCS']),
  title: z.string().max(60).optional(),
  content: z.string().min(1).max(2000),
  imageUrl: z.string().optional(),
});

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const userId = req.userId;

  if (req.method === 'GET') {
    try {
      const templates = await storage.getTemplates(userId);
      
      const templatesWithStats = await Promise.all(
        templates.map(async (template) => {
          const stats = await storage.getTemplateStats(template.id, userId);
          return {
            ...template,
            sendHistory: {
              campaignCount: stats.campaignCount,
              totalSent: stats.totalSent,
              totalDelivered: stats.totalDelivered,
              lastSentAt: stats.lastSentAt,
            },
          };
        })
      );
      
      return res.status(200).json(templatesWithStats);
    } catch (error) {
      console.error('Error fetching templates:', error);
      return res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createTemplateSchema.parse(req.body);
      
      const template = await storage.createTemplate({
        userId,
        name: data.name,
        messageType: data.messageType,
        title: data.title,
        content: data.content,
        imageUrl: data.imageUrl,
        status: 'draft',
      });
      
      return res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid template data', details: error.errors });
      }
      console.error('Error creating template:', error);
      return res.status(500).json({ error: 'Failed to create template' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
