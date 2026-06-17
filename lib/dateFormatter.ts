/**
 * Tarih auto-formatting - 8 sınırı + otomatik noktalar
 * 25011977 → 25.01.1977
 */
export function formatDateInput(value: string): string {
  let cleaned = value.replace(/\D/g, '');
  cleaned = cleaned.slice(0, 8);
  
  if (cleaned.length >= 2) {
    cleaned = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
  }
  if (cleaned.length >= 5) {
    cleaned = cleaned.slice(0, 5) + '.' + cleaned.slice(5);
  }
  
  return cleaned;
}

/**
 * GG.AA.YYYY → YYYY-MM-DD
 */
export function parseDate(str: string): string {
  if (!str) return '';
  
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  
  return str.match(/^\d{4}-\d{2}-\d{2}$/) ? str : '';
}
