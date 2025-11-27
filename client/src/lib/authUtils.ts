export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
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
