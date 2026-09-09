export function calculateLoan(principal: number, interestRate: number): number {
  return Math.round(principal * (1 + interestRate) * 100) / 100;
}

export function canTopUp(repaid: number, total: number): boolean {
  if (total <= 0) return false;
  return (repaid / total) >= 0.7;
}

export function calculateWeeklyInstallment(total: number, duration: number): number {
  return Math.round((total / duration) * 100) / 100;
}
