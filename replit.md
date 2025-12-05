# wepick x SKT 비즈챗 (BizChat) 광고 관리 플랫폼

## Overview
wepick x SKT 비즈챗은 SK텔레콤 광고 수신 동의 고객 1,600만 명 대상 문자 광고 플랫폼입니다. 영세 자영업자가 최소 10만원으로 LMS/MMS/RCS 캠페인을 생성하고 SK CoreTarget 기반 타겟팅으로 효과적인 광고를 발송할 수 있습니다.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Vercel Serverless Functions (Edge-compatible)
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Authentication**: Supabase Auth (JWT-based)
- **UI**: shadcn/ui + Tailwind CSS + Lucide Icons
- **State Management**: TanStack Query v5
- **Routing**: Wouter
- **Deployment**: Vercel

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
│   │   │   └── theme-provider.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts    # Supabase Authentication hook
│   │   │   └── useSupabaseAuth.ts # Low-level Supabase auth hook
│   │   ├── lib/
│   │   │   ├── supabase.ts   # Supabase client
│   │   │   ├── queryClient.ts # React Query setup with auth headers
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   ├── landing.tsx   # Landing page (unauthenticated)
│   │   │   ├── auth.tsx      # Login/Signup page
│   │   │   ├── dashboard.tsx # Dashboard (authenticated)
│   │   │   ├── campaigns.tsx # Campaign list
│   │   │   ├── campaigns-new.tsx # Campaign wizard
│   │   │   ├── billing.tsx   # Balance management
│   │   │   └── reports.tsx   # Analytics & reports
│   │   └── App.tsx           # Main app with routing
│   └── index.html
├── api/                      # Vercel Serverless Functions
│   ├── auth/
│   │   └── user.ts          # GET /api/auth/user
│   ├── campaigns/
│   │   ├── index.ts         # GET/POST /api/campaigns
│   │   ├── [id].ts          # GET/PATCH/DELETE /api/campaigns/:id
│   │   └── [id]/
│   │       └── submit.ts    # POST /api/campaigns/:id/submit (BizChat 연동)
│   ├── bizchat/
│   │   ├── test.ts          # POST /api/bizchat/test
│   │   ├── campaigns.ts     # POST /api/bizchat/campaigns (생성/승인/통계/MDN/결과)
│   │   ├── ats.ts           # POST /api/bizchat/ats (타겟 모수 조회)
│   │   ├── file.ts          # POST /api/bizchat/file (파일 업로드)
│   │   ├── sender.ts        # POST /api/bizchat/sender (발신번호 관리)
│   │   ├── template.ts      # POST /api/bizchat/template (템플릿 관리)
│   │   └── callback/
│   │       └── state.ts     # POST /api/bizchat/callback/state
│   ├── dashboard/
│   │   └── stats.ts         # GET /api/dashboard/stats
│   ├── templates/
│   │   ├── index.ts         # GET/POST /api/templates
│   │   ├── [id].ts          # GET/PATCH/DELETE /api/templates/:id
│   │   ├── [id]/approve.ts  # POST /api/templates/:id/approve
│   │   ├── [id]/reject.ts   # POST /api/templates/:id/reject
│   │   ├── [id]/submit.ts   # POST /api/templates/:id/submit
│   │   └── approved.ts      # GET /api/templates/approved
│   ├── transactions/
│   │   ├── index.ts         # GET /api/transactions
│   │   └── charge.ts        # POST /api/transactions/charge
│   ├── targeting/
│   │   └── estimate.ts      # POST /api/targeting/estimate
│   ├── stripe/
│   │   ├── config.ts        # GET /api/stripe/config
│   │   ├── checkout.ts      # POST /api/stripe/checkout
│   │   └── webhook.ts       # POST /api/stripe/webhook
│   └── lib/
│       ├── auth.ts          # JWT verification with Supabase
│       ├── db.ts            # Neon database connection
│       └── storage.ts       # Data access layer
├── server/                   # Legacy Express server (for local dev)
│   ├── db.ts
│   ├── storage.ts
│   ├── routes.ts
│   └── index.ts
├── shared/
│   └── schema.ts             # Database schema & types
├── vercel.json               # Vercel deployment config
├── design_guidelines.md      # UI/UX design system
└── tailwind.config.ts
```

## Database Schema
- **users**: User accounts with balance and Supabase user ID
- **campaigns**: Advertising campaigns (LMS/MMS/RCS)
- **messages**: Campaign message content
- **targeting**: Audience targeting settings (gender, age, regions)
- **transactions**: Balance charge/usage history
- **templates**: Message templates with approval workflow
- **reports**: Campaign performance metrics

## API Endpoints (Vercel Serverless)
- `GET /api/auth/user` - Current user info (JWT auth)
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/campaigns` - List user campaigns
- `GET /api/campaigns/:id` - Campaign details
- `POST /api/campaigns` - Create campaign
- `PATCH /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete draft campaign
- `GET /api/templates` - List user templates
- `POST /api/templates` - Create template
- `GET /api/templates/:id` - Template details
- `PATCH /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `POST /api/templates/:id/submit` - Submit for approval
- `POST /api/templates/:id/approve` - Approve template (simulation)
- `POST /api/templates/:id/reject` - Reject template
- `GET /api/templates/approved` - Get approved templates
- `GET /api/transactions` - Balance history
- `POST /api/transactions/charge` - Add balance (mock)
- `POST /api/targeting/estimate` - Estimate target audience size
- `GET /api/stripe/config` - Get Stripe publishable key
- `POST /api/stripe/checkout` - Create Stripe checkout session
- `POST /api/stripe/webhook` - Stripe webhook handler

