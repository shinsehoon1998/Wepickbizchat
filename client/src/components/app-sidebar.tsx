import {
  LayoutDashboard,
  Megaphone,
  PlusCircle,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/authUtils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const mainNavItems = [
  {
    title: "대시보드",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "캠페인 만들기",
    url: "/campaigns/new",
    icon: PlusCircle,
  },
  {
    title: "캠페인 목록",
    url: "/campaigns",
    icon: Megaphone,
  },
];

const subNavItems = [
  {
    title: "잔액 관리",
    url: "/billing",
    icon: Wallet,
  },
  {
    title: "리포트",
    url: "/reports",
    icon: BarChart3,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const balance = user?.balance ? parseFloat(user.balance as string) : 0;
  const displayName = user?.firstName 
    ? `${user.firstName}${user.lastName || ''}`
    : user?.email?.split('@')[0] || '사용자';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <button 
          onClick={() => navigate("/")} 
          className="flex items-center gap-2 w-full text-left" 
          data-testid="link-logo"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
            SK
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-sidebar-foreground">SK코어타겟</span>
            <span className="text-tiny text-muted-foreground">비즈챗 광고관리</span>
          </div>
        </button>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">광고 관리</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location === item.url || (item.url !== '/' && location.startsWith(item.url))}
                    className="data-[active=true]:bg-sidebar-accent cursor-pointer"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">설정</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {subNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location === item.url}
                    className="data-[active=true]:bg-sidebar-accent cursor-pointer"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">광고 잔액</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-3 py-2">
              <div className="rounded-lg bg-accent p-3">
                <div className="text-tiny text-muted-foreground mb-1">사용 가능 잔액</div>
                <div className="text-h2 font-bold text-foreground" data-testid="text-balance">
                  {formatCurrency(balance)}
                </div>
                <button 
                  onClick={() => navigate("/billing")}
                  className="text-tiny text-primary hover:underline cursor-pointer" 
                  data-testid="link-charge"
                >
                  충전하기
                </button>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-auto py-3"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-tiny">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-small font-medium">{displayName}</span>
                    <span className="text-tiny text-muted-foreground truncate max-w-[140px]">
                      {user?.email || '이메일 없음'}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-popper-anchor-width]"
              >
                <DropdownMenuItem 
                  onClick={() => navigate("/settings")}
                  className="cursor-pointer"
                  data-testid="link-settings"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  <span>설정</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/api/logout" className="flex items-center gap-2 text-destructive" data-testid="link-logout">
                    <LogOut className="h-4 w-4" />
                    <span>로그아웃</span>
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
