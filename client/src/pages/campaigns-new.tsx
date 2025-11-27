import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  Image,
  Sparkles,
  Users,
  MapPin,
  Calendar,
  CheckCircle2,
  Upload,
  Trash2,
  Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatNumber } from "@/lib/authUtils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
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

const campaignSchema = z.object({
  name: z.string().min(1, "캠페인 이름을 입력해주세요").max(200, "캠페인 이름은 200자 이내로 입력해주세요"),
  messageType: z.enum(["LMS", "MMS", "RCS"], { required_error: "메시지 유형을 선택해주세요" }),
  title: z.string().max(60, "제목은 60자 이내로 입력해주세요").optional(),
  content: z.string().min(1, "메시지 내용을 입력해주세요").max(2000, "메시지 내용은 2000자 이내로 입력해주세요"),
  gender: z.enum(["all", "male", "female"]).default("all"),
  ageMin: z.number().min(10).max(100).default(20),
  ageMax: z.number().min(10).max(100).default(60),
  regions: z.array(z.string()).default([]),
  targetCount: z.number().min(100, "최소 100명 이상 선택해주세요").default(1000),
  budget: z.number().min(10000, "최소 10,000원 이상 입력해주세요"),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

const steps = [
  { id: 1, title: "캠페인 정보", icon: MessageSquare },
  { id: 2, title: "메시지 작성", icon: Sparkles },
  { id: 3, title: "타겟 설정", icon: Users },
  { id: 4, title: "예산 및 확인", icon: CheckCircle2 },
];

const regions = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
];

const messageTypeOptions = [
  { value: "LMS", label: "장문 문자 (LMS)", description: "텍스트만 최대 2,000자", icon: MessageSquare },
  { value: "MMS", label: "이미지 문자 (MMS)", description: "이미지 + 텍스트", icon: Image },
  { value: "RCS", label: "RCS 메시지", description: "리치 미디어 지원", icon: Sparkles },
];

export default function CampaignsNew() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      messageType: "LMS",
      title: "",
      content: "",
      gender: "all",
      ageMin: 20,
      ageMax: 60,
      regions: [],
      targetCount: 1000,
      budget: 100000,
    },
  });

  const watchMessageType = form.watch("messageType");
  const watchContent = form.watch("content");
  const watchTargetCount = form.watch("targetCount");
  const watchBudget = form.watch("budget");

  const costPerMessage = 50;
  const estimatedCost = watchTargetCount * costPerMessage;
  const userBalance = parseFloat(user?.balance as string || "0");

  const createCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      const response = await apiRequest("POST", "/api/campaigns", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "캠페인 생성 완료",
        description: "캠페인이 성공적으로 생성되었어요. 검토 후 승인을 요청해주세요.",
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 300 * 1024) {
        toast({
          title: "파일 크기 초과",
          description: "이미지 파일은 300KB 이하만 업로드할 수 있어요.",
          variant: "destructive",
        });
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const nextStep = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1);
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
            새로운 광고 캠페인을 만들어보세요
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => setCurrentStep(step.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                currentStep === step.id
                  ? "bg-primary text-primary-foreground"
                  : currentStep > step.id
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              )}
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
            <Card>
              <CardHeader>
                <CardTitle>캠페인 정보</CardTitle>
                <CardDescription>캠페인의 기본 정보를 입력해주세요</CardDescription>
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

                <FormField
                  control={form.control}
                  name="messageType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메시지 유형</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="grid grid-cols-1 md:grid-cols-3 gap-4"
                        >
                          {messageTypeOptions.map((option) => (
                            <Label
                              key={option.value}
                              htmlFor={option.value}
                              className={cn(
                                "flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover-elevate",
                                field.value === option.value
                                  ? "border-primary bg-accent"
                                  : "border-border"
                              )}
                            >
                              <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <option.icon className="h-4 w-4 text-primary" />
                                  <span className="font-medium">{option.label}</span>
                                </div>
                                <p className="text-small text-muted-foreground">{option.description}</p>
                              </div>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>메시지 작성</CardTitle>
                <CardDescription>고객에게 보낼 메시지를 작성해주세요</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>제목 (선택)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="광고 제목 (최대 60자)" 
                          {...field} 
                          data-testid="input-message-title"
                        />
                      </FormControl>
                      <FormDescription>
                        {(field.value?.length || 0)} / 60자
                      </FormDescription>
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
                          placeholder="광고 내용을 입력하세요..."
                          className="min-h-[200px] resize-none"
                          {...field} 
                          data-testid="textarea-message-content"
                        />
                      </FormControl>
                      <FormDescription>
                        {(field.value?.length || 0)} / 2,000자
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchMessageType === "MMS" && (
                  <div className="space-y-3">
                    <Label>이미지 첨부</Label>
                    {imagePreview ? (
                      <div className="relative inline-block">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="max-w-[200px] rounded-lg border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={removeImage}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-small text-muted-foreground mb-2">
                          이미지를 업로드하세요
                        </p>
                        <p className="text-tiny text-muted-foreground mb-4">
                          JPG, PNG, GIF (최대 300KB)
                        </p>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                          id="image-upload"
                        />
                        <Label htmlFor="image-upload" className="cursor-pointer">
                          <Button type="button" variant="outline" asChild>
                            <span>파일 선택</span>
                          </Button>
                        </Label>
                      </div>
                    )}
                  </div>
                )}

                <Card className="bg-muted/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-small flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      미리보기
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-card rounded-lg p-4 border max-w-[280px]">
                      {form.watch("title") && (
                        <p className="font-medium mb-2">{form.watch("title")}</p>
                      )}
                      {imagePreview && (
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-full rounded mb-2"
                        />
                      )}
                      <p className="text-small whitespace-pre-wrap">
                        {watchContent || "메시지 내용이 여기에 표시됩니다..."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          )}

          {currentStep === 3 && (
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
                                            field.value?.filter((value: string) => value !== region)
                                          );
                                    }}
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

                <FormField
                  control={form.control}
                  name="targetCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>발송 대상 수</FormLabel>
                      <div className="flex items-center gap-4">
                        <FormControl>
                          <Input 
                            type="number"
                            min={100}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 100)}
                            className="w-32"
                            data-testid="input-target-count"
                          />
                        </FormControl>
                        <span className="text-muted-foreground">명</span>
                      </div>
                      <FormDescription>최소 100명 이상 설정해주세요</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
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
                        <div className="flex items-center gap-4">
                          <FormControl>
                            <Input 
                              type="number"
                              min={10000}
                              step={10000}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 10000)}
                              className="w-40"
                              data-testid="input-budget"
                            />
                          </FormControl>
                          <span className="text-muted-foreground">원</span>
                        </div>
                        <FormDescription>최소 10,000원 이상 설정해주세요</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="rounded-lg bg-muted p-4 space-y-3">
                    <div className="flex justify-between text-small">
                      <span className="text-muted-foreground">예상 발송 비용</span>
                      <span className="font-medium">{formatCurrency(estimatedCost)}</span>
                    </div>
                    <div className="flex justify-between text-small">
                      <span className="text-muted-foreground">건당 비용</span>
                      <span>{formatCurrency(costPerMessage)}</span>
                    </div>
                    <div className="flex justify-between text-small">
                      <span className="text-muted-foreground">발송 대상</span>
                      <span>{formatNumber(watchTargetCount)}명</span>
                    </div>
                    <hr className="border-border" />
                    <div className="flex justify-between">
                      <span className="font-medium">현재 잔액</span>
                      <span className={cn(
                        "font-bold",
                        userBalance >= estimatedCost ? "text-success" : "text-destructive"
                      )}>
                        {formatCurrency(userBalance)}
                      </span>
                    </div>
                  </div>

                  {userBalance < estimatedCost && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                      <p className="text-small text-destructive">
                        잔액이 부족해요. 캠페인을 발송하려면 {formatCurrency(estimatedCost - userBalance)} 이상 충전이 필요해요.
                      </p>
                      <Button 
                        type="button"
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => window.location.href = '/billing'}
                      >
                        잔액 충전하기
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>캠페인 요약</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-small text-muted-foreground">캠페인 이름</p>
                        <p className="font-medium">{form.watch("name") || "-"}</p>
                      </div>
                      <div>
                        <p className="text-small text-muted-foreground">메시지 유형</p>
                        <p className="font-medium">
                          {messageTypeOptions.find(o => o.value === watchMessageType)?.label}
                        </p>
                      </div>
                      <div>
                        <p className="text-small text-muted-foreground">메시지 미리보기</p>
                        <div className="bg-muted rounded-lg p-3 mt-1">
                          {form.watch("title") && (
                            <p className="font-medium text-small mb-1">{form.watch("title")}</p>
                          )}
                          <p className="text-small text-muted-foreground line-clamp-3">
                            {watchContent || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-small text-muted-foreground">타겟 설정</p>
                        <p className="font-medium">
                          {form.watch("gender") === "all" ? "전체" : form.watch("gender") === "male" ? "남성" : "여성"} / {form.watch("ageMin")}세 ~ {form.watch("ageMax")}세
                        </p>
                      </div>
                      <div>
                        <p className="text-small text-muted-foreground">지역</p>
                        <p className="font-medium">
                          {form.watch("regions")?.length > 0 
                            ? form.watch("regions").join(", ")
                            : "전국"
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-small text-muted-foreground">발송 대상</p>
                        <p className="font-medium">{formatNumber(watchTargetCount)}명</p>
                      </div>
                      <div>
                        <p className="text-small text-muted-foreground">예산</p>
                        <p className="font-medium text-primary">{formatCurrency(watchBudget)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="gap-2"
              data-testid="button-prev-step"
            >
              <ArrowLeft className="h-4 w-4" />
              이전
            </Button>
            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={nextStep}
                className="gap-2"
                data-testid="button-next-step"
              >
                다음
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={createCampaignMutation.isPending || userBalance < estimatedCost}
                className="gap-2"
                data-testid="button-create-campaign"
              >
                {createCampaignMutation.isPending ? "생성 중..." : "캠페인 생성"}
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
