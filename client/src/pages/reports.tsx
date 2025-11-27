import { useQuery } from "@tanstack/react-query";
import { 
  BarChart3, 
  TrendingUp,
  Send,
  CheckCircle2,
  MousePointerClick,
  AlertCircle,
  Download,
  Calendar
} from "lucide-react";
import { useState } from "react";
import { formatNumber, formatDateTime, formatCurrency } from "@/lib/authUtils";
import { StatsCard } from "@/components/stats-card";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import type { Campaign, Report } from "@shared/schema";

interface CampaignWithReport extends Campaign {
  report?: Report;
}

export default function Reports() {
  const [periodFilter, setPeriodFilter] = useState<string>("all");

  const { data: campaigns, isLoading } = useQuery<CampaignWithReport[]>({
    queryKey: ["/api/campaigns?includeReports=true"],
  });

  const completedCampaigns = campaigns?.filter(c => 
    c.status === 'completed' || c.status === 'running'
  ) || [];

  const totalStats = completedCampaigns.reduce((acc, campaign) => ({
    sent: acc.sent + (campaign.sentCount || 0),
    success: acc.success + (campaign.successCount || 0),
    clicks: acc.clicks + (campaign.report?.clickCount || 0),
    budget: acc.budget + parseFloat(campaign.budget as string || "0"),
  }), { sent: 0, success: 0, clicks: 0, budget: 0 });

  const successRate = totalStats.sent > 0 
    ? Math.round((totalStats.success / totalStats.sent) * 100) 
    : 0;

  const clickRate = totalStats.success > 0 
    ? ((totalStats.clicks / totalStats.success) * 100).toFixed(1)
    : "0";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">리포트</h1>
          <p className="text-muted-foreground mt-1">
            캠페인 성과를 분석하고 인사이트를 얻어보세요
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-period-filter">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="기간" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="week">최근 7일</SelectItem>
              <SelectItem value="month">최근 30일</SelectItem>
              <SelectItem value="quarter">최근 3개월</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" data-testid="button-download-report">
            <Download className="h-4 w-4" />
            내보내기
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="총 발송"
          value={formatNumber(totalStats.sent)}
          description="누적 발송 건수"
          icon={Send}
          iconClassName="bg-chart-4/10"
        />
        <StatsCard
          title="발송 성공"
          value={formatNumber(totalStats.success)}
          description={`성공률 ${successRate}%`}
          icon={CheckCircle2}
          iconClassName="bg-success/10"
        />
        <StatsCard
          title="클릭 수"
          value={formatNumber(totalStats.clicks)}
          description={`클릭률 ${clickRate}%`}
          icon={MousePointerClick}
          iconClassName="bg-primary/10"
        />
        <StatsCard
          title="총 광고비"
          value={formatCurrency(totalStats.budget)}
          description="누적 사용 예산"
          icon={TrendingUp}
          iconClassName="bg-chart-5/10"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              성과 요약
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-small">
                <span>발송 성공률</span>
                <span className="font-medium">{successRate}%</span>
              </div>
              <Progress value={successRate} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-small">
                <span>클릭률 (CTR)</span>
                <span className="font-medium">{clickRate}%</span>
              </div>
              <Progress value={parseFloat(clickRate)} className="h-2" />
            </div>
            <div className="pt-4 grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {completedCampaigns.length}
                </p>
                <p className="text-small text-muted-foreground">완료된 캠페인</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(totalStats.budget / (totalStats.clicks || 1))}
                </p>
                <p className="text-small text-muted-foreground">클릭당 비용 (CPC)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>주요 지표 추이</CardTitle>
            <CardDescription>최근 캠페인 성과 분석</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-small">차트 데이터 준비 중</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>캠페인별 성과</CardTitle>
          <CardDescription>각 캠페인의 상세 성과를 확인해보세요</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b last:border-0">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="flex gap-4">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : completedCampaigns.length > 0 ? (
            <div className="space-y-1">
              {completedCampaigns.map((campaign) => {
                const sent = campaign.sentCount || 0;
                const success = campaign.successCount || 0;
                const clicks = campaign.report?.clickCount || 0;
                const rate = sent > 0 ? Math.round((success / sent) * 100) : 0;
                const ctr = success > 0 ? ((clicks / success) * 100).toFixed(1) : "0";

                return (
                  <div
                    key={campaign.id}
                    className="flex flex-col md:flex-row md:items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0 gap-4"
                    data-testid={`row-report-${campaign.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-medium truncate">{campaign.name}</p>
                        <CampaignStatusBadge status={campaign.status} />
                      </div>
                      <p className="text-small text-muted-foreground">
                        {formatDateTime(campaign.createdAt!)} · {campaign.messageType}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center min-w-[80px]">
                        <p className="text-h3 font-bold">{formatNumber(sent)}</p>
                        <p className="text-tiny text-muted-foreground">발송</p>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <p className="text-h3 font-bold text-success">{rate}%</p>
                        <p className="text-tiny text-muted-foreground">성공률</p>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <p className="text-h3 font-bold text-primary">{ctr}%</p>
                        <p className="text-tiny text-muted-foreground">클릭률</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="리포트 데이터가 없어요"
              description="캠페인을 발송하면 여기에서 성과를 확인할 수 있어요"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
