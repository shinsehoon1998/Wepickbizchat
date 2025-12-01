import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../lib/auth';
import { storage } from '../lib/storage';
import { z } from 'zod';

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().min(1),
  messageType: z.enum(['LMS', 'MMS', 'RCS']),
  sndNum: z.string().min(1),
  gender: z.enum(['all', 'male', 'female']).default('all'),
  ageMin: z.number().min(10).max(100).default(20),
  ageMax: z.number().min(10).max(100).default(60),
  regions: z.array(z.string()).default([]),
  targetCount: z.number().min(100).default(1000),
  budget: z.number().min(10000),
  scheduledAt: z.string().optional(),
});

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const userId = req.userId;

  if (req.method === 'GET') {
    try {
      const campaigns = await storage.getCampaigns(userId);
      return res.status(200).json(campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
  }

  if (req.method === 'POST') {
    try {
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const data = createCampaignSchema.parse(req.body);
      
      const template = await storage.getTemplate(data.templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: 'Access denied to template' });
      }
      
      if (template.status !== 'approved') {
        return res.status(400).json({ error: 'Template must be approved before creating campaign' });
      }
      
      const userBalance = parseFloat(user.balance as string || '0');
      const estimatedCost = data.targetCount * 50;
      
      if (userBalance < estimatedCost) {
        return res.status(400).json({ error: '잔액이 부족합니다' });
      }
      
      const campaign = await storage.createCampaign({
        userId,
        name: data.name,
        templateId: data.templateId,
        messageType: data.messageType,
        sndNum: data.sndNum,
        statusCode: '00',
        status: '작성중',
        targetCount: data.targetCount,
        budget: data.budget.toString(),
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      });
      
      await storage.createMessage({
        campaignId: campaign.id,
        title: template.title || null,
        content: template.content,
        imageUrl: template.imageUrl,
      });
      
      await storage.createTargeting({
        campaignId: campaign.id,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
      });
      
      return res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('Error creating campaign:', error);
      return res.status(500).json({ error: 'Failed to create campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
