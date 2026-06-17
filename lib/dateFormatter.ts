/**
 * Akıllı tarih formatting
 * 1 → 01 → 01.0 → 01.01 → 01.01.2 → ... → 01.01.2024
 * Backspace'de noktaları düzgün siliyor
 */
export function formatDateInput(value: string, prevValue: string = ""): string {
  // Sadece sayıları al
  const digits = value.replace(/\D/g, '');
  
  // Max 8 digit (GG.AA.YYYY)
  const limited = digits.slice(0, 8);
  
  // Format: XX.XX.XXXX
  let formatted = '';
  
  if (limited.length > 0) {
    // Gün (2 digit)
    formatted = limited.slice(0, 2);
    
    if (limited.length > 2) {
      formatted += '.' + limited.slice(2, 4);
    }
    
    if (limited.length > 4) {
      formatted += '.' + limited.slice(4, 8);
    }
  }
  
  return formatted;
}

/**
 * GG.AA.YYYY → YYYY-MM-DD (ISO format)
 */
export function parseDate(str: string): string {
  if (!str) return '';
  
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      
      // Basit validasyon
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  
  return str.match(/^\d{4}-\d{2}-\d{2}$/) ? str : '';
}

/**
 * YYYY-MM-DD → GG.AA.YYYY (Display format)
 */
export function formatDateDisplay(isoDate: string): string {
  if (!isoDate || !isoDate.match(/^\d{4}-\d{2}-\d{2}$/)) return '';
  
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * ISO date'i takvim input'u için ayarla
 */
export function dateToInputFormat(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${year}-${month}-${day}`;
}
