# SK코어타겟 비즈챗 (BizChat) 광고 관리 플랫폼

## Overview
SK코어타겟 비즈챗은 SK 통신사 가입자 대상 문자 광고 플랫폼입니다. 영세 자영업자가 최소 10만원으로 LMS/MMS/RCS 캠페인을 생성하고 SK CoreTarget 기반 타겟팅으로 효과적인 광고를 발송할 수 있습니다.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Authentication**: Replit Auth (OIDC)
- **UI**: shadcn/ui + Tailwind CSS + Lucide Icons
- **State Management**: TanStack Query v5
- **Routing**: Wouter

## Project Structure
```
├── client/
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/          # shadcn/ui components
│   │   │   ├── app-sidebar.tsx
│   │   │   ├── campaign-status-badge.tsx
│   │   │   ├── stats-card.tsx
│   │   │   ├── empty-state.tsx
│   │   │   ├── theme-provider.tsx
│   │   │   └── theme-toggle.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.ts    # Authentication hook
│   │   ├── lib/
│   │   │   ├── authUtils.ts  # Auth & formatting utilities
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   ├── landing.tsx   # Landing page (unauthenticated)
│   │   │   ├── dashboard.tsx # Dashboard (authenticated)
│   │   │   ├── campaigns.tsx # Campaign list
│   │   │   ├── campaigns-new.tsx # Campaign wizard
│   │   │   ├── billing.tsx   # Balance management
│   │   │   └── reports.tsx   # Analytics & reports
│   │   └── App.tsx           # Main app with routing
│   └── index.html
├── server/
│   ├── db.ts                 # Database connection
│   ├── storage.ts            # Data access layer
│   ├── routes.ts             # API endpoints
│   ├── replitAuth.ts         # Replit Auth setup
│   └── index.ts              # Server entry point
├── shared/
│   └── schema.ts             # Database schema & types
├── design_guidelines.md      # UI/UX design system
└── tailwind.config.ts
```

## Database Schema
- **users**: User accounts with balance
- **campaigns**: Advertising campaigns (LMS/MMS/RCS)
- **messages**: Campaign message content
- **targeting**: Audience targeting settings (gender, age, regions)
- **transactions**: Balance charge/usage history
- **reports**: Campaign performance metrics
- **sessions**: Authentication sessions

## API Endpoints
- `GET /api/auth/user` - Current user info
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/campaigns` - List user campaigns
- `GET /api/campaigns/:id` - Campaign details
- `POST /api/campaigns` - Create campaign
- `PATCH /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete draft campaign
- `GET /api/transactions` - Balance history
- `POST /api/transactions/charge` - Add balance
- `POST /api/campaigns/:id/submit` - Submit for approval

## Design System
See `design_guidelines.md` for complete design specifications:
- **Primary Color**: #FF6F0F (당근 오렌지)
- **Font**: Pretendard Variable
- **Border Radius**: 8px (rounded-lg)
- **UX Writing**: Friendly 반말 tone (당근마켓 스타일)

## Development
```bash
npm run dev      # Start development server (port 5000)
npm run db:push  # Push schema changes to database
```

## Key Features (MVP)
1. **Landing Page**: Attractive marketing page with login CTA
2. **Dashboard**: Campaign overview, stats, quick actions
3. **Campaign Wizard**: 4-step creation flow (info → message → targeting → budget)
4. **Campaign List**: Filter, search, and manage campaigns
5. **Billing**: Balance charging and transaction history
6. **Reports**: Campaign performance analytics

## Recent Changes
- Initial MVP implementation with all core pages
- Replit Auth integration for user authentication
- PostgreSQL database with Drizzle ORM
- Dark mode support with theme toggle
- Korean localization for all UI text

## User Preferences
- Korean language (한국어) for all UI text
- 당근마켓-inspired friendly UX writing tone
- Support for both light and dark modes
- Mobile-responsive design
