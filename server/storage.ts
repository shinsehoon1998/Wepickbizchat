import {
  users,
  campaigns,
  messages,
  targeting,
  transactions,
  reports,
  type User,
  type UpsertUser,
  type Campaign,
  type InsertCampaign,
  type Message,
  type InsertMessage,
  type Targeting,
  type InsertTargeting,
  type Transaction,
  type InsertTransaction,
  type Report,
  type InsertReport,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserBalance(userId: string, amount: string): Promise<User | undefined>;
  
  getCampaigns(userId: string): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<boolean>;
  
  getMessage(campaignId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  getTargeting(campaignId: string): Promise<Targeting | undefined>;
  createTargeting(targeting: InsertTargeting): Promise<Targeting>;
  updateTargeting(campaignId: string, targeting: Partial<InsertTargeting>): Promise<Targeting | undefined>;
  
  getTransactions(userId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  getReport(campaignId: string): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(campaignId: string, report: Partial<InsertReport>): Promise<Report | undefined>;
  
  getDashboardStats(userId: string): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalSent: number;
    totalSuccess: number;
    totalClicks: number;
    successRate: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserBalance(userId: string, amount: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        balance: amount,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async getCampaigns(userId: string): Promise<Campaign[]> {
    return db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(campaigns.createdAt));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign || undefined;
  }

  async createCampaign(campaignData: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(campaigns).values(campaignData).returning();
    return campaign;
  }

  async updateCampaign(id: string, campaignData: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const [campaign] = await db
      .update(campaigns)
      .set({ ...campaignData, updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return campaign || undefined;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await db.delete(campaigns).where(eq(campaigns.id, id));
    return true;
  }

  async getMessage(campaignId: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.campaignId, campaignId));
    return message || undefined;
  }

  async createMessage(messageData: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(messageData).returning();
    return message;
  }

  async getTargeting(campaignId: string): Promise<Targeting | undefined> {
    const [target] = await db.select().from(targeting).where(eq(targeting.campaignId, campaignId));
    return target || undefined;
  }

  async createTargeting(targetingData: InsertTargeting): Promise<Targeting> {
    const [target] = await db.insert(targeting).values(targetingData).returning();
    return target;
  }

  async updateTargeting(campaignId: string, targetingData: Partial<InsertTargeting>): Promise<Targeting | undefined> {
    const [target] = await db
      .update(targeting)
      .set(targetingData)
      .where(eq(targeting.campaignId, campaignId))
      .returning();
    return target || undefined;
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  async createTransaction(transactionData: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(transactionData).returning();
    return transaction;
  }

  async getReport(campaignId: string): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.campaignId, campaignId));
    return report || undefined;
  }

  async createReport(reportData: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(reportData).returning();
    return report;
  }

  async updateReport(campaignId: string, reportData: Partial<InsertReport>): Promise<Report | undefined> {
    const [report] = await db
      .update(reports)
      .set({ ...reportData, updatedAt: new Date() })
      .where(eq(reports.campaignId, campaignId))
      .returning();
    return report || undefined;
  }

  async getDashboardStats(userId: string): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalSent: number;
    totalSuccess: number;
    totalClicks: number;
    successRate: number;
  }> {
    const userCampaigns = await this.getCampaigns(userId);
    
    const totalCampaigns = userCampaigns.length;
    const activeCampaigns = userCampaigns.filter(c => c.status === 'running').length;
    const totalSent = userCampaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);
    const totalSuccess = userCampaigns.reduce((sum, c) => sum + (c.successCount || 0), 0);
    
    let totalClicks = 0;
    for (const campaign of userCampaigns) {
      const report = await this.getReport(campaign.id);
      if (report) {
        totalClicks += report.clickCount || 0;
      }
    }
    
    const successRate = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0;
    
    return {
      totalCampaigns,
      activeCampaigns,
      totalSent,
      totalSuccess,
      totalClicks,
      successRate,
    };
  }
}

export const storage = new DatabaseStorage();
