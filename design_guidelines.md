# wepick x SKT 비즈챗 광고 관리 플랫폼 - Design Guidelines

## Design Reference
**Primary Inspiration**: SKT 브랜드 가이드라인 + 비즈챗 서비스
- Friendly, approachable tone in all UX writing
- Intuitive workflows that make complex advertising tasks feel simple
- Clear visual hierarchy with warm, accessible design language
- Trust-building through transparency and helpful guidance

## Color System
```
Primary: #E84040 (SKT 레드) - CTAs, active states, highlights (HSL: 8 85% 52%)
Secondary: #212529 (진한 회색) - Headers, primary text
Background: #F8F9FA (연한 회색) - Page backgrounds
Success: #28A745 (초록) - Success messages, positive metrics
Text: #495057 (중간 회색) - Body text, labels
Accent: #FFEBEB (연한 레드) - Badges, hover states, soft highlights
White: #FFFFFF - Card backgrounds, input fields
```

## Typography
**Font Stack**: Pretendard, "Apple SD Gothic Neo", -apple-system, sans-serif

**Scale**:
- Display (32px, bold): Page titles, dashboard headers
- Heading 1 (24px, bold): Section headers, card titles
- Heading 2 (20px, semi-bold): Subsection headers
- Heading 3 (18px, semi-bold): Component titles
- Body (16px, regular): Default body text
- Small (14px, regular): Helper text, labels
- Tiny (12px, regular): Captions, metadata

## Layout System
**Spacing Units** (Tailwind equivalents):
- Use 4px (p-1), 8px (p-2), 16px (p-4), 24px (p-6), 32px (p-8) consistently
- Primary spacing: 16px for component padding
- Section spacing: 32px between major sections
- Card spacing: 16px internal padding

**Grid System**:
- Desktop: 3-column grid for stats/cards (max-w-7xl container)
- Tablet: 2-column layout
- Mobile: Single column stack

**Border Radius**: 8px for all cards, buttons, inputs (rounded-lg)

## Component Library

### Navigation
- **Top Navigation Bar**: Fixed header with logo, main navigation, user profile dropdown, balance indicator
- **Sidebar** (Desktop): Collapsible left sidebar with icon + text navigation items
- Height: 64px top nav, full-height sidebar
- Shadow: Subtle shadow on fixed elements

### Cards
- White background (#FFFFFF)
- 8px border radius
- 16px padding
- Subtle shadow: `shadow-sm` (lifted feel)
- Hover state: Slight shadow increase on interactive cards

### Buttons
**Primary** (SKT Red):
- Background: #E84040
- Text: White
- Padding: 12px 24px
- Border radius: 8px
- Hover: Slightly darker red
- Used for: Main actions, campaign creation, payment

**Secondary** (Outlined):
- Border: 1px solid #E5E7EB
- Background: White
- Text: #212529
- Hover: Light gray background

**Tertiary** (Text only):
- No background/border
- Text: #E84040
- Hover: Underline

### Form Inputs
- Height: 44px (comfortable touch target)
- Border: 1px solid #E5E7EB
- Border radius: 8px
- Padding: 12px 16px
- Focus state: Red border (#E84040), subtle shadow
- Labels: 14px, #495057, positioned above input

### Dashboard Components

**Stats Cards**:
- Grid layout (3 columns on desktop)
- Icon + metric + label format
- Large number display (24px bold)
- Colored icons matching metric type (success green, primary orange)

**Charts**:
- Use Recharts with brand colors
- Clean, minimal gridlines
- Tooltips with detailed information
- Time series for campaign performance

**Campaign Status Badges**:
- Pill shape with colored backgrounds
- Draft: Gray (#6B7280)
- Pending: Yellow (#FCD34D)
- Running: Red (#E84040)
- Completed: Green (#28A745)
- Rejected: Red (#DC2626)

### Campaign Creation Workflow

**Multi-step Progress Indicator**:
- Horizontal stepper at top
- Red for active/completed steps
- Gray for upcoming steps
- Step labels: "템플릿 선택" → "타겟 설정" → "예산 확인"

**Message Editor**:
- Split view: Editor on left, Preview on right (desktop)
- Character counter with visual indicator
- Image upload with drag-and-drop
- Phone mockup preview for LMS/MMS/RCS

**Targeting Interface**:
- Filter cards with toggle switches
- Real-time audience count estimate (large, prominent number)
- Visual representation of selected filters
- Helpful tooltips explaining each option

## UX Writing Tone
**Principles** (당근마켓 스타일):
- 반말 사용 (친근한 존댓말 없는 톤)
- 이모지 활용 (적절히, 과하지 않게)
- 명확하고 간결한 설명
- 긍정적이고 격려하는 메시지

**Examples**:
- "캠페인 만들기" (not "캠페인을 생성하세요")
- "타겟이 몇 명인지 확인해봤어요" (friendly estimate)
- "잔액이 부족해요. 충전하고 시작해볼까요?" (helpful, not punitive)
- Success: "캠페인이 만들어졌어요! 🎉"

## Mobile Responsive Strategy
- Bottom navigation bar for mobile (<768px)
- Collapsible filters with slide-out drawer
- Stack all multi-column layouts to single column
- Touch-friendly: Minimum 44px touch targets
- Swipeable cards for campaign lists

## Images & Media
**Hero Section**: Not applicable (dashboard app)

**Campaign Preview Images**:
- Phone mockup frames for message previews
- Support for uploaded MMS images (max 300KB, JPG/PNG)
- Placeholder images for empty states

**Empty States**:
- Friendly illustrations with encouraging text
- "아직 캠페인이 없어요. 첫 캠페인을 만들어볼까요?"
- Prominent CTA button to create first campaign

## Animations
**Minimal, purposeful animations**:
- Page transitions: Subtle fade (150ms)
- Card hover: Slight elevation increase
- Button click: Scale down slightly (95%)
- Loading states: Red spinner with brand color
- Success notifications: Slide in from top

## Accessibility
- Sufficient color contrast (WCAG AA minimum)
- Focus indicators on all interactive elements
- Semantic HTML structure
- Screen reader friendly labels
- Keyboard navigation support