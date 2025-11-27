export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export const CAMPAIGN_STATUS = {
  DRAFT: 5,
  APPROVAL_REQUESTED: 10,
  APPROVED: 11,
  REJECTED: 17,
  SEND_PREPARATION: 20,
  CANCELLED: 25,
  IN_PROGRESS: 30,
  STOPPED: 35,
  COMPLETED: 40,
} as const;

export function getStatusCodeLabel(statusCode: number): string {
  const labels: Record<number, string> = {
    [CAMPAIGN_STATUS.DRAFT]: '초안',
    [CAMPAIGN_STATUS.APPROVAL_REQUESTED]: '검수 중',
    [CAMPAIGN_STATUS.APPROVED]: '발송 대기',
    [CAMPAIGN_STATUS.REJECTED]: '반려됨',
    [CAMPAIGN_STATUS.SEND_PREPARATION]: '발송 준비중',
    [CAMPAIGN_STATUS.CANCELLED]: '취소됨',
    [CAMPAIGN_STATUS.IN_PROGRESS]: '발송 중',
    [CAMPAIGN_STATUS.STOPPED]: '발송 중단',
    [CAMPAIGN_STATUS.COMPLETED]: '발송 완료',
  };
  return labels[statusCode] || `상태 ${statusCode}`;
}

export function getStatusCodeStyles(statusCode: number): string {
  if (statusCode === CAMPAIGN_STATUS.DRAFT) {
    return 'bg-muted text-muted-foreground border-muted-border';
  }
  if (statusCode === CAMPAIGN_STATUS.APPROVAL_REQUESTED) {
    return 'bg-warning/10 text-warning border-warning/20';
  }
  if (statusCode === CAMPAIGN_STATUS.APPROVED) {
    return 'bg-success/10 text-success border-success/20';
  }
  if (statusCode === CAMPAIGN_STATUS.REJECTED) {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (statusCode === CAMPAIGN_STATUS.SEND_PREPARATION) {
    return 'bg-accent text-accent-foreground border-accent-border';
  }
  if (statusCode === CAMPAIGN_STATUS.CANCELLED) {
    return 'bg-muted text-muted-foreground border-muted-border';
  }
  if (statusCode === CAMPAIGN_STATUS.IN_PROGRESS) {
    return 'bg-primary/10 text-primary border-primary/20';
  }
  if (statusCode === CAMPAIGN_STATUS.STOPPED) {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (statusCode === CAMPAIGN_STATUS.COMPLETED) {
    return 'bg-success/10 text-success border-success/20';
  }
  return 'bg-muted text-muted-foreground border-muted-border';
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  return new Intl.NumberFormat('ko-KR').format(n);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '초안',
    pending: '승인 대기',
    approved: '승인 완료',
    running: '발송 중',
    completed: '완료',
    rejected: '반려',
    cancelled: '취소',
  };
  return labels[status] || status;
}

export function getMessageTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    LMS: '장문 문자 (LMS)',
    MMS: '이미지 문자 (MMS)',
    RCS: 'RCS 메시지',
  };
  return labels[type] || type;
}
