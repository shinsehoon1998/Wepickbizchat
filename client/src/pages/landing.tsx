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
  CheckCircle2
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const features = [
  {
    icon: Target,
    title: "정밀 타겟팅",
    description: "SK 통신 가입자 빅데이터 기반으로 성별, 연령, 지역, 관심사까지 정확하게 타겟팅해요",
  },
  {
    icon: MessageSquare,
    title: "다양한 메시지 형식",
    description: "LMS, MMS, RCS까지 상황에 맞는 메시지 형식을 선택할 수 있어요",
  },
  {
    icon: BarChart3,
    title: "실시간 성과 분석",
    description: "발송, 수신, 클릭까지 모든 지표를 실시간으로 확인하고 분석해요",
  },
  {
    icon: Shield,
    title: "안전한 광고 발송",
    description: "통신사 공식 채널을 통해 스팸 걱정 없이 안전하게 발송해요",
  },
];

const stats = [
  { value: "10만원", label: "최소 시작 금액" },
  { value: "50원", label: "건당 발송 비용" },
  { value: "98%", label: "평균 도달률" },
  { value: "실시간", label: "성과 확인" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              SK
            </div>
            <span className="font-bold text-lg">SK코어타겟</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
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
                SK 통신 가입자 대상 타겟 광고
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                우리 고객에게만
                <br />
                <span className="text-primary">딱 맞는 광고</span>를 보내요
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                SK코어타겟으로 원하는 고객에게 정확하게 광고를 발송하세요.
                최소 10만원으로 시작할 수 있어요.
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
                왜 SK코어타겟인가요?
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                SK 통신사의 빅데이터와 함께 효과적인 타겟 마케팅을 경험해보세요
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
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
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  간단한 3단계로 광고 시작
                </h2>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { step: "1", title: "캠페인 만들기", desc: "광고 목표와 메시지를 작성해요" },
                  { step: "2", title: "타겟 설정하기", desc: "원하는 고객층을 선택해요" },
                  { step: "3", title: "발송하기", desc: "검토 후 바로 발송해요" },
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

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="flex justify-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Users key={i} className="h-5 w-5 text-primary" />
                ))}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                이미 1,000개 이상의 사업장이
                <br />
                SK코어타겟을 사용하고 있어요
              </h2>
              <div className="flex flex-wrap justify-center gap-4 mt-8">
                {["높은 도달률", "합리적인 비용", "쉬운 사용법", "안전한 발송"].map((item, i) => (
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
              최소 10만원으로 우리 고객에게 딱 맞는 광고를 보낼 수 있어요
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
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                SK
              </div>
              <span className="font-semibold">SK코어타겟</span>
            </div>
            <p className="text-small text-muted-foreground">
              SK Telecom. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
