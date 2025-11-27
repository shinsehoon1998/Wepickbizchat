import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconClassName,
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("hover-elevate", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-small text-muted-foreground mb-1">{title}</p>
            <p className="text-h1 font-bold tracking-tight truncate" data-testid={`text-stat-${title.replace(/\s/g, '-')}`}>
              {value}
            </p>
            {description && (
              <p className="text-tiny text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <p className={cn(
                "text-tiny mt-1",
                trend.isPositive ? "text-success" : "text-destructive"
              )}>
                {trend.isPositive ? '+' : ''}{trend.value}% 지난 달 대비
              </p>
            )}
          </div>
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
            iconClassName || "bg-primary/10"
          )}>
            <Icon className={cn(
              "h-5 w-5",
              iconClassName ? "" : "text-primary"
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
