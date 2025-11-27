import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Target, 
  MessageSquare, 
  BarChart3, 
  Shield, 
  ArrowRight,
  Users,
  Zap,
  CheckCircle2,
  MapPin,
  Smartphone,
  Gift,
  TrendingUp,
  Database,
  FileText,
  Clock,
  Layers
} from "lucide-react";
import logoImage from "@assets/위픽xSKT 로고_1764247660608.png";

const features = [
  {
    icon: Target,
    title: "정교한 타겟팅",
    description: "SKT 광고 수신 동의자 1,600만 고객 데이터를 활용한 정교한 타겟팅. 성별, 나이, 위치, 앱/웹 사용 이력 등 다양한 데이터 활용",
  },
  {
    icon: BarChart3,
    title: "정밀한 리포트",
    description: "메시지 수신 및 반응 고객의 인구통계 분석, 관심사 분석, 기존 캠페인과 비교 분석 리포트 제공",
  },
  {
    icon: Shield,
    title: "높은 신뢰도",
    description: "RCS 브랜드 홈, 발신자 인증 마크, 철저한 메시지 검수, 중복 발송 제한을 통한 고객 피로도 관리",
  },
  {
    icon: Layers,
    title: "다양한 RCS 타입",
    description: "스탠다드, 슬라이드, 이미지 강조형, 상품소개 세로형, 배너형 등 콘텐츠에 맞게 선택 가능",
  },
  {
    icon: Zap,
    title: "API 연동 서비스",
    description: "타겟팅 시스템, RCS/MMS 발송, 리워드 적립, URL 분석 등 핵심 기능을 API로 연동하여 자사 플랫폼에서 직접 사용 가능",
  },
  {
    icon: Gift,
    title: "강력한 마케팅 서포트",
    description: "네이버페이, OK캐쉬백 리워드로 반응률 20% 상승. 채널믹스, O2O 마케팅, AI 메시지 생성 기능 지원",
  },
];

const targetingFeatures = [
  {
    icon: Users,
    title: "인구통계학적 정보",
    description: "성별, 나이 등 Demographic 데이터",
  },
  {
    icon: Smartphone,
    title: "앱/웹 접속 이력",
    description: "금융, 쇼핑, 생활 등 카테고리별 접속 이력",
  },
  {
    icon: MapPin,
    title: "위치/이동 특성",
    description: "추정 거주지, 직장 주소, 이동 수단, 출퇴근 정보",
  },
  {
    icon: Database,
    title: "예측 모델",
    description: "머신러닝 기반 이사/출국 확률, 부모 추정, 1인 가구 등",
  },
];

const marketingSupport = [
  {
    icon: Gift,
    title: "리워드 기능",
    description: "네이버페이, OK캐쉬백, 11pay 등 리워드로 반응률 20% 상승",
  },
  {
    icon: TrendingUp,
    title: "채널 믹스",
    description: "비즈챗 웹보드(MAU 50만명) 동시 노출로 광고 효과 20% 상승",
  },
  {
    icon: Clock,
    title: "실시간 타겟팅",
    description: "특정 앱 실행, 특정 번호 통화 시 실시간 광고 발송 가능",
  },
  {
    icon: FileText,
    title: "AI 메시지 생성",
    description: "초보 마케터를 위한 AI 자동 캠페인 메시지 생성 기능",
  },
];

