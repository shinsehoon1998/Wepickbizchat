import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  PlusCircle, 
  Search, 
  Megaphone,
  Filter,
  MoreHorizontal,
  Eye,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  AlertTriangle
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

function getStatusText(statusCode: number | null): string {
  switch (statusCode) {
    case CAMPAIGN_STATUS.DRAFT:
      return "초안";
    case CAMPAIGN_STATUS.APPROVAL_REQUESTED:
      return "검수 중";
    case CAMPAIGN_STATUS.APPROVED:
      return "발송 대기";
    case CAMPAIGN_STATUS.REJECTED:
      return "반려됨";
    case CAMPAIGN_STATUS.SEND_PREPARATION:
      return "발송 준비중";
    case CAMPAIGN_STATUS.IN_PROGRESS:
      return "발송 중";
    case CAMPAIGN_STATUS.COMPLETED:
      return "처리완료";
    case CAMPAIGN_STATUS.CANCELLED:
      return "취소됨";
    default:
      return "알 수 없음";
  }
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

export default function Campaigns() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const { toast } = useToast();

  const { data: campaigns, isLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "캠페인 삭제 완료",
        description: "캠페인이 성공적으로 삭제되었어요.",
      });
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "삭제 실패",
        description: error.message || "캠페인 삭제에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete.id);
    }
  };

  const filteredCampaigns = campaigns?.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.statusCode?.toString() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">캠페인 목록</h1>
          <p className="text-muted-foreground mt-1">
            생성한 모든 캠페인을 관리해요
          </p>
        </div>
        <Button asChild className="gap-2 w-fit" data-testid="button-new-campaign-list">
          <Link href="/campaigns/new">
            <PlusCircle className="h-4 w-4" />
            캠페인 만들기
          </Link>
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
                data-testid="input-search-campaigns"
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
                  <SelectItem value={CAMPAIGN_STATUS.DRAFT.toString()}>초안</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.APPROVAL_REQUESTED.toString()}>검수 중</SelectItem>
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
          ) : filteredCampaigns && filteredCampaigns.length > 0 ? (
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
                  {filteredCampaigns.map((campaign) => {
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
                        data-testid={`row-campaign-${campaign.id}`}
                      >
                        <div className="col-span-2">
                          <Link 
                            href={`/campaigns/${campaign.id}`}
                            className="text-small font-medium hover:text-primary"
                            data-testid={`link-campaign-date-${campaign.id}`}
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
                                data-testid={`link-campaign-name-${campaign.id}`}
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
                                발송중 {formatNumber(pendingCount)}
                              </span>
                            </div>
                            <Progress 
                              value={progressPercent} 
                              className="h-1.5"
                            />
                          </div>
                        </div>

                        <div className="col-span-2 flex items-center justify-between">
                          <span className="text-small text-muted-foreground">
                            ({getRelativeTime(campaign.updatedAt || campaign.createdAt)}) 메시지를 발송했습니다
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`button-campaign-menu-${campaign.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild data-testid={`menu-item-view-${campaign.id}`}>
                                <Link href={`/campaigns/${campaign.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" />
                                  <span>상세 보기</span>
                                </Link>
                              </DropdownMenuItem>
                              {campaign.statusCode === CAMPAIGN_STATUS.DRAFT && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive flex items-center gap-2"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleDeleteClick(campaign);
                                    }}
                                    data-testid={`menu-item-delete-${campaign.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span>삭제하기</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                icon={Megaphone}
                title={searchQuery || statusFilter !== 'all' ? "검색 결과가 없어요" : "아직 캠페인이 없어요"}
                description={searchQuery || statusFilter !== 'all' 
                  ? "다른 검색어나 필터를 사용해보세요" 
                  : "첫 캠페인을 만들어 고객에게 광고를 보내보세요"
                }
                action={!searchQuery && statusFilter === 'all' ? {
                  label: "캠페인 만들기",
                  onClick: () => window.location.href = '/campaigns/new',
                } : undefined}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>캠페인을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{campaignToDelete?.name}" 캠페인이 영구적으로 삭제돼요. 이 작업은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
