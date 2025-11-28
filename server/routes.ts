import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCampaignSchema, insertMessageSchema, insertTargetingSchema, insertTemplateSchema, CAMPAIGN_STATUS } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";

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

  // Template routes
  app.get("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const templates = await storage.getTemplates(userId);
      
      // Add send history stats for each template (filtered by userId for security)
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
      
      res.json(templatesWithStats);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/approved", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const templates = await storage.getApprovedTemplates(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching approved templates:", error);
      res.status(500).json({ error: "Failed to fetch approved templates" });
    }
  });

  app.get("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  const createTemplateSchema = z.object({
    name: z.string().min(1).max(200),
    messageType: z.enum(["LMS", "MMS", "RCS"]),
    title: z.string().max(60).optional(),
    content: z.string().min(1).max(2000),
    imageUrl: z.string().optional(),
  });

  app.post("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const data = createTemplateSchema.parse(req.body);
      
      const template = await storage.createTemplate({
        userId,
        name: data.name,
        messageType: data.messageType,
        title: data.title,
        content: data.content,
        imageUrl: data.imageUrl,
        status: "draft",
      });
      
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid template data", details: error.errors });
      }
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.patch("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (template.status !== "draft" && template.status !== "rejected") {
        return res.status(400).json({ error: "Only draft or rejected templates can be edited" });
      }
      
      const updateSchema = createTemplateSchema.partial();
      const data = updateSchema.parse(req.body);
      
      const updatedTemplate = await storage.updateTemplate(req.params.id, data);
      res.json(updatedTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid template data", details: error.errors });
      }
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (template.status === "pending") {
        return res.status(400).json({ error: "Cannot delete template under review" });
      }
      
      await storage.deleteTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // Template approval workflow
  app.post("/api/templates/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (template.status !== "draft" && template.status !== "rejected") {
        return res.status(400).json({ error: "Only draft or rejected templates can be submitted for review" });
      }
      
      const updatedTemplate = await storage.updateTemplate(req.params.id, {
        status: "pending",
        submittedAt: new Date(),
      } as any);
      
      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error submitting template:", error);
      res.status(500).json({ error: "Failed to submit template for review" });
    }
  });

  // Simulate template approval (in production, this would be an admin action)
  app.post("/api/templates/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (template.status !== "pending") {
        return res.status(400).json({ error: "Only pending templates can be approved" });
      }
      
      const updatedTemplate = await storage.updateTemplate(req.params.id, {
        status: "approved",
        reviewedAt: new Date(),
      } as any);
      
      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error approving template:", error);
      res.status(500).json({ error: "Failed to approve template" });
    }
  });

  app.post("/api/templates/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { reason } = req.body;
      const template = await storage.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (template.status !== "pending") {
        return res.status(400).json({ error: "Only pending templates can be rejected" });
      }
      
      const updatedTemplate = await storage.updateTemplate(req.params.id, {
        status: "rejected",
        rejectionReason: reason || "검수 기준에 부합하지 않습니다.",
        reviewedAt: new Date(),
      } as any);
      
      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error rejecting template:", error);
      res.status(500).json({ error: "Failed to reject template" });
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
    templateId: z.string().min(1),
    messageType: z.enum(["LMS", "MMS", "RCS"]),
    sndNum: z.string().min(1),
    gender: z.enum(["all", "male", "female"]).default("all"),
    ageMin: z.number().min(10).max(100).default(20),
    ageMax: z.number().min(10).max(100).default(60),
    regions: z.array(z.string()).default([]),
    targetCount: z.number().min(100).default(1000),
    budget: z.number().min(10000),
    scheduledAt: z.string().optional(),
  });

  app.post("/api/campaigns", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const data = createCampaignSchema.parse(req.body);
      
      const template = await storage.getTemplate(data.templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied to template" });
      }
      
      if (template.status !== "approved") {
        return res.status(400).json({ error: "Template must be approved before creating campaign" });
      }
      
      const userBalance = parseFloat(user.balance as string || "0");
      const estimatedCost = data.targetCount * 50;
      
      if (userBalance < estimatedCost) {
        return res.status(400).json({ error: "잔액이 부족합니다" });
      }
      
      const campaign = await storage.createCampaign({
        userId,
        name: data.name,
        templateId: data.templateId,
        messageType: data.messageType,
        sndNum: data.sndNum,
        statusCode: CAMPAIGN_STATUS.DRAFT.code,
        status: CAMPAIGN_STATUS.DRAFT.status,
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
      
      if (campaign.statusCode !== CAMPAIGN_STATUS.DRAFT.code) {
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

  app.post("/api/targeting/estimate", isAuthenticated, async (req, res) => {
    try {
      const { gender, ageMin: rawAgeMin, ageMax: rawAgeMax, regions } = req.body;
      
      const ageMin = typeof rawAgeMin === 'number' ? rawAgeMin : 20;
      const ageMax = typeof rawAgeMax === 'number' ? rawAgeMax : 60;
      
      if (ageMin < 0 || ageMax < 0 || ageMin > 100 || ageMax > 100) {
        return res.status(400).json({ error: "나이는 0~100 사이여야 합니다" });
      }
      
      if (ageMin > ageMax) {
        return res.status(400).json({ error: "최소 나이가 최대 나이보다 클 수 없습니다" });
      }
      
      if (gender && !["all", "male", "female"].includes(gender)) {
        return res.status(400).json({ error: "성별은 all, male, female 중 하나여야 합니다" });
      }
      
      let baseAudience = 500000;
      
      if (gender === "male") {
        baseAudience = baseAudience * 0.52;
      } else if (gender === "female") {
        baseAudience = baseAudience * 0.48;
      }
      
      const ageRange = ageMax - ageMin;
      const ageMultiplier = Math.max(0.1, ageRange / 60);
      baseAudience = baseAudience * ageMultiplier;
      
      const regionPopulationShare: Record<string, number> = {
        "서울": 0.19, "경기": 0.26, "인천": 0.06, "부산": 0.07, "대구": 0.05,
        "광주": 0.03, "대전": 0.03, "울산": 0.02, "세종": 0.01,
        "강원": 0.03, "충북": 0.03, "충남": 0.04, "전북": 0.04, "전남": 0.04,
        "경북": 0.05, "경남": 0.07, "제주": 0.01
      };
      
      if (regions && Array.isArray(regions) && regions.length > 0) {
        let regionMultiplier = 0;
        for (const region of regions) {
          regionMultiplier += regionPopulationShare[region] || 0.03;
        }
        baseAudience = baseAudience * regionMultiplier;
      }
      
      const estimatedCount = Math.round(baseAudience);
      const minCount = Math.round(estimatedCount * 0.85);
      const maxCount = Math.round(estimatedCount * 1.15);
      
      res.json({
        estimatedCount: Math.max(1000, estimatedCount),
        minCount: Math.max(850, minCount),
        maxCount: Math.max(1150, maxCount),
        reachRate: 85 + Math.floor(Math.random() * 10),
      });
    } catch (error) {
      console.error("Error estimating targeting:", error);
      res.status(500).json({ error: "Failed to estimate targeting" });
    }
  });

  const testSendSchema = z.object({
    templateId: z.string().min(1),
    phoneNumber: z.string().min(1),
  });

  app.post("/api/test-send", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const data = testSendSchema.parse(req.body);
      
      const template = await storage.getTemplate(data.templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied to template" });
      }
      
      if (template.status !== "approved") {
        return res.status(400).json({ error: "Template must be approved before sending test message" });
      }
      
      console.log(`Test send requested: Template ${template.name} to ${data.phoneNumber}`);
      
      res.json({ 
        success: true, 
        message: "테스트 메시지를 발송했어요",
        templateId: data.templateId,
        phoneNumber: data.phoneNumber,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error sending test message:", error);
      res.status(500).json({ error: "Failed to send test message" });
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
      
      if (campaign.statusCode !== CAMPAIGN_STATUS.DRAFT.code) {
        return res.status(400).json({ error: "Only draft campaigns can be submitted" });
      }
      
      const bizchatCampaignId = `BZ${Date.now()}${Math.random().toString(36).substring(7).toUpperCase()}`;
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        statusCode: CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
        status: CAMPAIGN_STATUS.APPROVAL_REQUESTED.status,
        bizchatCampaignId,
      });
      
      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error submitting campaign:", error);
      res.status(500).json({ error: "Failed to submit campaign" });
    }
  });

  app.post("/api/campaigns/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const statusCode = campaign.statusCode;
      if (statusCode === CAMPAIGN_STATUS.APPROVED.code || 
          statusCode === CAMPAIGN_STATUS.RUNNING.code || 
          statusCode === CAMPAIGN_STATUS.COMPLETED.code) {
        return res.json(campaign);
      }
      
      if (statusCode !== CAMPAIGN_STATUS.APPROVAL_REQUESTED.code) {
        return res.status(400).json({ error: "Only pending campaigns can be approved" });
      }
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        statusCode: CAMPAIGN_STATUS.APPROVED.code,
        status: CAMPAIGN_STATUS.APPROVED.status,
      });
      
      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error approving campaign:", error);
      res.status(500).json({ error: "Failed to approve campaign" });
    }
  });

  app.post("/api/campaigns/:id/start", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign || !user) {
        return res.status(404).json({ error: "Campaign or user not found" });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const statusCode = campaign.statusCode;
      if (statusCode === CAMPAIGN_STATUS.RUNNING.code || statusCode === CAMPAIGN_STATUS.COMPLETED.code) {
        return res.json(campaign);
      }
      
      if (statusCode !== CAMPAIGN_STATUS.APPROVED.code) {
        return res.status(400).json({ error: "Only approved campaigns can be started" });
      }
      
      const estimatedCost = campaign.targetCount * parseFloat(campaign.costPerMessage || "50");
      const userBalance = parseFloat(user.balance as string || "0");
      
      if (userBalance < estimatedCost) {
        return res.status(400).json({ error: "잔액이 부족합니다" });
      }
      
      const sentCount = campaign.targetCount;
      const successCount = Math.floor(sentCount * (0.85 + Math.random() * 0.12));
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        statusCode: CAMPAIGN_STATUS.RUNNING.code,
        status: CAMPAIGN_STATUS.RUNNING.status,
        sentCount,
        successCount,
        scheduledAt: new Date(),
      });
      
      await storage.updateUserBalance(userId, (userBalance - estimatedCost).toString());
      
      await storage.createTransaction({
        userId,
        type: "usage",
        amount: (-estimatedCost).toString(),
        balanceAfter: (userBalance - estimatedCost).toString(),
        description: `캠페인 발송: ${campaign.name}`,
      });
      
      await storage.createReport({
        campaignId: req.params.id,
        sentCount,
        deliveredCount: successCount,
        failedCount: sentCount - successCount,
        clickCount: Math.floor(successCount * (0.02 + Math.random() * 0.05)),
        optOutCount: Math.floor(successCount * Math.random() * 0.005),
      });
      
      setTimeout(async () => {
        try {
          const currentCampaign = await storage.getCampaign(req.params.id);
          if (currentCampaign?.statusCode === CAMPAIGN_STATUS.RUNNING.code) {
            await storage.updateCampaign(req.params.id, {
              statusCode: CAMPAIGN_STATUS.COMPLETED.code,
              status: CAMPAIGN_STATUS.COMPLETED.status,
              completedAt: new Date(),
            });
          }
        } catch (err) {
          console.error("Failed to complete campaign:", err);
        }
      }, 10000);
      
      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error starting campaign:", error);
      res.status(500).json({ error: "Failed to start campaign" });
    }
  });

  app.post("/api/campaigns/:id/test-send", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { phoneNumber } = req.body;
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "휴대폰 번호를 입력해주세요" });
      }
      
      res.json({
        success: true,
        message: `${phoneNumber}로 테스트 메시지를 발송했어요`,
        testId: `TEST${Date.now()}`,
      });
    } catch (error) {
      console.error("Error sending test message:", error);
      res.status(500).json({ error: "Failed to send test message" });
    }
  });

  // Template-based test send (before campaign creation)
  app.post("/api/test-send", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { templateId, phoneNumber } = req.body;
      
      if (!templateId) {
        return res.status(400).json({ error: "템플릿을 선택해주세요" });
      }
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "휴대폰 번호를 입력해주세요" });
      }
      
      // Validate phone number format (Korean mobile: 010-XXXX-XXXX or 01XXXXXXXXX)
      const cleanPhone = phoneNumber.replace(/-/g, '');
      if (!/^01[0-9]{8,9}$/.test(cleanPhone)) {
        return res.status(400).json({ error: "올바른 휴대폰 번호 형식이 아니에요 (예: 010-1234-5678)" });
      }
      
      const template = await storage.getTemplate(templateId);
      
      if (!template) {
        return res.status(404).json({ error: "템플릿을 찾을 수 없어요" });
      }
      
      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (template.status !== "approved") {
        return res.status(400).json({ error: "승인된 템플릿만 테스트 발송이 가능해요" });
      }
      
      // Mock test send - in production, this would call BizChat API
      res.json({
        success: true,
        message: `${phoneNumber}로 테스트 메시지를 발송했어요`,
        testId: `TEST${Date.now()}`,
        template: {
          name: template.name,
          messageType: template.messageType,
        },
      });
    } catch (error) {
      console.error("Error sending test message:", error);
      res.status(500).json({ error: "테스트 발송에 실패했어요" });
    }
  });

  app.get("/api/reports/export", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaigns = await storage.getCampaigns(userId);
      
      const completedCampaigns = campaigns.filter(c => 
        c.status === 'completed' || c.status === 'running'
      );
      
      if (completedCampaigns.length === 0) {
        return res.status(404).json({ error: "내보낼 리포트 데이터가 없습니다" });
      }
      
      let csvContent = "캠페인ID,캠페인명,상태,메시지유형,발송대상수,발송수,성공수,실패수,클릭수,예산,생성일,완료일\n";
      
      for (const campaign of completedCampaigns) {
        const report = await storage.getReport(campaign.id);
        csvContent += [
          campaign.id,
          `"${campaign.name.replace(/"/g, '""')}"`,
          campaign.status,
          campaign.messageType,
          campaign.targetCount,
          campaign.sentCount || 0,
          campaign.successCount || 0,
          report?.failedCount || 0,
          report?.clickCount || 0,
          campaign.budget,
          campaign.createdAt?.toISOString() || '',
          campaign.completedAt?.toISOString() || '',
        ].join(",") + "\n";
      }
      
      const bom = '\ufeff';
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=campaign-report-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(bom + csvContent);
    } catch (error) {
      console.error("Error exporting reports:", error);
      res.status(500).json({ error: "Failed to export reports" });
    }
  });

  // Sender Numbers routes
  app.get("/api/sender-numbers", isAuthenticated, async (req, res) => {
    try {
      const numbers = await storage.getSenderNumbers();
      
      if (numbers.length === 0) {
        const mockNumbers = [
          { code: "001001", name: "WePick 대표번호", phoneNumber: "02-1234-5678" },
          { code: "001002", name: "SKT 비즈챗", phoneNumber: "1588-0000" },
          { code: "001003", name: "마케팅팀", phoneNumber: "02-9876-5432" },
        ];
        
        for (const num of mockNumbers) {
          await storage.createSenderNumber(num);
        }
        
        const newNumbers = await storage.getSenderNumbers();
        return res.json(newNumbers);
      }
      
      res.json(numbers);
    } catch (error) {
      console.error("Error fetching sender numbers:", error);
      res.status(500).json({ error: "Failed to fetch sender numbers" });
    }
  });

  // File Upload routes
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const allowedDocTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];
      
      if (allowedImageTypes.includes(file.mimetype) || allowedDocTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('지원하지 않는 파일 형식입니다'));
      }
    },
  });

  app.post("/api/files/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const file = req.file;
      const fileType = req.body.fileType || 'image';
      
      if (!file) {
        return res.status(400).json({ error: "파일이 없습니다" });
      }
      
      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split(',') || [];
      const publicDir = publicPaths[0];
      
      if (!privateDir || !publicDir) {
        return res.status(500).json({ error: "Object Storage가 설정되지 않았습니다" });
      }
      
      const ext = path.extname(file.originalname);
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
      
      const isImage = fileType === 'image';
      const targetDir = isImage ? publicDir : privateDir;
      const storagePath = path.join(targetDir, filename);
      
      await fs.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.writeFile(storagePath, file.buffer);
      
      const fileRecord = await storage.createFile({
        userId,
        fileType,
        originalName: file.originalname,
        storagePath,
        fileSize: file.size,
        mimeType: file.mimetype,
      });
      
      res.json(fileRecord);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "파일 업로드에 실패했습니다" });
    }
  });

  app.get("/api/files", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const files = await storage.getFiles(userId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.get("/api/files/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const file = await storage.getFile(req.params.id);
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(file);
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  app.delete("/api/files/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const file = await storage.getFile(req.params.id);
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      try {
        await fs.unlink(file.storagePath);
      } catch (fsError) {
        console.warn("Failed to delete file from storage:", fsError);
      }
      
      await storage.deleteFile(file.id);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/stripe/config", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error getting Stripe config:", error);
      res.status(500).json({ error: "Failed to get Stripe config" });
    }
  });

  app.post("/api/stripe/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      const { amount } = req.body;
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (!amount || amount < 10000) {
        return res.status(400).json({ error: "최소 충전 금액은 10,000원입니다" });
      }
      
      const stripe = await getUncachableStripeClient();
      
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserStripeCustomerId(userId, customerId);
      }
      
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'krw',
              product_data: {
                name: 'BizChat 잔액 충전',
                description: `${amount.toLocaleString()}원 충전`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/billing?success=true&amount=${amount}`,
        cancel_url: `${baseUrl}/billing?canceled=true`,
        metadata: {
          userId,
          amount: amount.toString(),
          type: 'balance_charge',
        },
      });
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // User Sender Numbers routes
  const createSenderNumberSchema = z.object({
    phoneNumber: z.string().min(10, "발신번호를 입력해주세요").max(15),
    isCompanyOwned: z.boolean(),
    verificationMethod: z.enum(["sms", "document"]),
  });

  const updateSenderNumberAliasSchema = z.object({
    alias: z.string().max(100).optional(),
  });

  const verifySmsSchema = z.object({
    code: z.string().min(4, "인증코드를 입력해주세요").max(10),
  });

  app.get("/api/sender-numbers", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const numbers = await storage.getUserSenderNumbers(userId);
      res.json(numbers);
    } catch (error) {
      console.error("Error fetching sender numbers:", error);
      res.status(500).json({ error: "Failed to fetch sender numbers" });
    }
  });

  app.post("/api/sender-numbers", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      
      const parseResult = createSenderNumberSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }
      
      const { phoneNumber, isCompanyOwned, verificationMethod } = parseResult.data;
      
      // Create sender number with pending status
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1년 후 만료
      
      const number = await storage.createUserSenderNumber({
        userId,
        phoneNumber: phoneNumber.replace(/\D/g, ''),
        status: verificationMethod === 'sms' ? 'pending' : 'active',
        verificationMethod,
        isCompanyOwned,
        expiryDate,
        lastActivityNote: '발신번호를 생성하였습니다.',
      });
      
      // 증빙서류의 경우 즉시 인증 완료 처리
      if (verificationMethod === 'document') {
        await storage.updateUserSenderNumber(number.id, {
          verifiedAt: new Date(),
        });
      }
      
      res.status(201).json(number);
    } catch (error) {
      console.error("Error creating sender number:", error);
      res.status(500).json({ error: "Failed to create sender number" });
    }
  });

  app.patch("/api/sender-numbers/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      
      const parseResult = updateSenderNumberAliasSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }
      
      const existing = await storage.getUserSenderNumber(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "발신번호를 찾을 수 없습니다" });
      }
      
      // 별칭만 수정 허용
      const updated = await storage.updateUserSenderNumber(id, { 
        alias: parseResult.data.alias 
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating sender number:", error);
      res.status(500).json({ error: "Failed to update sender number" });
    }
  });

  app.post("/api/sender-numbers/:id/verify-sms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      
      const parseResult = verifySmsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }
      
      const existing = await storage.getUserSenderNumber(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "발신번호를 찾을 수 없습니다" });
      }
      
      if (existing.status !== 'pending') {
        return res.status(400).json({ error: "이미 인증된 발신번호입니다" });
      }
      
      // 시뮬레이션: 모든 코드 승인 (실제로는 SMS 인증 코드 검증)
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      
      const updated = await storage.updateUserSenderNumber(id, {
        status: 'active',
        verifiedAt: new Date(),
        expiryDate,
        lastActivityNote: '문자 인증이 완료되었습니다.',
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error verifying sender number:", error);
      res.status(500).json({ error: "Failed to verify sender number" });
    }
  });

  app.post("/api/sender-numbers/:id/renew", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      
      const existing = await storage.getUserSenderNumber(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "발신번호를 찾을 수 없습니다" });
      }
      
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      
      // 허용된 필드만 업데이트
      const updated = await storage.updateUserSenderNumber(id, {
        status: 'active',
        expiryDate,
        verifiedAt: new Date(),
        lastActivityNote: '시스템에 의해 자동 연장 처리되었습니다.',
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error renewing sender number:", error);
      res.status(500).json({ error: "Failed to renew sender number" });
    }
  });

  app.delete("/api/sender-numbers/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      
      const existing = await storage.getUserSenderNumber(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "발신번호를 찾을 수 없습니다" });
      }
      
      await storage.deleteUserSenderNumber(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting sender number:", error);
      res.status(500).json({ error: "Failed to delete sender number" });
    }
  });

  return httpServer;
}