## Authentication
Using Supabase Auth with JWT tokens:
- Frontend uses `@supabase/supabase-js` for login/signup
- Backend verifies JWT tokens using Supabase service role key
- All authenticated API requests include `Authorization: Bearer <token>` header
- User data synced between Supabase Auth and local users table

## Environment Variables
Required for Vercel deployment:
```
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
DATABASE_URL=<neon-database-url>
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_PUBLISHABLE_KEY=<stripe-publishable-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret> (optional)
```

Frontend environment variables (must be prefixed with VITE_):
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Design System
See `design_guidelines.md` for complete design specifications:
- **Primary Color**: #E84040 (SKT 레드)
- **Font**: Pretendard Variable
- **Border Radius**: 8px (rounded-lg)
- **UX Writing**: Friendly 반말 tone (당근마켓 스타일)
- **Logo**: wepick x SKT 브랜드 로고

## Development
```bash
npm run dev      # Start development server (port 5000) - uses Express
npm run build    # Build for Vercel deployment
npm run db:push  # Push schema changes to database
```

## Deployment
The project is configured for Vercel deployment:
1. Connect to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy (auto-builds on push)

## Key Features (MVP)
1. **Landing Page**: SKT 비즈챗 서비스 소개 및 로그인 CTA
2. **Auth Page**: Supabase 이메일/비밀번호 로그인 및 회원가입
3. **Dashboard**: Campaign overview, stats, quick actions
4. **Template System**: 템플릿 작성 → 검수 요청 → 승인/반려 워크플로우
5. **Campaign Wizard**: 3-step creation flow (템플릿 선택 → 타겟팅 → 예산)
6. **Campaign List**: Filter, search, and manage campaigns
7. **Billing**: Balance charging and transaction history (Stripe integration)
8. **Reports**: Campaign performance analytics

## BizChat API Integration (v0.29.0)
SK텔레콤 BizChat 3rd Party API와 연동하여 실제 문자 광고 발송을 처리합니다.

### API Endpoints
- **POST /api/bizchat/test** - API 연결 테스트 (발신번호/캠페인/ATS 메타)
- **POST /api/bizchat/campaigns** - 캠페인 관리 (create/update/approve/test/testCancel/testResult/stats/cancel/stop/delete/mdn/result/verifyMdn/list)
- **POST /api/bizchat/callback/state** - 캠페인 상태 변경 콜백
- **POST /api/bizchat/ats** - ATS 타겟 모수 조회 (meta/count/filter)
- **POST /api/bizchat/file** - 파일 업로드 (MMS 이미지)
- **POST /api/bizchat/sender** - 발신번호 조회 (읽기 전용, BizChat에서 관리되는 발신번호 목록 조회)
- **POST /api/bizchat/template** - BizChat 템플릿 관리 (list/create/read/update/delete/submit)
- **POST /api/bizchat/ai** - AI 문구 생성/검증/고언연 검수 (generate/check/gounInspect/gounResult)

### Environment Variables (BizChat)
```
BIZCHAT_DEV_API_KEY=<개발 API 키>
BIZCHAT_PROD_API_KEY=<운영 API 키>
BIZCHAT_CALLBACK_AUTH_KEY=<콜백 인증 키>
```

