import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  PlusCircle, 
  Search, 
  Megaphone,
  Filter,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatNumber, formatDateTime, getMessageTypeLabel } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { Campaign } from "@shared/schema";

export default function Campaigns() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const filteredCampaigns = campaigns?.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">초안</SelectItem>
                  <SelectItem value="pending">승인 대기</SelectItem>
                  <SelectItem value="approved">승인 완료</SelectItem>
                  <SelectItem value="running">발송 중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="rejected">반려</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b last:border-0">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCampaigns && filteredCampaigns.length > 0 ? (
            <div className="space-y-1">
              {filteredCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0"
                  data-testid={`row-campaign-${campaign.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Link 
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium hover:text-primary truncate"
                        data-testid={`link-campaign-name-${campaign.id}`}
                      >
                        {campaign.name}
                      </Link>
                      <CampaignStatusBadge status={campaign.status} />
                    </div>
                    <div className="flex items-center gap-4 text-small text-muted-foreground">
                      <span>{getMessageTypeLabel(campaign.messageType)}</span>
                      <span>대상 {formatNumber(campaign.targetCount)}명</span>
                      <span>예산 {formatCurrency(campaign.budget)}</span>
                      <span>{formatDateTime(campaign.createdAt!)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {campaign.status === 'running' && (
                      <div className="text-small text-right mr-4">
                        <span className="text-muted-foreground">발송</span>{' '}
                        <span className="font-medium">{formatNumber(campaign.sentCount || 0)}</span>
                        <span className="text-muted-foreground"> / {formatNumber(campaign.targetCount)}</span>
                      </div>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          data-testid={`button-campaign-menu-${campaign.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/campaigns/${campaign.id}`} className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            <span>상세 보기</span>
                          </Link>
                        </DropdownMenuItem>
                        {campaign.status === 'draft' && (
                          <>
                            <DropdownMenuItem asChild>
                              <Link href={`/campaigns/${campaign.id}/edit`} className="flex items-center gap-2">
                                <Pencil className="h-4 w-4" />
                                <span>수정하기</span>
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive flex items-center gap-2">
                              <Trash2 className="h-4 w-4" />
                              <span>삭제하기</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
