import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="text-8xl font-bold text-primary/20 mb-4">404</div>
      <h1 className="text-display font-bold mb-2">페이지를 찾을 수 없어요</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        요청하신 페이지가 존재하지 않거나 이동되었을 수 있어요.
        주소를 다시 확인해주세요.
      </p>
      <div className="flex gap-4">
        <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          뒤로 가기
        </Button>
        <Button asChild className="gap-2" data-testid="button-go-home">
          <Link href="/">
            <Home className="h-4 w-4" />
            홈으로
          </Link>
        </Button>
      </div>
    </div>
  );
}
