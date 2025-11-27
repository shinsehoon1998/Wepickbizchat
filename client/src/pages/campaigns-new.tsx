import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Users,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Image,
  Smartphone,
  FilePlus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatNumber, getMessageTypeLabel } from "@/lib/authUtils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Template, SenderNumber } from "@shared/schema";

const campaignSchema = z.object({
  name: z.string().min(1, "캠페인 이름을 입력해주세요").max(200, "캠페인 이름은 200자 이내로 입력해주세요"),
  templateId: z.string().min(1, "템플릿을 선택해주세요"),
  sndNum: z.string().min(1, "발신번호를 선택해주세요"),
  gender: z.enum(["all", "male", "female"]).default("all"),
  ageMin: z.number().min(10).max(100).default(20),
  ageMax: z.number().min(10).max(100).default(60),
  regions: z.array(z.string()).default([]),
  targetCount: z.number().min(100, "최소 100명 이상 선택해주세요").default(1000),
  budget: z.number().min(10000, "최소 10,000원 이상 입력해주세요"),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

const steps = [
  { id: 1, title: "템플릿 선택", icon: FileText },
  { id: 2, title: "타겟 설정", icon: Users },
  { id: 3, title: "예산 및 확인", icon: CheckCircle2 },
];

const regions = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
];

function getMessageTypeIcon(type: string) {
  switch (type) {
    case "LMS":
      return MessageSquare;
    case "MMS":
      return Image;
    case "RCS":
      return Smartphone;
    default:
      return MessageSquare;
  }
}

export default function CampaignsNew() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: approvedTemplates, isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates/approved"],
  });

  const { data: senderNumbers, isLoading: senderNumbersLoading } = useQuery<SenderNumber[]>({
    queryKey: ["/api/sender-numbers"],
  });

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      templateId: "",
      sndNum: "",
      gender: "all",
      ageMin: 20,
      ageMax: 60,
      regions: [],
      targetCount: 1000,
      budget: 100000,
    },
  });

  const selectedTemplateId = form.watch("templateId");
  const selectedTemplate = approvedTemplates?.find(t => t.id === selectedTemplateId);
  
  const watchTargetCount = form.watch("targetCount");
  const watchBudget = form.watch("budget");
  const watchGender = form.watch("gender");
  const watchAgeMin = form.watch("ageMin");
  const watchAgeMax = form.watch("ageMax");
  const watchRegions = form.watch("regions");

  const [estimatedAudience, setEstimatedAudience] = useState({
    min: 900000,
    estimated: 1000000,
    max: 1100000,
    reachRate: 90,
  });

  useEffect(() => {
    const fetchEstimate = async () => {
      try {
        const res = await apiRequest("POST", "/api/targeting/estimate", {
          gender: watchGender,
          ageMin: watchAgeMin,
          ageMax: watchAgeMax,
          regions: watchRegions,
        });
        const data = await res.json();
        setEstimatedAudience({
          min: data.minCount,
          estimated: data.estimatedCount,
          max: data.maxCount,
          reachRate: data.reachRate,
        });
      } catch (error) {
        console.error("Failed to fetch targeting estimate:", error);
      }
    };
    
    if (currentStep === 2) {
      fetchEstimate();
    }
  }, [currentStep, watchGender, watchAgeMin, watchAgeMax, watchRegions]);

  const costPerMessage = 50;
  const estimatedCost = watchTargetCount * costPerMessage;
  const userBalance = parseFloat(user?.balance as string || "0");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', 'image');
    
    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('업로드 실패');
      }
      
      const data = await response.json();
      setUploadedImageId(data.id);
      setUploadedImageUrl(URL.createObjectURL(file));
      toast({ 
        title: "이미지 업로드 완료",
        description: "이미지가 성공적으로 업로드되었어요"
      });
    } catch (error) {
      toast({ 
        title: "이미지 업로드 실패", 
        description: "이미지 업로드 중 오류가 발생했어요. 다시 시도해주세요.",
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
    }
  };

  const createCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      const template = approvedTemplates?.find(t => t.id === data.templateId);
      if (!template) throw new Error("템플릿을 찾을 수 없습니다");

      const campaignData = {
        name: data.name,
        templateId: data.templateId,
        messageType: template.messageType,
        sndNum: data.sndNum,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
        targetCount: data.targetCount,
        budget: data.budget,
      };

      const response = await apiRequest("POST", "/api/campaigns", campaignData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "캠페인 생성 완료",
        description: "캠페인이 성공적으로 생성되었어요. 발송 준비를 완료해주세요.",
      });
      navigate("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        title: "캠페인 생성 실패",
        description: error.message || "캠페인 생성 중 오류가 발생했어요. 다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const nextStep = async () => {
    if (currentStep === 1) {
      const isValid = await form.trigger(["name", "templateId", "sndNum"]);
      if (!isValid) return;
    }
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const onSubmit = (data: CampaignFormData) => {
    createCampaignMutation.mutate(data);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate("/campaigns")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-display font-bold">캠페인 만들기</h1>
          <p className="text-muted-foreground mt-1">
            승인된 템플릿으로 새로운 광고 캠페인을 만들어보세요
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => currentStep > step.id && setCurrentStep(step.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                currentStep === step.id
                  ? "bg-primary text-primary-foreground"
                  : currentStep > step.id
                  ? "bg-success/10 text-success cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              disabled={currentStep < step.id}
              data-testid={`button-step-${step.id}`}
            >
              <step.icon className="h-4 w-4" />
              <span className="text-small font-medium hidden md:inline">{step.title}</span>
              <span className="text-small font-medium md:hidden">{step.id}</span>
            </button>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-8 h-0.5 mx-1",
                currentStep > step.id ? "bg-success" : "bg-muted"
              )} />
            )}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {currentStep === 1 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>캠페인 정보</CardTitle>
                  <CardDescription>캠페인 이름을 입력하고 사용할 템플릿을 선택해주세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>캠페인 이름</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="예: 2024년 연말 프로모션" 
                            {...field} 
                            data-testid="input-campaign-name"
                          />
                        </FormControl>
                        <FormDescription>캠페인을 구분할 수 있는 이름을 입력해주세요</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>템플릿 선택</CardTitle>
                  <CardDescription>
                    승인된 템플릿 중에서 사용할 템플릿을 선택해주세요
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {templatesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : approvedTemplates && approvedTemplates.length > 0 ? (
                    <FormField
                      control={form.control}
                      name="templateId"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="space-y-3"
                            >
                              {approvedTemplates.map((template) => {
                                const Icon = getMessageTypeIcon(template.messageType);
                                return (
                                  <Label
                                    key={template.id}
                                    htmlFor={`template-${template.id}`}
                                    className={cn(
                                      "flex items-start gap-4 p-4 rounded-lg border cursor-pointer hover-elevate",
                                      field.value === template.id
                                        ? "border-primary bg-accent"
                                        : "border-border"
                                    )}
                                    data-testid={`radio-template-${template.id}`}
                                  >
                                    <RadioGroupItem 
                                      value={template.id} 
                                      id={`template-${template.id}`} 
                                      className="mt-1" 
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium">{template.name}</span>
                                        <Badge variant="outline" className="text-tiny gap-1">
                                          <Icon className="h-3 w-3" />
                                          {getMessageTypeLabel(template.messageType)}
                                        </Badge>
                                      </div>
                                      <p className="text-small text-muted-foreground line-clamp-2">
                                        {template.content}
                                      </p>
                                    </div>
                                  </Label>
                                );
                              })}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="text-center py-12">
                      <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">승인된 템플릿이 없어요</h3>
                      <p className="text-small text-muted-foreground mb-4">
                        먼저 템플릿을 만들고 검수를 받아야 캠페인을 만들 수 있어요
                      </p>
                      <Button asChild className="gap-2">
                        <Link href="/templates/new">
                          <FilePlus className="h-4 w-4" />
                          템플릿 만들기
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>발신번호 선택</CardTitle>
                  <CardDescription>
                    캠페인 발송에 사용할 발신번호를 선택해주세요
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {senderNumbersLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <FormField
                      control={form.control}
                      name="sndNum"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>발신번호</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sender-number">
                                <SelectValue placeholder="발신번호를 선택하세요" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {senderNumbers?.map((num) => (
                                <SelectItem key={num.id} value={num.code}>
                                  {num.name} ({num.phoneNumber})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>캠페인 발송에 사용될 번호예요</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              {selectedTemplate && (selectedTemplate.messageType === "MMS" || selectedTemplate.messageType === "RCS") && (
                <Card>
                  <CardHeader>
                    <CardTitle>이미지 업로드</CardTitle>
                    <CardDescription>
                      {selectedTemplate.messageType} 메시지에 포함될 이미지를 업로드해주세요 (선택사항)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="image-upload">이미지 파일</Label>
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploading}
                        className="mt-2"
                        data-testid="input-upload-image"
                      />
                      <p className="text-tiny text-muted-foreground mt-2">
                        JPG, PNG 형식 지원 (최대 10MB)
                      </p>
                    </div>
                    
                    {uploading && (
                      <div className="flex items-center gap-2 text-small text-muted-foreground">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                        <span>이미지 업로드 중...</span>
                      </div>
                    )}
                    
                    {uploadedImageUrl && (
                      <div className="space-y-2">
                        <Label>미리보기</Label>
                        <div className="rounded-lg overflow-hidden bg-muted max-w-xs">
                          <img 
                            src={uploadedImageUrl} 
                            alt="업로드된 이미지" 
                            className="w-full h-auto"
                            data-testid="img-preview"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {selectedTemplate && (
                <Card className="bg-accent/50 border-accent">
                  <CardHeader>
                    <CardTitle className="text-h3">선택한 템플릿 미리보기</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-background rounded-xl p-4 shadow-sm max-w-[320px] space-y-3">
                      <div className="flex items-center gap-2 text-small text-muted-foreground">
                        {(() => {
                          const Icon = getMessageTypeIcon(selectedTemplate.messageType);
                          return <Icon className="h-4 w-4" />;
                        })()}
                        <span>{getMessageTypeLabel(selectedTemplate.messageType)}</span>
                      </div>
                      
                      {selectedTemplate.title && (
                        <div className="font-semibold text-body">
                          {selectedTemplate.title}
                        </div>
                      )}
                      
                      {selectedTemplate.imageUrl && (
                        <div className="rounded-lg overflow-hidden bg-muted aspect-video">
                          <img 
                            src={selectedTemplate.imageUrl} 
                            alt="템플릿 이미지" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="text-small whitespace-pre-wrap">
                        {selectedTemplate.content}
                      </div>
                      
                      <div className="text-tiny text-muted-foreground pt-2 border-t">
                        SK코어타겟 비즈챗
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>타겟 설정</CardTitle>
                <CardDescription>광고를 받을 대상을 설정해주세요</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>성별</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex gap-4"
                        >
                          {[
                            { value: "all", label: "전체" },
                            { value: "male", label: "남성" },
                            { value: "female", label: "여성" },
                          ].map((option) => (
                            <Label
                              key={option.value}
                              htmlFor={`gender-${option.value}`}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer",
                                field.value === option.value
                                  ? "border-primary bg-accent"
                                  : "border-border hover-elevate"
                              )}
                            >
                              <RadioGroupItem value={option.value} id={`gender-${option.value}`} />
                              <span>{option.label}</span>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <Label>연령대</Label>
                  <div className="flex items-center gap-4">
                    <FormField
                      control={form.control}
                      name="ageMin"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select 
                            onValueChange={(v) => field.onChange(parseInt(v))} 
                            value={field.value.toString()}
                          >
                            <SelectTrigger data-testid="select-age-min">
                              <SelectValue placeholder="최소 연령" />
                            </SelectTrigger>
                            <SelectContent>
                              {[10, 20, 30, 40, 50, 60, 70].map((age) => (
                                <SelectItem key={age} value={age.toString()}>
                                  {age}세
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground">~</span>
                    <FormField
                      control={form.control}
                      name="ageMax"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select 
                            onValueChange={(v) => field.onChange(parseInt(v))} 
                            value={field.value.toString()}
                          >
                            <SelectTrigger data-testid="select-age-max">
                              <SelectValue placeholder="최대 연령" />
                            </SelectTrigger>
                            <SelectContent>
                              {[20, 30, 40, 50, 60, 70, 80, 100].map((age) => (
                                <SelectItem key={age} value={age.toString()}>
                                  {age}세
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="regions"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>지역</FormLabel>
                        <FormDescription>타겟팅할 지역을 선택해주세요 (선택 안함 = 전국)</FormDescription>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                        {regions.map((region) => (
                          <FormField
                            key={region}
                            control={form.control}
                            name="regions"
                            render={({ field }) => (
                              <FormItem
                                key={region}
                                className="flex items-center space-x-2 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(region)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, region])
                                        : field.onChange(
                                            field.value?.filter((v) => v !== region)
                                          );
                                    }}
                                    data-testid={`checkbox-region-${region}`}
                                  />
                                </FormControl>
                                <FormLabel className="text-small font-normal cursor-pointer">
                                  {region}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </FormItem>
                  )}
                />

                <Card className="bg-muted/50">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-small text-muted-foreground">예상 도달 가능 인원</div>
                        <div className="text-h2 font-bold" data-testid="text-estimated-audience">
                          {formatNumber(estimatedAudience.estimated)}명
                        </div>
                        <div className="text-tiny text-muted-foreground">
                          ({formatNumber(estimatedAudience.min)} ~ {formatNumber(estimatedAudience.max)}명)
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-small text-muted-foreground">예상 도달률</div>
                        <div className="text-h2 font-bold text-primary">
                          {estimatedAudience.reachRate}%
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>발송 수량</CardTitle>
                  <CardDescription>광고를 받을 대상 수를 설정해주세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="targetCount"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between mb-4">
                          <FormLabel>발송 수량</FormLabel>
                          <div className="text-h3 font-bold" data-testid="text-target-count">
                            {formatNumber(field.value)}명
                          </div>
                        </div>
                        <FormControl>
                          <div className="space-y-4">
                            <input
                              type="range"
                              min={100}
                              max={Math.min(estimatedAudience.estimated, 100000)}
                              step={100}
                              value={field.value}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              data-testid="slider-target-count"
                            />
                            <div className="flex justify-between text-tiny text-muted-foreground">
                              <span>100명</span>
                              <span>{formatNumber(Math.min(estimatedAudience.estimated, 100000))}명</span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>예산 설정</CardTitle>
                  <CardDescription>캠페인 예산을 설정해주세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>예산</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              min={10000}
                              step={10000}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              className="pl-8"
                              data-testid="input-budget"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              ₩
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription>
                          건당 {formatCurrency(costPerMessage)} × {formatNumber(watchTargetCount)}건 = {formatCurrency(estimatedCost)}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-muted/50">
                      <CardContent className="py-4">
                        <div className="text-small text-muted-foreground mb-1">현재 잔액</div>
                        <div className="text-h3 font-bold" data-testid="text-user-balance">
                          {formatCurrency(userBalance)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className={cn(
                      "bg-muted/50",
                      watchBudget > userBalance && "border-destructive"
                    )}>
                      <CardContent className="py-4">
                        <div className="text-small text-muted-foreground mb-1">예상 비용</div>
                        <div className={cn(
                          "text-h3 font-bold",
                          watchBudget > userBalance && "text-destructive"
                        )} data-testid="text-estimated-cost">
                          {formatCurrency(estimatedCost)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {watchBudget > userBalance && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">잔액이 부족해요</p>
                        <p className="text-small">
                          {formatCurrency(watchBudget - userBalance)}을 추가로 충전해주세요.{" "}
                          <Link href="/billing" className="underline">
                            충전하러 가기
                          </Link>
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>캠페인 요약</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">캠페인 이름</span>
                      <span className="font-medium" data-testid="summary-campaign-name">{form.watch("name") || "-"}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">템플릿</span>
                      <span className="font-medium" data-testid="summary-template">{selectedTemplate?.name || "-"}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">메시지 유형</span>
                      <span className="font-medium">{selectedTemplate ? getMessageTypeLabel(selectedTemplate.messageType) : "-"}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">타겟 성별</span>
                      <span className="font-medium">
                        {watchGender === "all" ? "전체" : watchGender === "male" ? "남성" : "여성"}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">타겟 연령</span>
                      <span className="font-medium">{watchAgeMin}세 ~ {watchAgeMax}세</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">타겟 지역</span>
                      <span className="font-medium">
                        {watchRegions.length > 0 ? watchRegions.join(", ") : "전국"}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">발송 수량</span>
                      <span className="font-medium">{formatNumber(watchTargetCount)}명</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">예상 비용</span>
                      <span className="font-bold text-primary">{formatCurrency(estimatedCost)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex justify-between gap-4">
            {currentStep > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                className="gap-2"
                data-testid="button-prev-step"
              >
                <ArrowLeft className="h-4 w-4" />
                이전
              </Button>
            ) : (
              <div />
            )}
            
            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={nextStep}
                className="gap-2"
                disabled={currentStep === 1 && (!form.watch("name") || !form.watch("templateId"))}
                data-testid="button-next-step"
              >
                다음
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={createCampaignMutation.isPending || estimatedCost > userBalance}
                className="gap-2"
                data-testid="button-create-campaign"
              >
                {createCampaignMutation.isPending ? "생성 중..." : "캠페인 생성하기"}
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
