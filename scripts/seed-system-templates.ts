import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { pgTable, text, timestamp, integer, decimal, boolean } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

neonConfig.fetchConnectionCache = true;

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  companyName: text('company_name'),
  balance: decimal('balance', { precision: 12, scale: 0 }).default('0'),
  isVerified: boolean('is_verified').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
  rcsType: integer('rcs_type'),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageFileId: text('image_file_id'),
  status: text('status').default('approved'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const SYSTEM_USER_ID = 'system';

const systemTemplates = [
  {
    id: randomUUID(),
    userId: SYSTEM_USER_ID,
    name: '[음식점] 브랜드/이벤트 안내 템플릿',
    messageType: 'LMS',
    title: '[브랜드/이벤트명] 안내드립니다.',
    content: `(광고)[SKT] [브랜드/이벤트명] 안내

고객님, 안녕하세요.

[브랜드명]에서 [출시/특가/이벤트]을 안내드립니다.

아래 혜택을 확인하시고 이용해보세요.

▶ [이벤트 페이지 이동 CTA문구]: [URL]

■ [메인 상품/이벤트명] 혜택 안내

-장소: [전국 매장 / 특정 지역 / 온라인 등 입력]

-대상: 해당 문자 수신 고객(SKT)

-조건: [포장 한정 / 운영 시간 / 특정 메뉴 한정 등 입력]

혜택

① [혜택 내용 1 입력]

② [혜택 내용 2 입력]

③ [혜택 내용 3 입력]

■ 추가 이벤트 안내(있으면 입력)

-기간: [기간 입력]

-대상: 해당 문자 수신 고객(SKT)

혜택

① [이벤트 혜택 1 입력]

② [참여 조건 입력]

③ [당첨 기준 입력]

■ 문의: [고객센터 번호 입력]

※ 이 메시지는 SK텔레콤에서 혜택/광고 수신에 동의하신 고객님께 보내 드렸습니다.

감사합니다.

무료 수신거부 1504`,
    status: 'approved',
  },
  {
    id: randomUUID(),
    userId: SYSTEM_USER_ID,
    name: '[병원] 이벤트/시술 혜택 안내 템플릿',
    messageType: 'LMS',
    title: '[병원명] [이벤트명/시술명] 혜택 안내드립니다.',
    content: `(광고)[SKT] [병원명] [이벤트명/시술명] 혜택 안내


고객님, 안녕하세요.

[병원명]에서 [계절/기간 한정/특별] [이벤트명/시술명] 혜택을 안내드립니다.

■ [시술명/이벤트명] 혜택 안내

기간: [이벤트 기간 입력]

대상: 이 문자를 받고 신청하신 고객님

혜택

① [혜택1: ex. 시력교정술/피부관리/임플란트 할인]

② [혜택2: 정밀 검사/진단 지원]

③ [혜택3: 추가 제공되는 서비스/후관리 혜택]

(필요에 따라 2~5개까지 자유롭게 조정 가능)

■ [병원명] 특장점

[장비/기술력: ex. 최신 장비 보유, 정품 정량 사용]

[의료진: ex. 전문의 1:1 책임 진료]

[수술 방식/진료 철학: ex. 개인 맞춤형 프로그램]

[병원 특징: ex. 대학병원급 검사 시스템]

(병원별로 3~6개 정도 사용 가능)

▶ [이벤트/상담/예약] 신청하기: [URL]

■ 유의 사항

[프로모션 중복 불가 등 안내]

[검사 결과에 따른 치료 변경 가능 안내]

[병원 규정에 따른 추가 안내 사항]


■ 문의: [병원명] 고객센터([전화번호])

※ 이 메시지는 SK텔레콤에서 혜택/광고 수신에 동의하신 고객님께 보내 드렸습니다.

감사합니다.

무료 수신거부 1504`,
    status: 'approved',
  },
  {
    id: randomUUID(),
    userId: SYSTEM_USER_ID,
    name: '[분양] 아파트/오피스텔 분양 안내 템플릿',
    messageType: 'LMS',
    title: '<[분양 단지명]> 분양 안내드립니다.',
    content: `(광고)[SKT] <[분양 단지명]> 분양 안내

고객님, 안녕하세요.

수도권/지역 내 [입지 유형] 아파트 <[분양 단지명]> 분양을 안내드립니다.

모델 하우스 예약 방문하시고 [방문 혜택]을 받아 보세요.

▶ 모델 하우스 방문 예약하기: [URL]

■ 모델 하우스 방문 이벤트

기간: [이벤트 기간 입력]

대상: 해당 문자 수신 고객(SKT)

혜택: [제공 혜택] (선착순 [명]명)

■ 계약 혜택

① [계약 혜택 1]

② [계약 혜택 2]

③ [계약 혜택 3] (필요 없으면 삭제 가능)

■ <[분양 단지명]> 특장점

[주택형/오피스텔] 분양가: [가격대 입력]

1차 계약금 [금액] / 총 계약금 [비율]

[전매 가능 여부], [청약 통장 필요 여부], [실거주 의무 여부]

[입주 예정일]

[건물 규모: 지하~지상 / 동수 / 세대수]

[입지 포인트: 역세권, 공원 인접, 학군, 교통 등]

(항목은 자유롭게 추가·삭제 가능)


■ 문의: <[분양 단지명]> ([대표번호])

※ 이 메시지는 SK텔레콤에서 혜택/광고 수신에 동의하신 고객님께 보내 드렸습니다.

감사합니다.

무료 수신거부 1504`,
    status: 'approved',
  },
];

async function seedSystemTemplates() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const db = drizzle(neon(dbUrl));

  // 먼저 시스템 사용자가 존재하는지 확인하고, 없으면 생성
  console.log('Checking system user...');
  const existingUser = await db.select().from(users).where(eq(users.id, SYSTEM_USER_ID));
  
  if (existingUser.length === 0) {
    console.log('Creating system user...');
    await db.insert(users).values({
      id: SYSTEM_USER_ID,
      email: 'system@bizchat.wepick.kr',
      firstName: '시스템',
      lastName: '템플릿',
      companyName: 'BizChat System',
      isVerified: true,
    });
    console.log('  ✓ System user created');
  } else {
    console.log('  ✓ System user already exists');
  }

  console.log('Checking existing system templates...');
  
  const existing = await db.select().from(templates).where(eq(templates.userId, SYSTEM_USER_ID));
  
  if (existing.length > 0) {
    console.log(`Found ${existing.length} existing system templates. Deleting...`);
    await db.delete(templates).where(eq(templates.userId, SYSTEM_USER_ID));
  }

  console.log('Inserting system templates...');
  
  for (const template of systemTemplates) {
    await db.insert(templates).values(template);
    console.log(`  ✓ Created: ${template.name}`);
  }

  console.log('\n✅ System templates seeded successfully!');
}

seedSystemTemplates().catch(console.error);
