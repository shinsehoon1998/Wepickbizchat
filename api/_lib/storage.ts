import { getDb } from './db';
import { eq, desc, and } from 'drizzle-orm';
import {
  users,
  campaigns,
  messages,
  targeting,
  transactions,
  reports,
  templates,
} from '../../shared/schema';

export const storage = {
  async getUser(id: string) {
    const db = getDb();
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  },

  async upsertUser(userData: { id: string; email?: string; firstName?: string; lastName?: string; profileImageUrl?: string }) {
    const db = getDb();
    const existingUser = await this.getUser(userData.id);
    
    if (existingUser) {
      const result = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
        })
        .where(eq(users.id, userData.id))
        .returning();
      return result[0];
    }

    const result = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        balance: '0',
      })
      .returning();
    return result[0];
  },

  async updateUserBalance(userId: string, amount: string) {
    const db = getDb();
    const result = await db
      .update(users)
      .set({ balance: amount })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  },

  async updateUserStripeCustomerId(userId: string, stripeCustomerId: string) {
    const db = getDb();
    const result = await db
      .update(users)
      .set({ 
        stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  },

  async creditBalanceAtomically(userId: string, amount: number, stripeSessionId: string) {
    const db = getDb();
    const existingTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.stripeSessionId, stripeSessionId))
      .limit(1);

    if (existingTx.length > 0) {
      return { success: false, alreadyProcessed: true };
    }

    const user = await this.getUser(userId);
    if (!user) {
      return { success: false, alreadyProcessed: false };
    }

    const currentBalance = parseInt(user.balance) || 0;
    const newBalance = currentBalance + amount;

    await db.update(users).set({ balance: newBalance.toString() }).where(eq(users.id, userId));
    
    await db.insert(transactions).values({
      userId,
      type: 'charge',
      amount: amount.toString(),
      balanceAfter: newBalance.toString(),
      description: `잔액 충전 (Stripe)`,
      stripeSessionId,
    });

    return { success: true, alreadyProcessed: false, newBalance };
  },

  async getTemplates(userId: string) {
    const db = getDb();
    return db.select().from(templates).where(eq(templates.userId, userId)).orderBy(desc(templates.createdAt));
  },

  async getTemplate(id: string) {
    const db = getDb();
    const result = await db.select().from(templates).where(eq(templates.id, id));
    return result[0];
  },

  async getApprovedTemplates(userId: string) {
    const db = getDb();
    return db.select().from(templates).where(and(eq(templates.userId, userId), eq(templates.status, 'approved'))).orderBy(desc(templates.createdAt));
  },

  async createTemplate(data: any) {
    const db = getDb();
    const result = await db.insert(templates).values(data).returning();
    return result[0];
  },

  async updateTemplate(id: string, data: any) {
    const db = getDb();
    const result = await db.update(templates).set(data).where(eq(templates.id, id)).returning();
    return result[0];
  },

  async deleteTemplate(id: string) {
    const db = getDb();
    await db.delete(templates).where(eq(templates.id, id));
    return true;
  },

  async getCampaigns(userId: string) {
    const db = getDb();
    return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
  },

  async getCampaign(id: string) {
    const db = getDb();
    const result = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return result[0];
  },

  async createCampaign(data: any) {
    const db = getDb();
    const result = await db.insert(campaigns).values(data).returning();
    return result[0];
  },

  async updateCampaign(id: string, data: any) {
    const db = getDb();
    const result = await db.update(campaigns).set(data).where(eq(campaigns.id, id)).returning();
    return result[0];
  },

  async deleteCampaign(id: string) {
    const db = getDb();
    await db.delete(messages).where(eq(messages.campaignId, id));
    await db.delete(targeting).where(eq(targeting.campaignId, id));
    await db.delete(reports).where(eq(reports.campaignId, id));
    await db.delete(campaigns).where(eq(campaigns.id, id));
    return true;
  },

  async getMessage(campaignId: string) {
    const db = getDb();
    const result = await db.select().from(messages).where(eq(messages.campaignId, campaignId));
    return result[0];
  },

  async createMessage(data: any) {
    const db = getDb();
    const result = await db.insert(messages).values(data).returning();
    return result[0];
  },

  async getTargeting(campaignId: string) {
    const db = getDb();
    const result = await db.select().from(targeting).where(eq(targeting.campaignId, campaignId));
    return result[0];
  },

  async createTargeting(data: any) {
    const db = getDb();
    const result = await db.insert(targeting).values(data).returning();
    return result[0];
  },

  async updateTargeting(campaignId: string, data: any) {
    const db = getDb();
    const result = await db.update(targeting).set(data).where(eq(targeting.campaignId, campaignId)).returning();
    return result[0];
  },

  async getTransactions(userId: string) {
    const db = getDb();
    return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt));
  },

  async createTransaction(data: any) {
    const db = getDb();
    const result = await db.insert(transactions).values(data).returning();
    return result[0];
  },

  async getReport(campaignId: string) {
    const db = getDb();
    const result = await db.select().from(reports).where(eq(reports.campaignId, campaignId));
    return result[0];
  },

  async createReport(data: any) {
    const db = getDb();
    const result = await db.insert(reports).values(data).returning();
    return result[0];
  },

  async updateReport(campaignId: string, data: any) {
    const db = getDb();
    const result = await db.update(reports).set(data).where(eq(reports.campaignId, campaignId)).returning();
    return result[0];
  },

  async getDashboardStats(userId: string) {
    const db = getDb();
    const userCampaigns = await db.select().from(campaigns).where(eq(campaigns.userId, userId));
    
    let totalSent = 0;
    let totalSuccess = 0;
    let totalClicks = 0;
    let activeCampaigns = 0;

    for (const campaign of userCampaigns) {
      if (campaign.statusCode === 20 || campaign.statusCode === 30) {
        activeCampaigns++;
      }
      const report = await this.getReport(campaign.id);
      if (report) {
        totalSent += report.sent || 0;
        totalSuccess += report.delivered || 0;
        totalClicks += report.clicked || 0;
      }
    }

    return {
      totalCampaigns: userCampaigns.length,
      activeCampaigns,
      totalSent,
      totalSuccess,
      totalClicks,
      successRate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0,
    };
  },

  async getTemplateStats(templateId: string, userId: string) {
    const db = getDb();
    const templateCampaigns = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.templateId, templateId), eq(campaigns.userId, userId)));

    let totalSent = 0;
    let totalDelivered = 0;
    let lastSentAt: Date | null = null;

    for (const campaign of templateCampaigns) {
      const report = await this.getReport(campaign.id);
      if (report) {
        totalSent += report.sent || 0;
        totalDelivered += report.delivered || 0;
      }
      if (campaign.completedAt && (!lastSentAt || campaign.completedAt > lastSentAt)) {
        lastSentAt = campaign.completedAt;
      }
    }

    return {
      campaignCount: templateCampaigns.length,
      totalSent,
      totalDelivered,
      lastSentAt,
    };
  },
};
