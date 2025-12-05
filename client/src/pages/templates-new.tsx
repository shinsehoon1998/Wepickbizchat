import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { 
  ArrowLeft, 
  MessageSquare, 
  Image, 
  Smartphone,
  Eye,
  Send,
  Save,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Template } from "@shared/schema";

const templateFormSchema = z.object({
  name: z.string().min(1, "템플릿 이름을 입력해주세요").max(200),
  messageType: z.enum(["LMS", "MMS", "RCS"], {
    required_error: "메시지 유형을 선택해주세요",
  }),
  title: z.string().max(60, "제목은 60자 이하로 입력해주세요").optional(),
  content: z.string().min(1, "메시지 내용을 입력해주세요").max(2000),
  imageUrl: z.string().url("올바른 이미지 URL을 입력해주세요").optional().or(z.literal("")),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;

function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge variant="default" className="bg-success text-success-foreground gap-1"><CheckCircle className="h-3 w-3" />승인됨</Badge>;
    case "rejected":
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />반려됨</Badge>;
    case "pending":
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />검수 대기</Badge>;
    default:
      return <Badge variant="outline" className="gap-1"><Edit className="h-3 w-3" />작성 중</Badge>;
  }
}

export default function TemplatesNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  
  // Check for view/edit mode from URL
  const [, viewParams] = useRoute("/templates/:id");
  const [, editParams] = useRoute("/templates/:id/edit");
  const rawTemplateId = viewParams?.id || editParams?.id || null;
  // Exclude "new" as a valid template ID
  const templateId = rawTemplateId && rawTemplateId !== "new" ? rawTemplateId : null;
  const isEditMode = !!editParams?.id && editParams?.id !== "new";
  const isViewMode = !!viewParams?.id && viewParams?.id !== "new" && !editParams?.id;

  // Fetch existing template if in view/edit mode
  const { data: existingTemplate, isLoading: templateLoading } = useQuery<Template>({
    queryKey: ["/api/templates", templateId],
    enabled: !!templateId && templateId !== "new",
  });

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      messageType: "LMS",
      title: "",
      content: "",
      imageUrl: "",
    },
  });

  // Populate form with existing data
  useEffect(() => {
    if (existingTemplate) {
      form.reset({
        name: existingTemplate.name,
        messageType: existingTemplate.messageType as "LMS" | "MMS" | "RCS",
        title: existingTemplate.title || "",
        content: existingTemplate.content,
        imageUrl: existingTemplate.imageUrl || "",
      });
      // Auto-show preview in view mode
      if (isViewMode) {
        setShowPreview(true);
      }
    }
  }, [existingTemplate, form, isViewMode]);

  const watchedValues = form.watch();

  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormValues) => {
      const cleanedData = {
        ...data,
        imageUrl: data.imageUrl || undefined,
        title: data.title || undefined,
      };
      return apiRequest("POST", "/api/templates", cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "템플릿 생성 완료",
        description: "새 템플릿이 저장되었어요. 검수를 요청하면 승인 후 사용할 수 있어요.",
      });
      navigate("/templates");
    },
    onError: (error: any) => {
      toast({
        title: "템플릿 생성 실패",
        description: error.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TemplateFormValues) => {
      const cleanedData = {
        ...data,
        imageUrl: data.imageUrl || undefined,
        title: data.title || undefined,
      };
      return apiRequest("PATCH", `/api/templates/${templateId}`, cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId] });
      toast({
        title: "템플릿 수정 완료",
        description: "템플릿이 수정되었어요.",
      });
      navigate("/templates");
    },
    onError: (error: any) => {
      toast({
        title: "템플릿 수정 실패",
        description: error.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TemplateFormValues) => {
    if (isEditMode && templateId) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  // Show loading state when fetching template
  if (templateLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-[500px]" />
          <Skeleton className="h-[500px]" />
        </div>
      </div>
    );
  }

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case "LMS":
        return <MessageSquare className="h-5 w-5" />;
      case "MMS":
        return <Image className="h-5 w-5" />;
      case "RCS":
        return <Smartphone className="h-5 w-5" />;
      default:
        return <MessageSquare className="h-5 w-5" />;
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case "LMS":
        return "LMS (장문 문자)";
      case "MMS":
        return "MMS (이미지 문자)";
      case "RCS":
        return "RCS (리치 메시지)";
      default:
        return type;
    }
  };

  const getMaxContentLength = (type: string) => {
    switch (type) {
      case "LMS":
        return 2000;
      case "MMS":
        return 1000;
      case "RCS":
        return 1000;
      default:
        return 2000;
    }
  };

  const pageTitle = isViewMode 
    ? "템플릿 상세" 
    : isEditMode 
    ? "템플릿 수정" 
    : "새 템플릿 만들기";
  
  const pageDescription = isViewMode
    ? "템플릿 상세 정보를 확인하세요"
    : isEditMode
    ? "템플릿 정보를 수정하세요"
    : "메시지 템플릿을 작성하고 검수를 받아보세요";

  // Check if template can be edited (only draft or rejected)
  const canEdit = existingTemplate && (existingTemplate.status === "draft" || existingTemplate.status === "rejected");
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/templates")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-display font-bold">{pageTitle}</h1>
              {existingTemplate && getStatusBadge(existingTemplate.status)}
            </div>
            <p className="text-muted-foreground mt-1">
              {pageDescription}
            </p>
          </div>
        </div>
        
        {isViewMode && canEdit && (
          <Button
            onClick={() => navigate(`/templates/${templateId}/edit`)}
            className="gap-2"
            data-testid="button-edit-template"
          >
            <Edit className="h-4 w-4" />
            수정하기
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-h2">템플릿 정보</CardTitle>
            <CardDescription>
              메시지 유형을 선택하고 내용을 입력해주세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>템플릿 이름</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="예: 12월 할인 이벤트 안내"
                          data-testid="input-template-name"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      {!isViewMode && (
                        <FormDescription>
                          나중에 쉽게 찾을 수 있도록 명확한 이름을 지어주세요
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="messageType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메시지 유형</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isViewMode}>
                        <FormControl>
                          <SelectTrigger data-testid="select-message-type" disabled={isViewMode}>
                            <SelectValue placeholder="메시지 유형 선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LMS">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              LMS (장문 문자)
                            </div>
                          </SelectItem>
                          <SelectItem value="MMS">
                            <div className="flex items-center gap-2">
                              <Image className="h-4 w-4" />
                              MMS (이미지 문자)
                            </div>
                          </SelectItem>
                          <SelectItem value="RCS">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-4 w-4" />
                              RCS (리치 메시지)
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {!isViewMode && (
                        <FormDescription>
                          LMS: 2,000자, MMS/RCS: 1,000자 제한
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>제목 (선택)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="예: 특별 할인 안내"
                          maxLength={60}
                          data-testid="input-template-title"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      {!isViewMode && (
                        <FormDescription>
                          최대 60자까지 입력 가능해요
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메시지 내용</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="메시지 내용을 입력하세요..."
                          className="min-h-[200px] resize-none"
                          maxLength={getMaxContentLength(watchedValues.messageType)}
                          data-testid="input-template-content"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {field.value.length} / {getMaxContentLength(watchedValues.messageType)}자
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(watchedValues.messageType === "MMS" || watchedValues.messageType === "RCS") && (
                  <FormField
                    control={form.control}
                    name="imageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>이미지 URL (선택)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/image.jpg"
                            data-testid="input-template-image"
                            disabled={isViewMode}
                            {...field}
                          />
                        </FormControl>
                        {!isViewMode && (
                          <FormDescription>
                            MMS/RCS 메시지에 포함할 이미지 URL을 입력해주세요
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {!isViewMode && (
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="gap-2 flex-1"
                      data-testid="button-save-template"
                    >
                      <Save className="h-4 w-4" />
                      {isPending ? "저장 중..." : isEditMode ? "템플릿 수정" : "템플릿 저장"}
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-h2">미리보기</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setShowPreview(!showPreview)}
                data-testid="button-toggle-preview"
              >
                <Eye className="h-4 w-4" />
                {showPreview ? "숨기기" : "미리보기"}
              </Button>
            </div>
            <CardDescription>
              수신자에게 전송될 메시지 형태를 확인해보세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showPreview && (
              <div className="bg-muted rounded-2xl p-4 max-w-[320px] mx-auto">
                <div className="bg-background rounded-xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-small text-muted-foreground">
                    {getMessageTypeIcon(watchedValues.messageType)}
                    <span>{getMessageTypeLabel(watchedValues.messageType)}</span>
                  </div>
                  
                  {watchedValues.title && (
                    <div className="font-semibold text-body">
                      {watchedValues.title}
                    </div>
                  )}
                  
                  {watchedValues.imageUrl && (
                    <div className="rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
                      <img 
                        src={watchedValues.imageUrl} 
                        alt="미리보기" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  
                  <div className="text-small whitespace-pre-wrap">
                    {watchedValues.content || "메시지 내용이 여기에 표시됩니다..."}
                  </div>
                  
                  <div className="text-tiny text-muted-foreground pt-2 border-t">
                    SK코어타겟 비즈챗
                  </div>
                </div>
              </div>
            )}
            
            {!showPreview && (
              <div className="text-center py-12 text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>미리보기 버튼을 눌러 확인해보세요</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isViewMode && (
        <Card className="bg-accent/50 border-accent">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Send className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-medium text-body">검수 안내</h3>
                <p className="text-small text-muted-foreground mt-1">
                  템플릿을 저장한 후 검수 요청을 하면 SK코어타겟 담당자가 내용을 검토해요.
                  승인이 완료되면 이 템플릿으로 캠페인을 만들 수 있어요.
                  검수는 보통 1-2 영업일 내에 완료됩니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isViewMode && existingTemplate?.rejectionReason && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h3 className="font-medium text-body text-destructive">반려 사유</h3>
                <p className="text-small text-muted-foreground mt-1">
                  {existingTemplate.rejectionReason}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
