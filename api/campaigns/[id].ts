import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../_lib/auth';
import { storage } from '../_lib/storage';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const userId = req.userId;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid campaign ID' });
  }

  if (req.method === 'GET') {
    try {
      const campaign = await storage.getCampaign(id);
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const message = await storage.getMessage(campaign.id);
      const targeting = await storage.getTargeting(campaign.id);
      const report = await storage.getReport(campaign.id);
      
      return res.status(200).json({
        ...campaign,
        message,
        targeting,
        report,
      });
    } catch (error) {
      console.error('Error fetching campaign:', error);
      return res.status(500).json({ error: 'Failed to fetch campaign' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const campaign = await storage.getCampaign(id);
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const updatedCampaign = await storage.updateCampaign(id, req.body);
      return res.status(200).json(updatedCampaign);
    } catch (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({ error: 'Failed to update campaign' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const campaign = await storage.getCampaign(id);
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      if (campaign.statusCode !== '00') {
        return res.status(400).json({ error: 'Only draft campaigns can be deleted' });
      }
      
      await storage.deleteCampaign(id);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({ error: 'Failed to delete campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
