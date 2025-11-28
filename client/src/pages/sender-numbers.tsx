import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Phone,
  Plus,
  Search,
  Edit2,
  MoreVertical,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  FileText,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { UserSenderNumber } from "@shared/schema";

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

function getRelativeTime(date: Date | string | null): string {
  if (!date) return "";
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);

  if (diffDays < 1) return "오늘";
  if (diffDays < 30) return `${diffDays}일 전`;
  if (diffMonths < 12) return `${diffMonths}달 전`;
  return `${Math.floor(diffMonths / 12)}년 전`;
}

function getExpiryInfo(expiryDate: Date | string | null): { text: string; isExpired: boolean; daysLeft: number } {
  if (!expiryDate) return { text: "-", isExpired: false, daysLeft: 0 };
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}일 전 만료`, isExpired: true, daysLeft: diffDays };
  } else if (diffDays === 0) {
    return { text: "오늘 만료", isExpired: false, daysLeft: 0 };
  } else if (diffDays < 30) {
    return { text: `${diffDays}일 후 만료`, isExpired: false, daysLeft: diffDays };
  } else {
    const months = Math.floor(diffDays / 30);
    return { text: `${months}달 후 만료`, isExpired: false, daysLeft: diffDays };
  }
}

export default function SenderNumbers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [editAliasDialogOpen, setEditAliasDialogOpen] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<UserSenderNumber | null>(null);
  
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isCompanyOwned, setIsCompanyOwned] = useState<boolean | null>(null);
  const [verificationMethod, setVerificationMethod] = useState<"sms" | "document" | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [newAlias, setNewAlias] = useState("");
  
  const { toast } = useToast();

  const { data: senderNumbers, isLoading } = useQuery<UserSenderNumber[]>({
    queryKey: ["/api/sender-numbers"],
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; isCompanyOwned: boolean; verificationMethod: string }) => {
      const response = await apiRequest("POST", "/api/sender-numbers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-numbers"] });
      setRegisterDialogOpen(false);
      resetForm();
      toast({
        title: "발신번호 등록 완료",
        description: "발신번호가 성공적으로 등록되었어요.",
      });
    },
    onError: () => {
      toast({
        title: "등록 실패",
        description: "발신번호 등록에 실패했어요. 다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const verifySmsMutation = useMutation({
    mutationFn: async (data: { id: string; code: string }) => {
      const response = await apiRequest("POST", `/api/sender-numbers/${data.id}/verify-sms`, { code: data.code });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-numbers"] });
      setVerifyDialogOpen(false);
      setSelectedNumber(null);
      setVerificationCode("");
      toast({
        title: "인증 완료",
        description: "발신번호 인증이 완료되었어요.",
      });
    },
    onError: () => {
      toast({
        title: "인증 실패",
        description: "인증 코드가 올바르지 않아요.",
        variant: "destructive",
      });
    },
  });

  const updateAliasMutation = useMutation({
    mutationFn: async (data: { id: string; alias: string }) => {
      const response = await apiRequest("PATCH", `/api/sender-numbers/${data.id}`, { alias: data.alias });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-numbers"] });
      setEditAliasDialogOpen(false);
      setSelectedNumber(null);
      setNewAlias("");
      toast({
        title: "별칭 수정 완료",
        description: "발신번호 별칭이 수정되었어요.",
      });
    },
    onError: () => {
      toast({
        title: "수정 실패",
        description: "별칭 수정에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const renewExpiryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/sender-numbers/${id}/renew`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-numbers"] });
      toast({
        title: "만료일 갱신 완료",
        description: "발신번호 인증이 갱신되었어요.",
      });
    },
    onError: () => {
      toast({
        title: "갱신 실패",
        description: "만료일 갱신에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/sender-numbers/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-numbers"] });
      toast({
        title: "삭제 완료",
        description: "발신번호가 삭제되었어요.",
      });
    },
    onError: () => {
      toast({
        title: "삭제 실패",
        description: "발신번호 삭제에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setPhoneNumber("");
    setIsCompanyOwned(null);
    setVerificationMethod(null);
    setVerificationCode("");
  };

  const handleRegister = () => {
    if (!phoneNumber || isCompanyOwned === null || !verificationMethod) return;
    
    registerMutation.mutate({
      phoneNumber: phoneNumber.replace(/\D/g, ''),
      isCompanyOwned,
      verificationMethod,
    });
  };

  const handleEditAlias = (number: UserSenderNumber) => {
    setSelectedNumber(number);
    setNewAlias(number.alias || "");
    setEditAliasDialogOpen(true);
  };

  const filteredNumbers = senderNumbers?.filter((num) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      num.phoneNumber.includes(searchQuery) ||
      (num.alias && num.alias.toLowerCase().includes(searchLower))
    );
  });

  const activeCount = senderNumbers?.filter((num) => num.status === "active").length || 0;
  const maxCount = 5;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">발신번호</h1>
          <p className="text-muted-foreground mt-1">
            광고 메시지 발송에 사용할 발신번호를 등록하고 관리해요
          </p>
        </div>
        <Button
          onClick={() => setRegisterDialogOpen(true)}
          className="gap-2 w-fit"
          data-testid="button-register-sender"
        >
          <Plus className="h-4 w-4" />
          새 발신번호 등록
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                현재 {activeCount}개 / 최대 {maxCount}개
              </Badge>
            </div>
            <div className="relative flex-1 max-w-md ml-auto">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="발신번호 / 별칭 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-sender"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-12 gap-4 p-4 items-center">
                  <div className="col-span-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-20 mt-1" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="col-span-3">
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredNumbers && filteredNumbers.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-small font-medium text-muted-foreground border-b">
                  <div className="col-span-3">발신번호</div>
                  <div className="col-span-2">상태</div>
                  <div className="col-span-2">번호인증</div>
                  <div className="col-span-2">만료일</div>
                  <div className="col-span-3">최근 이력</div>
                </div>
                <div className="divide-y">
                  {filteredNumbers.map((number) => {
                    const expiryInfo = getExpiryInfo(number.expiryDate);
                    const isExpired = number.status === "expired" || expiryInfo.isExpired;
                    const isPending = number.status === "pending";
                    const isActive = number.status === "active" && !expiryInfo.isExpired;

                    return (
                      <div
                        key={number.id}
                        className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover-elevate group"
                        data-testid={`row-sender-${number.id}`}
                      >
                        <div className="col-span-3">
                          <div className="font-medium text-body">
                            {formatPhoneNumber(number.phoneNumber)}
                          </div>
                          <div className="flex items-center gap-1 text-tiny text-muted-foreground">
                            <span>{number.alias || "(별칭 없음)"}</span>
                            <button
                              onClick={() => handleEditAlias(number)}
                              className="hover:text-primary"
                              data-testid={`button-edit-alias-${number.id}`}
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div className="col-span-2">
                          {isExpired ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              만료됨
                            </Badge>
                          ) : isPending ? (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              인증대기
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                              <CheckCircle2 className="h-3 w-3" />
                              활성화
                            </Badge>
                          )}
                        </div>

                        <div className="col-span-2">
                          {isPending ? (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-tiny"
                              onClick={() => {
                                setSelectedNumber(number);
                                setVerifyDialogOpen(true);
                              }}
                              data-testid={`button-verify-${number.id}`}
                            >
                              인증하기
                            </Button>
                          ) : isExpired ? (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-tiny"
                              onClick={() => renewExpiryMutation.mutate(number.id)}
                              disabled={renewExpiryMutation.isPending}
                              data-testid={`button-renew-${number.id}`}
                            >
                              만료일갱신
                            </Button>
                          ) : (
                            <span className="text-small text-muted-foreground">완료</span>
                          )}
                        </div>

                        <div className="col-span-2">
                          <div className={cn(
                            "text-small",
                            expiryInfo.isExpired && "text-destructive"
                          )}>
                            {number.expiryDate ? new Date(number.expiryDate).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            }) : "-"}
                          </div>
                          <div className="text-tiny text-muted-foreground">
                            {expiryInfo.text}
                          </div>
                        </div>

                        <div className="col-span-3 flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-small text-muted-foreground truncate">
                              {number.lastActivityNote || "-"}
                            </div>
                            {number.verifiedAt && (
                              <div className="text-tiny text-muted-foreground">
                                [인증 만료날짜]: {new Date(number.verifiedAt).toLocaleString('ko-KR')}
                              </div>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                data-testid={`button-menu-${number.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleEditAlias(number)}
                                data-testid={`menu-item-edit-${number.id}`}
                              >
                                <Edit2 className="h-4 w-4 mr-2" />
                                별칭 수정
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => deleteMutation.mutate(number.id)}
                                className="text-destructive"
                                data-testid={`menu-item-delete-${number.id}`}
                              >
                                삭제
                              </DropdownMenuItem>
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
                icon={Phone}
                title={searchQuery ? "검색 결과가 없어요" : "등록된 발신번호가 없어요"}
                description={searchQuery
                  ? "다른 검색어를 사용해보세요"
                  : "새 발신번호를 등록하면 광고 메시지 발송에 사용할 수 있어요"
                }
              />
              {!searchQuery && (
                <div className="flex justify-center mt-4">
                  <Button onClick={() => setRegisterDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    새 발신번호 등록
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>발신번호 등록</DialogTitle>
            <DialogDescription>
              광고 메시지 발송에 사용할 발신번호를 등록해요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-h3 font-semibold">발신번호 입력</Label>
              <Input
                placeholder="010-0000-0000"
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length <= 11) {
                    setPhoneNumber(formatPhoneNumber(value));
                  }
                }}
                data-testid="input-phone-number"
              />
            </div>

            {phoneNumber.replace(/\D/g, '').length >= 10 && (
              <>
                <div className="space-y-3">
                  <Label className="text-h3 font-semibold">
                    "{formatPhoneNumber(phoneNumber)}" 발신번호 입니까? (재직원 포함)
                  </Label>
                  <p className="text-tiny text-muted-foreground">
                    *자회사, 계열사 등 사업자등록번호가 다른 사업자는 타사로 취급
                  </p>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant={isCompanyOwned === true ? "default" : "outline"}
                      className={cn("flex-1", isCompanyOwned === true && "gap-2")}
                      onClick={() => setIsCompanyOwned(true)}
                      data-testid="button-company-owned-yes"
                    >
                      {isCompanyOwned === true && <CheckCircle2 className="h-4 w-4" />}
                      예 (선택됨)
                    </Button>
                    <Button
                      type="button"
                      variant={isCompanyOwned === false ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setIsCompanyOwned(false)}
                      data-testid="button-company-owned-no"
                    >
                      아니오
                    </Button>
                  </div>
                </div>

                {isCompanyOwned !== null && (
                  <div className="space-y-3">
                    <Label className="text-h3 font-semibold">인증 방법 선택</Label>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant={verificationMethod === "sms" ? "default" : "outline"}
                        className="flex-1 h-auto py-4 flex-col gap-2"
                        onClick={() => setVerificationMethod("sms")}
                        data-testid="button-verify-sms"
                      >
                        <MessageSquare className="h-5 w-5" />
                        <span>문자본인인증</span>
                      </Button>
                      <Button
                        type="button"
                        variant={verificationMethod === "document" ? "default" : "outline"}
                        className="flex-1 h-auto py-4 flex-col gap-2"
                        onClick={() => setVerificationMethod("document")}
                        data-testid="button-verify-document"
                      >
                        <FileText className="h-5 w-5" />
                        <span>증빙서류제출</span>
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRegisterDialogOpen(false);
                resetForm();
              }}
              data-testid="button-cancel-register"
            >
              닫기
            </Button>
            <Button
              onClick={handleRegister}
              disabled={
                registerMutation.isPending ||
                !phoneNumber ||
                isCompanyOwned === null ||
                !verificationMethod
              }
              data-testid="button-submit-register"
            >
              {registerMutation.isPending ? "등록 중..." : "등록하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editAliasDialogOpen} onOpenChange={setEditAliasDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>별칭 수정</DialogTitle>
            <DialogDescription>
              {selectedNumber && formatPhoneNumber(selectedNumber.phoneNumber)}의 별칭을 수정해요
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="별칭을 입력하세요"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              data-testid="input-alias"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditAliasDialogOpen(false);
                setSelectedNumber(null);
                setNewAlias("");
              }}
              data-testid="button-cancel-alias"
            >
              취소
            </Button>
            <Button
              onClick={() => {
                if (selectedNumber) {
                  updateAliasMutation.mutate({ id: selectedNumber.id, alias: newAlias });
                }
              }}
              disabled={updateAliasMutation.isPending}
              data-testid="button-save-alias"
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>SMS 인증</DialogTitle>
            <DialogDescription>
              {selectedNumber && formatPhoneNumber(selectedNumber.phoneNumber)}로 발송된 인증 코드를 입력해주세요
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="text-sm text-muted-foreground">
              해당 번호로 인증 코드가 발송되었어요. 문자를 확인하고 아래에 코드를 입력해주세요.
            </div>
            <Input
              placeholder="인증 코드 입력"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={10}
              data-testid="input-verification-code"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVerifyDialogOpen(false);
                setSelectedNumber(null);
                setVerificationCode("");
              }}
              data-testid="button-cancel-verify"
            >
              취소
            </Button>
            <Button
              onClick={() => {
                if (selectedNumber && verificationCode) {
                  verifySmsMutation.mutate({ id: selectedNumber.id, code: verificationCode });
                }
              }}
              disabled={verifySmsMutation.isPending || !verificationCode}
              data-testid="button-submit-verify"
            >
              {verifySmsMutation.isPending ? "인증 중..." : "인증하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
