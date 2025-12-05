import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  FilePlus, 
  Search, 
  FileText,
  Filter,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  BarChart3,
  Mail,
} from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatNumber, getMessageTypeLabel } from "@/lib/authUtils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Template } from "@shared/schema";

interface TemplateWithStats extends Template {
  sendHistory: {
    campaignCount: number;
    totalSent: number;
    totalDelivered: number;
    lastSentAt: string | null;
  };
}


function TemplateStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
    draft: { label: "초안", variant: "secondary", icon: FileText },
    pending: { label: "검수 중", variant: "outline", icon: Clock },
    approved: { label: "승인됨", variant: "default", icon: CheckCircle },
    rejected: { label: "반려", variant: "destructive", icon: XCircle },
  };

  const { label, variant, icon: Icon } = config[status] || config.draft;

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export default function Templates() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: templates, isLoading } = useQuery<TemplateWithStats[]>({
    queryKey: ["/api/templates"],
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/templates/${id}`, { action: "submit" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "검수 요청 완료",
        description: "템플릿이 검수 대기 상태로 변경되었어요.",
      });
    },
    onError: () => {
      toast({
        title: "검수 요청 실패",
        description: "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/templates/${id}`, { action: "approve" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "템플릿 승인 완료",
        description: "이제 이 템플릿으로 캠페인을 만들 수 있어요!",
      });
    },
    onError: () => {
      toast({
        title: "승인 처리 실패",
        description: "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "템플릿 삭제 완료",
        description: "템플릿이 삭제되었어요.",
      });
    },
    onError: () => {
      toast({
        title: "삭제 실패",
        description: "검수 중인 템플릿은 삭제할 수 없어요.",
        variant: "destructive",
      });
    },
  });

  const filteredTemplates = templates?.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || template.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmitForReview = (id: string) => {
    submitMutation.mutate(id);
  };

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (confirm("정말 이 템플릿을 삭제할까요?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">템플릿 목록</h1>
          <p className="text-muted-foreground mt-1">
            메시지 템플릿을 관리하고 검수 상태를 확인해요
          </p>
        </div>
        <Button asChild className="gap-2 w-fit" data-testid="button-new-template">
          <Link href="/templates/new">
            <FilePlus className="h-4 w-4" />
            템플릿 만들기
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="템플릿 이름으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-templates"
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
                  <SelectItem value="pending">검수 중</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
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
          ) : filteredTemplates && filteredTemplates.length > 0 ? (
            <div className="space-y-1">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0"
                  data-testid={`row-template-${template.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-medium truncate" data-testid={`text-template-name-${template.id}`}>
                        {template.name}
                      </span>
                      <Badge variant="outline" className="text-tiny shrink-0">
                        {getMessageTypeLabel(template.messageType)}
                      </Badge>
                      <span className="text-tiny text-muted-foreground font-mono" data-testid={`text-template-id-${template.id}`}>
                        ID: {template.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-small text-muted-foreground">
                      <span className="truncate max-w-[200px]">{template.content.substring(0, 50)}...</span>
                      <span className="shrink-0">{template.createdAt ? formatDateTime(template.createdAt) : '-'}</span>
                    </div>
                    {template.status === "rejected" && template.rejectionReason && (
                      <div className="mt-2 text-small text-destructive">
                        반려 사유: {template.rejectionReason}
                      </div>
                    )}
                    
                    {/* Send History Stats */}
                    {template.sendHistory && template.sendHistory.campaignCount > 0 && (
                      <div className="mt-2 flex items-center gap-4 text-small" data-testid={`send-history-${template.id}`}>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>캠페인 {formatNumber(template.sendHistory.campaignCount)}건</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-primary">
                          <Mail className="h-3.5 w-3.5" />
                          <span>발송 {formatNumber(template.sendHistory.totalSent)}건</span>
                        </div>
                        {template.sendHistory.lastSentAt && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>최근 {formatDateTime(template.sendHistory.lastSentAt)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <TemplateStatusBadge status={template.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-template-menu-${template.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          onClick={() => setLocation(`/templates/${template.id}`)}
                          data-testid={`button-view-template-${template.id}`}
                        >
                          <Eye className="h-4 w-4" />
                          상세 보기
                        </DropdownMenuItem>
                        {(template.status === "draft" || template.status === "rejected") && (
                          <>
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              onClick={() => setLocation(`/templates/${template.id}/edit`)}
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                              수정하기
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              onClick={() => handleSubmitForReview(template.id)}
                              data-testid={`button-submit-template-${template.id}`}
                            >
                              <Send className="h-4 w-4" />
                              검수 요청
                            </DropdownMenuItem>
                          </>
                        )}
                        {template.status === "pending" && (
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-primary"
                            onClick={() => handleApprove(template.id)}
                            data-testid={`button-approve-template-${template.id}`}
                          >
                            <CheckCircle className="h-4 w-4" />
                            승인 (시뮬레이션)
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {template.status !== "pending" && (
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                            onClick={() => handleDelete(template.id)}
                            data-testid={`button-delete-template-${template.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            삭제하기
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="템플릿이 없어요"
              description="메시지 템플릿을 만들고 검수를 받아보세요."
              action={{
                label: "첫 템플릿 만들기",
                onClick: () => setLocation("/templates/new"),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
