import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { 
  ArrowLeft, 
  Send, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Users, 
  MessageSquare,
  Target,
  Wallet,
  BarChart3,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Download,
  Loader2,
  TestTube,
  Phone,
  Ban,
  List
} from "lucide-react";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Campaign, Message, Targeting, Report } from "@shared/schema";

interface CampaignDetail extends Campaign {
  message?: Message;
  targeting?: Targeting;
  report?: Report;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  lms: "LMS (장문 문자)",
  mms: "MMS (이미지 포함)",
  rcs: "RCS (리치 메시지)",
};

const GENDER_LABELS: Record<string, string> = {
  all: "전체",
  male: "남성",
  female: "여성",
};

interface BizChatStats {
  success: boolean;
  result?: {
    code?: string;
    data?: {
      sendCnt?: number;
      successCnt?: number;
      failCnt?: number;
      waitCnt?: number;
      readCnt?: number;
      settleCnt?: number;
    };
  };
  error?: string;
}

interface TestResult {
  recvMdn: string;
  customerReserveTime?: string;
  svcStatus?: string;      // 발송 코드
  svcStatus2?: string;     // 수신 코드 (201000=성공)
  sendTime?: number;
}

interface TestResultResponse {
  success: boolean;
  action: string;
  result?: {
    code?: string;
    data?: {
      list?: TestResult[];
    };
  };
  error?: string;
}

