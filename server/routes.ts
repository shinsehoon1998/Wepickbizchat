import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCampaignSchema, insertMessageSchema, insertTargetingSchema, insertTemplateSchema, CAMPAIGN_STATUS } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

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
      res.json(templates);
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
      
      const bizchatCampaignId = `BZ${Date.now()}${Math.random().toString(36).substring(7).toUpperCase()}`;
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        status: "pending",
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
      
      if (campaign.status === "approved" || campaign.status === "running" || campaign.status === "completed") {
        return res.json(campaign);
      }
      
      if (campaign.status !== "pending") {
        return res.status(400).json({ error: "Only pending campaigns can be approved" });
      }
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        status: "approved",
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
      
      if (campaign.status === "running" || campaign.status === "completed") {
        return res.json(campaign);
      }
      
      if (campaign.status !== "approved") {
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
        status: "running",
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
          if (currentCampaign?.status === "running") {
            await storage.updateCampaign(req.params.id, {
              status: "completed",
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

  return httpServer;
}