### API 규격 (v0.29.0)
- 모든 API 요청에 `tid` Query Parameter 필수 (밀리초 타임스탬프)
- 성공 응답 코드: `S000001`
- 캠페인 상태 코드: 0=임시등록, 1=검수요청, 2=검수완료, 10=승인요청, 11=승인완료, 17=반려, 20=발송준비, 25=취소, 30=진행중, 35=중단, 40=종료
- 콜백 페이로드: `{id, state, stateUpdateDate, stateReason}`
- 발송 시간 규칙: 09:00~20:00, 최소 1시간 전, 10분 단위 정각 (예: 11:20, 11:30)
- 수정 가능 상태: 임시등록(0), 검수완료(2), 반려(17)

### 캠페인 발송 플로우
1. 캠페인 저장 → 로컬 DB에 저장
2. 발송 요청 (`/api/campaigns/:id/submit`) → BizChat 캠페인 생성 + 승인 요청
3. 상태 콜백 → BizChat에서 상태 변경 시 `/api/bizchat/callback/state` 호출

### 캠페인 액션 상세
- **create**: BizChat에 캠페인 생성 (발송 시간 검증 포함)
- **update**: 캠페인 수정 (상태 0,2,17만 가능, 발송 시간 검증)
- **approve**: 승인 요청
- **test/testCancel/testResult**: 테스트 발송/취소/결과조회
- **stats**: 실시간 통계 조회
- **cancel/stop**: 캠페인 취소/중단
- **delete**: 캠페인 삭제 (상태 0만 가능)
- **mdn/result**: MDN 목록/발송 결과 조회
- **verifyMdn**: MDN 파일 검증 (rcvType=10)
- **list**: BizChat측 캠페인 목록 조회

### AI 기능
- **generate**: 가이드라인(10자+)을 입력하면 광고 문구 자동 생성
- **check**: 제목/본문 검증 및 수정 제안 (차이점 delta 포함)
- **gounInspect**: 고언연 검수 요청 (캠페인 시작 2.5일 전 필요)
- **gounResult**: 고언연 검수 결과 확인

## Recent Changes
- Migrated from Express.js to Vercel Serverless Functions
- Replaced Replit Auth with Supabase Auth (JWT-based)
- Created /api folder with serverless function handlers
- Updated frontend auth hooks to use Supabase
- Added auth page with login/signup forms
- Updated queryClient to include JWT auth headers
- Configured vercel.json for deployment
- Stripe integration for real balance charging
- Idempotent webhook handling to prevent duplicate credits
- Korean localization for all UI text
- **BizChat API Integration**: 캠페인 생성/승인요청/상태콜백 연동 (2024-12-05)
- **BizChat API 확장** (2024-12-05):
  - ATS 타겟 모수 조회 API (meta/count/filter)
  - 캠페인 MDN 목록 및 결과 조회 API
  - 파일 업로드 API (MMS 이미지)
  - BizChat 템플릿 관리 API (CRUD + submit)
  - 발송 시간 유효성 검증 (09:00~20:00, 1시간 여유 필수)
- **프론트엔드 BizChat 연동** (2024-12-05):
  - targeting/estimate.ts: BizChat ATS API 연동으로 실시간 타겟 모수 조회 (fallback 포함)
  - campaign-detail.tsx: 성과 탭에 BizChat 실시간 통계 조회 UI 추가
  - sender-numbers.tsx: BizChat 등록 발신번호 조회 기능 추가
- **발신번호 아키텍처 개선** (2024-12-05):
  - 로컬 발신번호 CRUD 제거 (BizChat에서 관리되는 발신번호만 사용)
  - senderNumbers/userSenderNumbers 테이블 및 관련 코드 삭제
  - sender-numbers.tsx: BizChat 발신번호 조회 전용 페이지로 변경
  - campaigns-new.tsx: BizChat API를 통한 발신번호 선택 연동
- **BizChat API v0.29.0 완전 준수** (2024-12-05):
  - 캠페인 수정(update) 액션 추가 (상태 0,2,17 검증)
  - 발송 시간 10분 단위 정각 검증 추가
  - delete, testCancel, testResult, verifyMdn, list 액션 추가
  - 캠페인 생성 파라미터 확장 (sndMosuDesc, sndMosuQuery, retarget, coupon, Maptics 등)
  - AI API 엔드포인트 추가 (generate/check/gounInspect/gounResult)
  - 모든 핸들러 BizChat 에러 코드 전파 개선
  - 발신번호 코드 매핑 완벽 구현 (001001=16700823, 001005=16702305)
  - 테스트 발송 MDN 형식 검증 및 에러 처리 개선

## User Preferences
- Korean language (한국어) for all UI text
- 당근마켓-inspired friendly UX writing tone
- Light mode only
- Mobile-responsive design