const stats = [
  { value: "1,600만+", label: "SKT 광고 수신 동의 고객" },
  { value: "20%", label: "리워드 반응률 상승" },
  { value: "10만원", label: "최소 시작 금액" },
  { value: "실시간", label: "성과 리포트" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="wepick x SKT 로고" className="h-10 w-auto" />
            <span className="font-bold text-lg">비즈챗</span>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild data-testid="button-login-header">
              <a href="/api/login">로그인</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 md:py-32">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10" />
          <div className="container mx-auto px-4 relative">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-small text-accent-foreground mb-6">
                <Zap className="h-4 w-4 text-primary" />
                SK텔레콤 제휴 마케팅 메시징 서비스
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                <span className="text-primary">1,600만</span> SKT 고객에게
                <br />
                정확히 타겟팅해서 보내요
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                SKT 고객 타겟팅 시스템과 RCS 문자 메시징 기반으로
                원하는 고객에게 마케팅 캠페인을 진행할 수 있는 제휴 마케팅 서비스입니다.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="gap-2" data-testid="button-start-now">
                  <a href="/api/login">
                    지금 시작하기
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild data-testid="button-learn-more">
                  <a href="#features">자세히 알아보기</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 bg-card border-y">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary mb-1">
                    {stat.value}
                  </div>
                  <div className="text-small text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                비즈챗을 왜 이용해야 할까요?
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                SKT의 빅데이터와 RCS 메시징으로 효과적인 타겟 마케팅을 경험하세요
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <Card key={index} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-h3 font-semibold mb-2">{feature.title}</h3>
                    <p className="text-small text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-card">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                정교한 타겟팅 시스템
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                다양한 데이터를 활용하여 원하는 고객을 정확하게 찾아드려요
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {targetingFeatures.map((feature, index) => (
                <div key={index} className="text-center p-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
                    <feature.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-h3 font-semibold mb-2">{feature.title}</h3>
                  <p className="text-small text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                강력한 마케팅 서포트
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                리워드, 채널믹스, 실시간 타겟팅으로 광고 효과를 극대화하세요
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {marketingSupport.map((feature, index) => (
                <Card key={index} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-h3 font-semibold mb-2">{feature.title}</h3>
                    <p className="text-small text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-card">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  다양한 RCS 메시지 타입
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  홍보 콘텐츠에 맞는 메시지 형식을 선택하세요
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  { title: "LMS/MMS", desc: "텍스트와 이미지, 버튼으로 구성된 기본 메시지", icon: MessageSquare },
                  { title: "슬라이드형", desc: "최대 6장까지 슬라이드 형태로 다양한 정보 전달", icon: Layers },
                  { title: "이미지 강조형", desc: "1:1, 3:4 비율로 이미지를 강조한 레이아웃", icon: Smartphone },
                ].map((item, index) => (
                  <div key={index} className="text-center p-6 border rounded-lg bg-background">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground mx-auto mb-4">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-h3 font-semibold mb-2">{item.title}</h3>
                    <p className="text-small text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  간단한 3단계로 캠페인 시작
                </h2>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { step: "1", title: "템플릿 작성", desc: "메시지 내용을 작성하고 검수 요청해요" },
                  { step: "2", title: "타겟 설정", desc: "원하는 고객층을 정밀하게 선택해요" },
                  { step: "3", title: "캠페인 발송", desc: "예산 설정 후 바로 발송해요" },
                ].map((item, index) => (
                  <div key={index} className="text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mx-auto mb-4">
                      {item.step}
                    </div>
                    <h3 className="text-h3 font-semibold mb-2">{item.title}</h3>
                    <p className="text-small text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-card">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="flex justify-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Users key={i} className="h-5 w-5 text-primary" />
                ))}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                다양한 업종에서 활용 중
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                교육, 부동산, 금융, 커머스, 지자체 등 다양한 업종에서 비즈챗을 활용하고 있어요
              </p>
              <div className="flex flex-wrap justify-center gap-4 mt-8">
                {["교육/학습", "부동산 분양", "금융/보험", "온라인 커머스", "지자체 행사"].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-small">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              지금 바로 시작해보세요
            </h2>
            <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
              최소 10만원으로 SKT 1,600만 고객에게 정확한 타겟 광고를 보낼 수 있어요
            </p>
            <Button 
              size="lg" 
              variant="secondary" 
              asChild 
              className="gap-2"
              data-testid="button-cta-start"
            >
              <a href="/api/login">
                무료로 시작하기
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={logoImage} alt="wepick x SKT 로고" className="h-8 w-auto" />
              <span className="font-semibold">비즈챗</span>
            </div>
            <p className="text-small text-muted-foreground">
              © SK Telecom. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
