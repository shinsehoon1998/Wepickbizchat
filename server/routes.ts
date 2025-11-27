import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCampaignSchema, insertMessageSchema, insertTargetingSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);

  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/campaigns", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaigns = await storage.getCampaigns(userId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const message = await storage.getMessage(campaign.id);
      const targeting = await storage.getTargeting(campaign.id);
      const report = await storage.getReport(campaign.id);
      
      res.json({
        ...campaign,
        message,
        targeting,
        report,
      });
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  const createCampaignSchema = z.object({
    name: z.string().min(1).max(200),
    messageType: z.enum(["LMS", "MMS", "RCS"]),
    title: z.string().max(60).optional(),
    content: z.string().min(1).max(2000),
    gender: z.enum(["all", "male", "female"]).default("all"),
    ageMin: z.number().min(10).max(100).default(20),
    ageMax: z.number().min(10).max(100).default(60),
    regions: z.array(z.string()).default([]),
    targetCount: z.number().min(100).default(1000),
    budget: z.number().min(10000),
  });

  app.post("/api/campaigns", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const data = createCampaignSchema.parse(req.body);
      
      const userBalance = parseFloat(user.balance as string || "0");
      const estimatedCost = data.targetCount * 50;
      
      if (userBalance < estimatedCost) {
        return res.status(400).json({ error: "잔액이 부족합니다" });
      }
      
      const campaign = await storage.createCampaign({
        userId,
        name: data.name,
        messageType: data.messageType,
        targetCount: data.targetCount,
        budget: data.budget.toString(),
        status: "draft",
      });
      
      await storage.createMessage({
        campaignId: campaign.id,
        title: data.title || null,
        content: data.content,
      });
      
      await storage.createTargeting({
        campaignId: campaign.id,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
      });
      
      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.patch("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, req.body);
      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.delete("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (campaign.status !== "draft") {
        return res.status(400).json({ error: "Only draft campaigns can be deleted" });
      }
      
      await storage.deleteCampaign(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  app.get("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const transactions = await storage.getTransactions(userId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions/charge", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { amount, paymentMethod } = req.body;
      
      if (!amount || amount < 10000) {
        return res.status(400).json({ error: "Minimum charge amount is 10,000 KRW" });
      }
      
      const currentBalance = parseFloat(user.balance as string || "0");
      const newBalance = currentBalance + amount;
      
      const transaction = await storage.createTransaction({
        userId,
        type: "charge",
        amount: amount.toString(),
        balanceAfter: newBalance.toString(),
        description: "잔액 충전",
        paymentMethod: paymentMethod || "card",
      });
      
      await storage.updateUserBalance(userId, newBalance.toString());
      
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error processing charge:", error);
      res.status(500).json({ error: "Failed to process charge" });
    }
  });

  app.post("/api/campaigns/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (campaign.status !== "draft") {
        return res.status(400).json({ error: "Only draft campaigns can be submitted" });
      }
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        status: "pending",
      });
      
      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error submitting campaign:", error);
      res.status(500).json({ error: "Failed to submit campaign" });
    }
  });

  return httpServer;
}
