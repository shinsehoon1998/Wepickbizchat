import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Search, 
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  AlertTriangle,
  MessageSquare,
  Download,
} from "lucide-react";
import { useState } from "react";
import { formatNumber, formatDateTime, getMessageTypeLabel, CAMPAIGN_STATUS } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "@shared/schema";

function getRelativeTime(date: Date | string | null): string {
  if (!date) return "-";
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 30) return `${diffDays}일 전`;
  return formatDateTime(date);
}

function getStatusIcon(statusCode: number | null) {
  switch (statusCode) {
    case CAMPAIGN_STATUS.DRAFT:
      return Clock;
    case CAMPAIGN_STATUS.APPROVAL_REQUESTED:
      return Clock;
    case CAMPAIGN_STATUS.APPROVED:
      return CheckCircle2;
    case CAMPAIGN_STATUS.REJECTED:
      return XCircle;
    case CAMPAIGN_STATUS.SEND_PREPARATION:
      return RefreshCw;
    case CAMPAIGN_STATUS.IN_PROGRESS:
      return Send;
    case CAMPAIGN_STATUS.COMPLETED:
      return CheckCircle2;
    case CAMPAIGN_STATUS.CANCELLED:
      return XCircle;
    default:
      return AlertTriangle;
  }
}

export default function SendHistory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: campaigns, isLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const sentCampaigns = campaigns?.filter((campaign) => {
    const isSent = campaign.statusCode && campaign.statusCode >= CAMPAIGN_STATUS.APPROVAL_REQUESTED;
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.statusCode?.toString() === statusFilter;
    return isSent && matchesSearch && matchesStatus;
  });

  const handleExport = async () => {
    try {
      const response = await fetch('/api/reports/export', {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `send-history-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "내보내기 완료",
        description: "발송 내역이 CSV 파일로 저장되었어요.",
      });
    } catch (error) {
      toast({
        title: "내보내기 실패",
        description: "발송 내역을 내보내는데 실패했어요.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">발송 내역</h1>
          <p className="text-muted-foreground mt-1">
            캠페인 발송 현황을 확인해요
          </p>
        </div>
        <Button 
          variant="outline" 
          className="gap-2 w-fit" 
          onClick={handleExport}
          data-testid="button-export"
        >
          <Download className="h-4 w-4" />
          CSV 내보내기
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="캠페인 이름으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-history"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => refetch()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.APPROVAL_REQUESTED.toString()}>승인 대기</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.APPROVED.toString()}>발송 대기</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.SEND_PREPARATION.toString()}>발송 준비중</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.IN_PROGRESS.toString()}>발송 중</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.COMPLETED.toString()}>완료</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.REJECTED.toString()}>반려</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.CANCELLED.toString()}>취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="grid grid-cols-12 gap-4 p-4 items-center">
                  <div className="col-span-2">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="col-span-3">
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <div className="col-span-3">
                    <Skeleton className="h-4 w-full" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : sentCampaigns && sentCampaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-small font-medium text-muted-foreground border-b">
                  <div className="col-span-2">생성일</div>
                  <div className="col-span-3">상태</div>
                  <div className="col-span-2">타입</div>
                  <div className="col-span-3">현황</div>
                  <div className="col-span-2">최근 업데이트</div>
                </div>
                <div className="divide-y">
                  {sentCampaigns.map((campaign) => {
                    const StatusIcon = getStatusIcon(campaign.statusCode);
                    const totalCount = campaign.targetCount || 0;
                    const sentCount = campaign.sentCount || 0;
                    const successCount = campaign.successCount || 0;
                    const failedCount = sentCount - successCount;
                    const pendingCount = totalCount - sentCount;
                    const progressPercent = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;

                    return (
                      <div
                        key={campaign.id}
                        className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover-elevate cursor-pointer group"
                        data-testid={`row-history-${campaign.id}`}
                      >
                        <div className="col-span-2">
                          <Link 
                            href={`/campaigns/${campaign.id}`}
                            className="text-small font-medium hover:text-primary"
                            data-testid={`link-history-date-${campaign.id}`}
                          >
                            {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            }) : '-'}
                          </Link>
                        </div>

                        <div className="col-span-3">
                          <div className="flex items-center gap-2">
                            <StatusIcon className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-small text-muted-foreground">
                                  총 {formatNumber(totalCount)}건
                                </span>
                                <CampaignStatusBadge statusCode={campaign.statusCode} />
                              </div>
                              <Link 
                                href={`/campaigns/${campaign.id}`}
                                className="text-small font-medium truncate block hover:text-primary"
                                data-testid={`link-history-name-${campaign.id}`}
                              >
                                {campaign.name}
                              </Link>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-tiny">
                              API
                            </Badge>
                            <Badge variant="secondary" className="text-tiny">
                              {getMessageTypeLabel(campaign.messageType)}
                            </Badge>
                          </div>
                        </div>

                        <div className="col-span-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-3 text-tiny">
                              <span className="text-destructive">
                                실패 {formatNumber(failedCount)}
                              </span>
                              <span className="text-success">
                                성공 {formatNumber(successCount)}
                              </span>
                              <span className="text-muted-foreground">
                                대기 {formatNumber(pendingCount)}
                              </span>
                            </div>
                            <Progress 
                              value={progressPercent} 
                              className="h-1.5"
                            />
                          </div>
                        </div>

                        <div className="col-span-2">
                          <span className="text-small text-muted-foreground">
                            {getRelativeTime(campaign.updatedAt || campaign.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={MessageSquare}
                title={searchQuery || statusFilter !== 'all' ? "검색 결과가 없어요" : "아직 발송 내역이 없어요"}
                description={searchQuery || statusFilter !== 'all' 
                  ? "다른 검색어나 필터를 사용해보세요" 
                  : "캠페인을 발송하면 여기에 발송 내역이 표시돼요"
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