// 발송/수신 상태 코드 레이블
const TEST_STATUS_LABELS: Record<string, string> = {
  '001000': '발송 완료',
  '001001': '발송 대기',
  '001002': '발송 중',
  '001003': '발송 실패',
  '201000': '수신 성공',
  '201001': '수신 대기',
  '201002': '수신 실패',
};

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const campaignId = params?.id || null;
  const [bizChatStats, setBizChatStats] = useState<BizChatStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // 테스트 발송 관련 상태
  const [testMdnInput, setTestMdnInput] = useState('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isLoadingTestResults, setIsLoadingTestResults] = useState(false);

  const { data: campaign, isLoading, error } = useQuery<CampaignDetail>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/submit`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "심사 요청 완료",
        description: "캠페인이 심사 대기 상태가 되었어요. 심사는 1-2 영업일이 소요됩니다.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "심사 요청 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/campaigns/${campaignId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "캠페인 삭제 완료",
        description: "캠페인이 삭제되었어요.",
      });
      navigate("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "심사 승인 완료",
        description: "캠페인이 승인되었어요. 이제 발송을 시작할 수 있어요.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "승인 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/start`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "발송 시작",
        description: "캠페인 발송이 시작되었어요! 잠시 후 결과를 확인할 수 있어요.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "발송 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchBizChatStats = async () => {
    if (!campaign?.bizchatCampaignId) {
      toast({
        title: "통계 조회 불가",
        description: "BizChat 캠페인 ID가 없어요. 캠페인을 먼저 발송해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingStats(true);
    try {
      const response = await apiRequest("POST", "/api/bizchat/campaigns", {
        action: "stats",
        campaignId: campaign.id,
      });
      const data = await response.json();
      setBizChatStats(data);
      
      if (data.success) {
        toast({
          title: "통계 조회 완료",
          description: "BizChat 실시간 통계를 가져왔어요.",
        });
      } else {
        toast({
          title: "통계 조회 실패",
          description: data.error || "통계를 가져오는데 실패했어요.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "통계 조회 실패",
        description: "서버와 통신하는 중 오류가 발생했어요.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  // 테스트 발송 함수
  const handleTestSend = async () => {
    if (!campaign?.bizchatCampaignId) {
      toast({
        title: "테스트 발송 불가",
        description: "BizChat에 캠페인이 등록되지 않았어요. 먼저 캠페인을 등록해주세요.",
        variant: "destructive",
      });
      return;
    }

    // MDN 파싱 (쉼표, 줄바꿈, 공백으로 구분)
    const mdnList = testMdnInput
      .split(/[,\n\s]+/)
      .map(mdn => mdn.trim().replace(/[^0-9]/g, ''))
      .filter(mdn => mdn.length >= 10 && mdn.length <= 11);

    if (mdnList.length === 0) {
      toast({
        title: "전화번호를 입력해주세요",
        description: "테스트 발송할 전화번호를 입력해주세요 (예: 01012345678)",
        variant: "destructive",
      });
      return;
    }

    if (mdnList.length > 20) {
      toast({
        title: "전화번호가 너무 많아요",
        description: "테스트 발송은 최대 20개까지만 가능해요",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/bizchat/campaigns", {
        action: "test",
        campaignId: campaign.id,
        mdnList,
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: "테스트 발송 요청 완료",
          description: `${mdnList.length}건의 테스트 메시지 발송이 요청되었어요.`,
        });
        setTestMdnInput('');
        // 결과 조회
        handleFetchTestResults();
      } else {
        toast({
          title: "테스트 발송 실패",
          description: data.error || data.bizchatMessage || "발송에 실패했어요",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "테스트 발송 실패",
        description: "서버와 통신하는 중 오류가 발생했어요.",
        variant: "destructive",
      });
    }
  };

  // 테스트 발송 취소 함수
  const handleTestCancel = async () => {
    if (!campaign?.bizchatCampaignId) {
      toast({
        title: "취소 불가",
        description: "BizChat 캠페인 ID가 없어요.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/bizchat/campaigns", {
        action: "testCancel",
        campaignId: campaign.id,
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: "테스트 발송 취소 완료",
          description: "예약된 테스트 발송이 모두 취소되었어요.",
        });
        handleFetchTestResults();
      } else {
        toast({
          title: "테스트 발송 취소 실패",
          description: data.error || data.bizchatMessage || "취소에 실패했어요",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "취소 실패",
        description: "서버와 통신하는 중 오류가 발생했어요.",
        variant: "destructive",
      });
    }
  };

  // 테스트 결과 조회 함수
  const handleFetchTestResults = async () => {
    if (!campaign?.bizchatCampaignId) {
      toast({
        title: "조회 불가",
        description: "BizChat 캠페인 ID가 없어요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingTestResults(true);
    try {
      const response = await apiRequest("POST", "/api/bizchat/campaigns", {
        action: "testResult",
        campaignId: campaign.id,
      });
      const data: TestResultResponse = await response.json();

      if (data.success && data.result?.data?.list) {
        setTestResults(data.result.data.list);
        toast({
          title: "테스트 결과 조회 완료",
          description: `${data.result.data.list.length}건의 테스트 발송 기록을 가져왔어요.`,
        });
      } else {
        setTestResults([]);
        toast({
          title: "테스트 결과 조회",
          description: data.error || "테스트 발송 기록이 없어요.",
        });
      }
    } catch (err) {
      toast({
        title: "조회 실패",
        description: "서버와 통신하는 중 오류가 발생했어요.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTestResults(false);
    }
  };

  // 테스트 발송 가능 여부 체크 (isTmp=0이고 BizChat에 등록된 캠페인만)
  const canTestSend = campaign?.bizchatCampaignId && campaign?.statusCode !== undefined && campaign.statusCode >= 0;

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={AlertCircle}
          title="캠페인을 찾을 수 없어요"
          description="요청하신 캠페인이 존재하지 않거나 접근 권한이 없어요"
          action={{
            label: "캠페인 목록으로",
            onClick: () => navigate("/campaigns"),
          }}
        />
      </div>
    );
  }

  const canEdit = campaign.status === "draft" || campaign.status === "rejected";
  const canSubmit = campaign.status === "draft" || campaign.status === "rejected";
  const canDelete = campaign.status === "draft";
  const canApprove = campaign.status === "pending";
  const canStart = campaign.status === "approved";
  const budget = parseFloat(campaign.budget as string || "0");
  const sentCount = campaign.sentCount || 0;
  const successCount = campaign.successCount || 0;
  const successRate = sentCount > 0 ? Math.round((successCount / sentCount) * 100) : 0;

  const targeting = campaign.targeting;
  const message = campaign.message;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild data-testid="button-back">
            <Link href="/campaigns">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-display font-bold" data-testid="text-campaign-name">
                {campaign.name}
              </h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className="text-muted-foreground" data-testid="text-campaign-meta">
              {MESSAGE_TYPE_LABELS[campaign.messageType]} · 생성: {formatDateTime(campaign.createdAt!)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" asChild className="gap-2" data-testid="button-edit">
              <Link href={`/campaigns/${campaign.id}/edit`}>
                <Edit className="h-4 w-4" />
                수정
              </Link>
            </Button>
          )}
          {canSubmit && (
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="gap-2"
              data-testid="button-submit"
            >
              <FileCheck className="h-4 w-4" />
              {submitMutation.isPending ? "요청 중..." : "심사 요청"}
            </Button>
          )}
          {canApprove && (
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="gap-2"
              data-testid="button-approve"
            >
              <CheckCircle2 className="h-4 w-4" />
              {approveMutation.isPending ? "승인 중..." : "심사 승인 (시뮬레이션)"}
            </Button>
          )}
          {canStart && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="gap-2" data-testid="button-start">
                  <Send className="h-4 w-4" />
                  발송 시작
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>캠페인을 발송할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{campaign.name}" 캠페인을 {formatNumber(campaign.targetCount)}명에게 발송합니다.
                    예상 비용은 {formatCurrency(campaign.targetCount * parseFloat(campaign.costPerMessage || "50"))}입니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                  >
                    {startMutation.isPending ? "발송 중..." : "발송 시작"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" data-testid="button-delete">
                  <Trash2 className="h-4 w-4" />
                  삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>캠페인을 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    이 작업은 되돌릴 수 없어요. 캠페인 "{campaign.name}"을(를) 영구적으로 삭제합니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    삭제하기
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">예산</p>
                <p className="text-h3 font-bold" data-testid="text-budget">{formatCurrency(budget)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-4/10">
                <Users className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">예상 수신자</p>
                <p className="text-h3 font-bold" data-testid="text-recipients">
                  {formatNumber(campaign.targetCount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Send className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">발송 건수</p>
                <p className="text-h3 font-bold" data-testid="text-sent">{formatNumber(sentCount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-5/10">
                <CheckCircle2 className="h-5 w-5 text-chart-5" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">성공률</p>
                <p className="text-h3 font-bold" data-testid="text-success-rate">{successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList data-testid="tabs-campaign-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">개요</TabsTrigger>
          <TabsTrigger value="message" data-testid="tab-message">메시지</TabsTrigger>
          <TabsTrigger value="targeting" data-testid="tab-targeting">타겟팅</TabsTrigger>
          <TabsTrigger value="test" data-testid="tab-test">테스트</TabsTrigger>
          <TabsTrigger value="report" data-testid="tab-report">성과</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                캠페인 일정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-small text-muted-foreground mb-1">발송 예정일</p>
                  <p className="font-medium" data-testid="text-scheduled-date">
                    {campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : "미정"}
                  </p>
                </div>
                <div>
                  <p className="text-small text-muted-foreground mb-1">발송 완료일</p>
                  <p className="font-medium" data-testid="text-completed-date">
                    {campaign.completedAt ? formatDateTime(campaign.completedAt) : "-"}
                  </p>
                </div>
              </div>
              {campaign.rejectionReason && (
                <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-destructive">반려 사유</span>
                  </div>
                  <p className="text-small" data-testid="text-rejection-reason">{campaign.rejectionReason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-h3">메시지 요약</CardTitle>
              </CardHeader>
              <CardContent>
                {message ? (
                  <div className="space-y-3">
                    {message.title && (
                      <div>
                        <p className="text-small text-muted-foreground mb-1">제목</p>
                        <p className="font-medium">{message.title}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-small text-muted-foreground mb-1">내용</p>
                      <p className="text-small whitespace-pre-wrap line-clamp-4" data-testid="text-message-preview">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-small">메시지가 설정되지 않았어요</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-h3">타겟팅 요약</CardTitle>
              </CardHeader>
              <CardContent>
                {targeting ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {GENDER_LABELS[targeting.gender || "all"]}
                      </Badge>
                      <Badge variant="secondary">
                        {targeting.ageMin || 0}~{targeting.ageMax || 100}세
                      </Badge>
                      {targeting.regions && targeting.regions.length > 0 && (
                        <Badge variant="secondary">
                          {targeting.regions.length}개 지역
                        </Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-small text-muted-foreground mb-1">타겟 수신자</p>
                      <p className="text-h2 font-bold text-primary" data-testid="text-estimated-reach">
                        {formatNumber(campaign.targetCount)}명
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-small">타겟팅이 설정되지 않았어요</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="message">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                메시지 상세
              </CardTitle>
              <CardDescription>
                {MESSAGE_TYPE_LABELS[campaign.messageType]} 형식의 메시지입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {message ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    {message.title && (
                      <div>
                        <p className="text-small text-muted-foreground mb-1">제목</p>
                        <p className="font-medium text-h3">{message.title}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-small text-muted-foreground mb-1">본문</p>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="whitespace-pre-wrap" data-testid="text-message-content">
                          {message.content}
                        </p>
                      </div>
                      <p className="text-tiny text-muted-foreground mt-2">
                        {message.content?.length || 0} / 2000자
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <div className="w-64 h-[480px] bg-gray-900 rounded-[2rem] p-3 shadow-xl">
                      <div className="w-full h-full bg-white dark:bg-gray-100 rounded-[1.5rem] overflow-hidden flex flex-col">
                        <div className="bg-gray-200 dark:bg-gray-300 p-3 text-center text-tiny text-gray-600">
                          메시지 미리보기
                        </div>
                        <div className="flex-1 p-4 overflow-auto">
                          <div className="bg-gray-100 dark:bg-gray-200 rounded-lg p-3 text-small text-gray-800">
                            {message.title && (
                              <p className="font-bold mb-2">{message.title}</p>
                            )}
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            {message.imageUrl && (
                              <img 
                                src={message.imageUrl} 
                                alt="첨부 이미지" 
                                className="mt-3 rounded-lg max-w-full"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="메시지가 없어요"
                  description="캠페인에 메시지가 설정되지 않았어요"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="targeting">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                타겟팅 설정
              </CardTitle>
              <CardDescription>
                SK CoreTarget 기반 정밀 타겟팅
              </CardDescription>
            </CardHeader>
            <CardContent>
              {targeting ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">성별</p>
                      <p className="text-h3 font-bold">{GENDER_LABELS[targeting.gender || "all"]}</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">연령대</p>
                      <p className="text-h3 font-bold">{targeting.ageMin || 0}~{targeting.ageMax || 100}세</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">타겟 수신자</p>
                      <p className="text-h3 font-bold text-primary">
                        {formatNumber(campaign.targetCount)}명
                      </p>
                    </div>
                  </div>

                  {targeting.regions && targeting.regions.length > 0 && (
                    <div>
                      <p className="text-small text-muted-foreground mb-2">지역</p>
                      <div className="flex flex-wrap gap-2">
                        {targeting.regions.map((region, idx) => (
                          <Badge key={idx} variant="outline">{region}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <EmptyState
                  icon={Target}
                  title="타겟팅이 없어요"
                  description="캠페인에 타겟팅이 설정되지 않았어요"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5 text-primary" />
                테스트 발송
              </CardTitle>
              <CardDescription>
                본 발송 전에 최대 20명에게 테스트 메시지를 발송해볼 수 있어요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {canTestSend ? (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="test-mdn-input">테스트 발송 전화번호</Label>
                      <Textarea
                        id="test-mdn-input"
                        placeholder="01012345678, 01087654321&#10;(쉼표, 줄바꿈으로 여러 개 입력 가능, 최대 20개)"
                        value={testMdnInput}
                        onChange={(e) => setTestMdnInput(e.target.value)}
                        className="min-h-[100px]"
                        data-testid="input-test-mdn"
                      />
                      <p className="text-tiny text-muted-foreground">
                        {testMdnInput.split(/[,\n\s]+/).filter(m => m.trim().length >= 10).length} / 20개 입력됨
                      </p>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Button 
                        onClick={handleTestSend}
                        disabled={!testMdnInput.trim()}
                        className="gap-2"
                        data-testid="button-test-send"
                      >
                        <Send className="h-4 w-4" />
                        테스트 발송
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={handleTestCancel}
                        className="gap-2"
                        data-testid="button-test-cancel"
                      >
                        <Ban className="h-4 w-4" />
                        예약 취소
                      </Button>
                      <Button 
                        variant="ghost"
                        onClick={handleFetchTestResults}
                        disabled={isLoadingTestResults}
                        className="gap-2"
                        data-testid="button-test-refresh"
                      >
                        {isLoadingTestResults ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        결과 새로고침
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium flex items-center gap-2">
                        <List className="h-4 w-4" />
                        테스트 발송 결과
                      </h4>
                      <Badge variant="outline">
                        {testResults.length}건
                      </Badge>
                    </div>

                    {testResults.length > 0 ? (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>수신번호</TableHead>
                              <TableHead>발송시간</TableHead>
                              <TableHead>발송상태</TableHead>
                              <TableHead>수신상태</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {testResults.map((result, idx) => (
                              <TableRow key={idx} data-testid={`row-test-result-${idx}`}>
                                <TableCell className="font-mono">
                                  {result.recvMdn.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                                </TableCell>
                                <TableCell className="text-small text-muted-foreground">
                                  {result.customerReserveTime 
                                    ? `${result.customerReserveTime.slice(0,4)}-${result.customerReserveTime.slice(4,6)}-${result.customerReserveTime.slice(6,8)} ${result.customerReserveTime.slice(8,10)}:${result.customerReserveTime.slice(10,12)}`
                                    : '-'}
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={result.svcStatus === '001000' ? 'default' : 'secondary'}
                                    data-testid={`badge-send-status-${idx}`}
                                  >
                                    {TEST_STATUS_LABELS[result.svcStatus || ''] || result.svcStatus || '대기'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={result.svcStatus2 === '201000' ? 'default' : 'secondary'}
                                    className={result.svcStatus2 === '201000' ? 'bg-success text-success-foreground' : ''}
                                    data-testid={`badge-recv-status-${idx}`}
                                  >
                                    {TEST_STATUS_LABELS[result.svcStatus2 || ''] || result.svcStatus2 || '대기'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <EmptyState
                        icon={TestTube}
                        title="테스트 발송 기록이 없어요"
                        description="테스트 발송을 하면 여기에서 결과를 확인할 수 있어요"
                      />
                    )}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={AlertCircle}
                  title="테스트 발송을 할 수 없어요"
                  description={
                    !campaign?.bizchatCampaignId 
                      ? "BizChat에 캠페인을 먼저 등록해주세요" 
                      : "캠페인 상태가 테스트 발송을 허용하지 않아요"
                  }
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          {campaign.bizchatCampaignId && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-h3">
                    <Send className="h-5 w-5 text-primary" />
                    BizChat 실시간 통계
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchBizChatStats}
                    disabled={isLoadingStats}
                    className="gap-2"
                    data-testid="button-fetch-bizchat-stats"
                  >
                    {isLoadingStats ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    통계 조회
                  </Button>
                </div>
                <CardDescription>
                  BizChat 캠페인 ID: {campaign.bizchatCampaignId}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bizChatStats?.success && bizChatStats.result?.data ? (
                  <div className="grid gap-3 md:grid-cols-6">
                    <div className="text-center p-3 bg-background rounded-lg border">
                      <p className="text-2xl font-bold text-primary">
                        {formatNumber(bizChatStats.result.data.sendCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">발송</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg border">
                      <p className="text-2xl font-bold text-success">
                        {formatNumber(bizChatStats.result.data.successCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">성공</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg border">
                      <p className="text-2xl font-bold text-destructive">
                        {formatNumber(bizChatStats.result.data.failCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">실패</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg border">
                      <p className="text-2xl font-bold text-warning">
                        {formatNumber(bizChatStats.result.data.waitCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">대기</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg border">
                      <p className="text-2xl font-bold text-chart-5">
                        {formatNumber(bizChatStats.result.data.readCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">읽음</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg border">
                      <p className="text-2xl font-bold text-chart-4">
                        {formatNumber(bizChatStats.result.data.settleCnt ?? 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">정산</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-small">
                      "통계 조회" 버튼을 눌러 BizChat 실시간 통계를 확인하세요
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                캠페인 성과
              </CardTitle>
              <CardDescription>
                발송 결과 및 성과 분석
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sentCount > 0 ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-5">
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-total-sent">
                      <p className="text-3xl font-bold text-primary">{formatNumber(sentCount)}</p>
                      <p className="text-small text-muted-foreground">총 발송</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-delivered">
                      <p className="text-3xl font-bold text-success">{formatNumber(campaign.report?.deliveredCount || 0)}</p>
                      <p className="text-small text-muted-foreground">수신 완료</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-failed">
                      <p className="text-3xl font-bold text-destructive">{formatNumber(campaign.report?.failedCount || 0)}</p>
                      <p className="text-small text-muted-foreground">실패</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-clicks">
                      <p className="text-3xl font-bold text-chart-5">{formatNumber(campaign.report?.clickCount || 0)}</p>
                      <p className="text-small text-muted-foreground">클릭</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-optout">
                      <p className="text-3xl font-bold text-muted-foreground">{formatNumber(campaign.report?.optOutCount || 0)}</p>
                      <p className="text-small text-muted-foreground">수신거부</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-small mb-2">
                        <span>수신 완료율</span>
                        <span className="font-medium">
                          {sentCount > 0 ? (((campaign.report?.deliveredCount || 0) / sentCount) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <Progress 
                        value={sentCount > 0 ? ((campaign.report?.deliveredCount || 0) / sentCount) * 100 : 0} 
                        className="h-2" 
                        data-testid="progress-delivery-rate"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-small mb-2">
                        <span>발송 성공률</span>
                        <span className="font-medium">{successRate}%</span>
                      </div>
                      <Progress value={successRate} className="h-2" data-testid="progress-success-rate" />
                    </div>
                    {campaign.report?.clickCount && successCount > 0 && (
                      <div>
                        <div className="flex justify-between text-small mb-2">
                          <span>클릭률 (CTR)</span>
                          <span className="font-medium">
                            {((campaign.report.clickCount / successCount) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress 
                          value={(campaign.report.clickCount / successCount) * 100} 
                          className="h-2" 
                          data-testid="progress-ctr"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="아직 성과 데이터가 없어요"
                  description="캠페인이 발송되면 여기에서 성과를 확인할 수 있어요"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
