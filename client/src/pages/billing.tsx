import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { 
  Wallet, 
  CreditCard, 
  TrendingUp, 
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  Loader2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatDateTime } from "@/lib/authUtils";
import { StatsCard } from "@/components/stats-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Transaction } from "@shared/schema";

const chargeAmounts = [100000, 300000, 500000, 1000000];

export default function Billing() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [chargeAmount, setChargeAmount] = useState<number>(100000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const chargeMutation = useMutation({
    mutationFn: async (data: { amount: number; paymentMethod: string }) => {
      const res = await apiRequest("POST", "/api/transactions/charge", data);
      return await res.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await refetchUser();
      const chargedAmount = data.transaction?.amount 
        ? Math.abs(parseFloat(data.transaction.amount)) 
        : chargeAmount;
      toast({
        title: "충전 완료",
        description: `${formatCurrency(chargedAmount)}이 충전되었어요!`,
      });
      setIsChargeDialogOpen(false);
      setChargeAmount(100000);
      setCustomAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "충전 실패",
        description: error.message || "잠시 후 다시 시도해주세요",
        variant: "destructive",
      });
    },
  });

  const handleCharge = () => {
    chargeMutation.mutate({
      amount: chargeAmount,
      paymentMethod: "card",
    });
  };

  const balance = parseFloat(user?.balance as string || "0");

  const totalCharged = transactions?.reduce((sum, t) => 
    t.type === 'charge' ? sum + parseFloat(t.amount as string) : sum, 0
  ) || 0;

  const totalUsed = transactions?.reduce((sum, t) => 
    t.type === 'usage' ? sum + Math.abs(parseFloat(t.amount as string)) : sum, 0
  ) || 0;

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    const amount = parseInt(value) || 0;
    if (amount >= 10000) {
      setChargeAmount(amount);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'charge':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'usage':
        return <TrendingDown className="h-4 w-4 text-primary" />;
      case 'refund':
        return <RefreshCw className="h-4 w-4 text-chart-4" />;
      default:
        return null;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'charge':
        return '충전';
      case 'usage':
        return '사용';
      case 'refund':
        return '환불';
      default:
        return type;
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">잔액 관리</h1>
          <p className="text-muted-foreground mt-1">
            광고 잔액을 충전하고 거래 내역을 확인해요
          </p>
        </div>
        <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-fit" data-testid="button-open-charge-dialog">
              <Plus className="h-4 w-4" />
              잔액 충전하기
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>잔액 충전</DialogTitle>
              <DialogDescription>
                충전할 금액을 선택해주세요. 최소 충전 금액은 10,000원이에요.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <RadioGroup
                value={chargeAmount.toString()}
                onValueChange={(v) => {
                  setChargeAmount(parseInt(v));
                  setCustomAmount("");
                }}
                className="grid grid-cols-2 gap-3"
              >
                {chargeAmounts.map((amount) => (
                  <Label
                    key={amount}
                    htmlFor={`amount-${amount}`}
                    className={cn(
                      "flex items-center justify-center p-4 rounded-lg border cursor-pointer text-center hover-elevate",
                      chargeAmount === amount && !customAmount
                        ? "border-primary bg-accent"
                        : "border-border"
                    )}
                  >
                    <RadioGroupItem 
                      value={amount.toString()} 
                      id={`amount-${amount}`} 
                      className="sr-only"
                    />
                    <span className="font-medium">{formatCurrency(amount)}</span>
                  </Label>
                ))}
              </RadioGroup>

              <div className="space-y-2">
                <Label htmlFor="custom-amount">직접 입력</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="custom-amount"
                    type="number"
                    min={10000}
                    step={10000}
                    placeholder="금액 입력"
                    value={customAmount}
                    onChange={(e) => handleCustomAmountChange(e.target.value)}
                    data-testid="input-custom-amount"
                  />
                  <span className="text-muted-foreground whitespace-nowrap">원</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">현재 잔액</span>
                  <span className="font-medium">{formatCurrency(balance)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">충전 금액</span>
                  <span className="font-medium text-primary">+{formatCurrency(chargeAmount)}</span>
                </div>
                <hr className="my-2 border-border" />
                <div className="flex justify-between">
                  <span className="font-medium">충전 후 잔액</span>
                  <span className="font-bold text-success">{formatCurrency(balance + chargeAmount)}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsChargeDialogOpen(false)} disabled={chargeMutation.isPending}>
                취소
              </Button>
              <Button 
                disabled={chargeAmount < 10000 || chargeMutation.isPending}
                onClick={handleCharge}
                data-testid="button-confirm-charge"
              >
                {chargeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                {chargeMutation.isPending ? "결제 중..." : `${formatCurrency(chargeAmount)} 결제하기`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="현재 잔액"
          value={formatCurrency(balance)}
          description="사용 가능한 잔액"
          icon={Wallet}
          iconClassName="bg-primary/10"
        />
        <StatsCard
          title="총 충전액"
          value={formatCurrency(totalCharged)}
          description="누적 충전 금액"
          icon={ArrowUpRight}
          iconClassName="bg-success/10"
        />
        <StatsCard
          title="총 사용액"
          value={formatCurrency(totalUsed)}
          description="누적 사용 금액"
          icon={ArrowDownRight}
          iconClassName="bg-chart-5/10"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>거래 내역</CardTitle>
          <CardDescription>잔액 충전 및 사용 내역이에요</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b last:border-0">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="space-y-1">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0"
                  data-testid={`row-transaction-${transaction.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      transaction.type === 'charge' ? "bg-success/10" :
                      transaction.type === 'usage' ? "bg-primary/10" : "bg-chart-4/10"
                    )}>
                      {getTransactionIcon(transaction.type)}
                    </div>
                    <div>
                      <p className="font-medium">
                        {getTransactionLabel(transaction.type)}
                        {transaction.description && ` - ${transaction.description}`}
                      </p>
                      <p className="text-small text-muted-foreground">
                        {formatDateTime(transaction.createdAt!)}
                        {transaction.paymentMethod && ` · ${transaction.paymentMethod}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-medium",
                      transaction.type === 'charge' ? "text-success" :
                      transaction.type === 'refund' ? "text-chart-4" : "text-foreground"
                    )}>
                      {transaction.type === 'charge' || transaction.type === 'refund' ? '+' : '-'}
                      {formatCurrency(Math.abs(parseFloat(transaction.amount as string)))}
                    </p>
                    <p className="text-small text-muted-foreground">
                      잔액 {formatCurrency(transaction.balanceAfter)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CreditCard}
              title="거래 내역이 없어요"
              description="잔액을 충전하면 여기에 거래 내역이 표시돼요"
              action={{
                label: "잔액 충전하기",
                onClick: () => setIsChargeDialogOpen(true),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
