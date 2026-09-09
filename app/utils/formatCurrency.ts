export function formatCurrency(n: number, currency = 'KES'): string {
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${currency} ${(n / 1000).toFixed(0)}K`;
  return `${currency} ${n.toLocaleString()}`;
}

export function formatKsh(n: number): string {
  return formatCurrency(n, 'KES');
}

export function formatFullKsh(n: number): string {
  return `KES ${n.toLocaleString()}`;
}