import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { 
  ArrowLeft, 
  MessageSquare, 
  Image as ImageIcon, 
  Smartphone,
  Eye,
  Send,
  Save,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  Upload,
  X,
  Loader2,
  Info,
  AlertTriangle,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Template } from "@shared/schema";

const templateFormSchema = z.object({
  name: z.string().min(1, "템플릿 이름을 입력해주세요").max(200),
  messageType: z.enum(["LMS", "MMS", "RCS"], {
    required_error: "메시지 유형을 선택해주세요",
  }),
  rcsType: z.number().optional(),
  title: z.string().max(30, "제목은 30자 이하로 입력해주세요").optional(),
  content: z.string().min(1, "메시지 내용을 입력해주세요").max(2000),
  imageUrl: z.string().optional().or(z.literal("")),
  imageFileId: z.string().optional().or(z.literal("")),
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

const RCS_TYPES = [
  { value: 0, label: "스탠다드", maxChars: 1100, imageSpec: "400x240 또는 500x300, 최대 0.3MB" },
  { value: 1, label: "LMS", maxChars: 1100, imageSpec: "이미지 없음" },
  { value: 2, label: "슬라이드", maxChars: 300, imageSpec: "464x336, 슬라이드당 최대 300KB (총 1MB)" },
  { value: 3, label: "이미지 강조 A", maxChars: 1100, imageSpec: "900x1200, 최대 1MB" },
  { value: 4, label: "이미지 강조 B", maxChars: 1100, imageSpec: "900x900, 최대 1MB" },
  { value: 5, label: "상품 소개 (세로)", maxChars: 1100, imageSpec: "900x560, 최대 1MB" },
];

const MMS_IMAGE_SPEC = {
  format: "JPG",
  maxSize: "300KB (최대 1MB)",
  resolution: "320x240 권장 (최대 2000x2000)",
};

export default function TemplatesNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFileId, setImageFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [, viewParams] = useRoute("/templates/:id");
  const [, editParams] = useRoute("/templates/:id/edit");
  const rawTemplateId = viewParams?.id || editParams?.id || null;
  const templateId = rawTemplateId && rawTemplateId !== "new" ? rawTemplateId : null;
  const isEditMode = !!editParams?.id && editParams?.id !== "new";
  const isViewMode = !!viewParams?.id && viewParams?.id !== "new" && !editParams?.id;

  const { data: existingTemplate, isLoading: templateLoading } = useQuery<Template>({
    queryKey: ["/api/templates", templateId],
    enabled: !!templateId && templateId !== "new",
  });

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      messageType: "LMS",
      rcsType: 0,
      title: "",
      content: "",
      imageUrl: "",
      imageFileId: "",
    },
  });

  useEffect(() => {
    if (existingTemplate) {
      form.reset({
        name: existingTemplate.name,
        messageType: existingTemplate.messageType as "LMS" | "MMS" | "RCS",
        rcsType: existingTemplate.rcsType || 0,
        title: existingTemplate.title || "",
        content: existingTemplate.content,
        imageUrl: existingTemplate.imageUrl || "",
        imageFileId: existingTemplate.imageFileId || "",
      });
      if (existingTemplate.imageUrl) {
        setImagePreview(existingTemplate.imageUrl);
      }
      if (existingTemplate.imageFileId) {
        setImageFileId(existingTemplate.imageFileId);
      }
      if (isViewMode) {
        setShowPreview(true);
      }
    }
  }, [existingTemplate, form, isViewMode]);

  const watchedValues = form.watch();

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const messageType = watchedValues.messageType;
    const rcsType = watchedValues.rcsType;

    const validTypes = messageType === "MMS" 
      ? ["image/jpeg"] 
      : ["image/jpeg", "image/png"];
    
    if (!validTypes.includes(file.type)) {
      toast({
        title: "지원하지 않는 파일 형식",
        description: messageType === "MMS" ? "MMS는 JPG 파일만 지원해요" : "JPG 또는 PNG 파일만 지원해요",
        variant: "destructive",
      });
      return;
    }

    const getMaxFileSize = () => {
      if (messageType === "MMS") return 300 * 1024;
      if (messageType === "RCS") {
        switch (rcsType) {
          case 0: return 300 * 1024;
          case 2: return 300 * 1024;
          default: return 1024 * 1024;
        }
      }
      return 1024 * 1024;
    };
    
    const maxSize = getMaxFileSize();
    if (file.size > maxSize) {
      const sizeText = maxSize >= 1024 * 1024 
        ? `${maxSize / (1024 * 1024)}MB` 
        : `${Math.round(maxSize / 1024)}KB`;
      toast({
        title: "파일 크기 초과",
        description: `파일 크기가 ${sizeText}를 초과해요. 이미지를 압축해서 다시 시도해주세요.`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        setImagePreview(base64Data);
        form.setValue("imageUrl", base64Data);

        try {
          const token = localStorage.getItem("supabase_token");
          const response = await fetch("/api/bizchat/file", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              fileData: base64Data,
              fileName: file.name,
              fileType: file.type,
              type: 2,
              rcs: messageType === "RCS" ? 1 : 0,
            }),
          });

          const result = await response.json();

          if (result.success && result.fileId) {
            setImageFileId(result.fileId);
            form.setValue("imageFileId", result.fileId);
            toast({
              title: "이미지 업로드 완료",
              description: "BizChat 서버에 이미지가 업로드되었어요",
            });
          } else {
            toast({
              title: "이미지 업로드 실패",
              description: result.error || "다시 시도해주세요",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Image upload error:", error);
          toast({
            title: "이미지 업로드 실패",
            description: "서버 연결에 실패했어요. 나중에 다시 시도해주세요",
            variant: "destructive",
          });
        }

        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsUploading(false);
      toast({
        title: "이미지 처리 실패",
        description: "파일을 읽을 수 없어요",
        variant: "destructive",
      });
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageFileId(null);
    form.setValue("imageUrl", "");
    form.setValue("imageFileId", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormValues) => {
      const cleanedData = {
        ...data,
        imageUrl: data.imageUrl || undefined,
        imageFileId: data.imageFileId || undefined,
        title: data.title || undefined,
        rcsType: data.messageType === "RCS" ? data.rcsType : undefined,
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
        imageFileId: data.imageFileId || undefined,
        title: data.title || undefined,
        rcsType: data.messageType === "RCS" ? data.rcsType : undefined,
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
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case "LMS":
        return <MessageSquare className="h-5 w-5" />;
      case "MMS":
        return <ImageIcon className="h-5 w-5" />;
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

  const getMaxContentLength = (type: string, rcsType?: number) => {
    if (type === "LMS") return 2000;
    if (type === "MMS") return 1000;
    if (type === "RCS") {
      const rcsSpec = RCS_TYPES.find(t => t.value === rcsType);
      return rcsSpec?.maxChars || 1100;
    }
    return 2000;
  };

  const needsImage = (type: string, rcsType?: number) => {
    if (type === "MMS") return true;
    if (type === "RCS" && rcsType !== 1) return true;
    return false;
  };

  const getImageSpec = () => {
    if (watchedValues.messageType === "MMS") {
      return MMS_IMAGE_SPEC;
    }
    if (watchedValues.messageType === "RCS") {
      const rcsSpec = RCS_TYPES.find(t => t.value === watchedValues.rcsType);
      return rcsSpec ? { 
        format: "JPG/PNG", 
        maxSize: rcsSpec.imageSpec.includes("MB") ? rcsSpec.imageSpec.split(",")[1]?.trim() || "1MB" : "1MB",
        resolution: rcsSpec.imageSpec 
      } : null;
    }
    return null;
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

  const canEdit = existingTemplate && (existingTemplate.status === "draft" || existingTemplate.status === "rejected");
  const isPending = createMutation.isPending || updateMutation.isPending;
  const showImageUpload = needsImage(watchedValues.messageType, watchedValues.rcsType);
  const imageSpec = getImageSpec();

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
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value !== "RCS") {
                            form.setValue("rcsType", undefined);
                          } else {
                            form.setValue("rcsType", 0);
                          }
                          removeImage();
                        }} 
                        defaultValue={field.value} 
                        disabled={isViewMode}
                      >
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
                              <ImageIcon className="h-4 w-4" />
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
                          {watchedValues.messageType === "LMS" && "텍스트 전용 장문 메시지 (최대 2,000자)"}
                          {watchedValues.messageType === "MMS" && "이미지 + 텍스트 (최대 1,000자)"}
                          {watchedValues.messageType === "RCS" && "풍부한 미디어 메시지 (RCS 미지원 시 LMS/MMS로 대체 발송)"}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedValues.messageType === "RCS" && (
                  <FormField
                    control={form.control}
                    name="rcsType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>RCS 메시지 타입</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(parseInt(value));
                            removeImage();
                          }} 
                          value={field.value?.toString()} 
                          disabled={isViewMode}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-rcs-type" disabled={isViewMode}>
                              <SelectValue placeholder="RCS 타입 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RCS_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value.toString()}>
                                <div className="flex flex-col">
                                  <span>{type.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {type.imageSpec === "이미지 없음" ? "텍스트 전용" : type.imageSpec}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!isViewMode && (
                          <FormDescription>
                            메시지 레이아웃과 이미지 규격이 타입별로 다릅니다
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>제목 (선택)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="예: 특별 할인 안내"
                          maxLength={30}
                          data-testid="input-template-title"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      {!isViewMode && (
                        <FormDescription>
                          최대 30자까지 입력 가능해요
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
                          maxLength={getMaxContentLength(watchedValues.messageType, watchedValues.rcsType)}
                          data-testid="input-template-content"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {field.value.length} / {getMaxContentLength(watchedValues.messageType, watchedValues.rcsType)}자
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showImageUpload && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel>이미지 {watchedValues.messageType === "MMS" && "(필수)"}</FormLabel>
                      {imageFileId && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          업로드 완료
                        </Badge>
                      )}
                    </div>
                    
                    {imageSpec && (
                      <Alert className="bg-muted/50">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <strong>이미지 규격:</strong> {imageSpec.resolution}
                          {imageSpec.format && ` (${imageSpec.format})`}
                        </AlertDescription>
                      </Alert>
                    )}

                    {!isViewMode && (
                      <div className="relative">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={watchedValues.messageType === "MMS" ? "image/jpeg" : "image/jpeg,image/png"}
                          onChange={handleImageUpload}
                          className="hidden"
                          data-testid="input-image-file"
                        />
                        
                        {!imagePreview ? (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                          >
                            {isUploading ? (
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">업로드 중...</p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <Upload className="h-8 w-8 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  클릭하여 이미지를 업로드하세요
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {watchedValues.messageType === "MMS" ? "JPG 파일만 가능" : "JPG, PNG 파일 가능"}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="relative rounded-lg overflow-hidden border">
                            <img
                              src={imagePreview}
                              alt="미리보기"
                              className="w-full h-48 object-cover"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2"
                              onClick={removeImage}
                              data-testid="button-remove-image"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            {isUploading && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-white" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {isViewMode && imagePreview && (
                      <div className="rounded-lg overflow-hidden border">
                        <img
                          src={imagePreview}
                          alt="첨부 이미지"
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    )}

                    {watchedValues.messageType === "MMS" && !imagePreview && !isViewMode && (
                      <Alert variant="destructive" className="bg-destructive/10">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          MMS 메시지는 이미지가 필수입니다
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {!isViewMode && (
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      disabled={isPending || isUploading}
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
                    {watchedValues.messageType === "RCS" && (
                      <Badge variant="secondary" className="text-xs">
                        {RCS_TYPES.find(t => t.value === watchedValues.rcsType)?.label || "스탠다드"}
                      </Badge>
                    )}
                  </div>
                  
                  {watchedValues.title && (
                    <div className="font-semibold text-body">
                      {watchedValues.title}
                    </div>
                  )}
                  
                  {imagePreview && (
                    <div className="rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
                      <img 
                        src={imagePreview} 
                        alt="미리보기" 
                        className="w-full h-full object-cover"
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
