export type UserRole = 'manager' | 'supervisor' | 'officer' | 'user';

export interface AppUser {
  id: string;
  fullName: string;
  telephone: string;
  idNumber: string;
  pfNumber: string;
  branch: string;
  role: UserRole;
  assignment: string;
  email: string;
  avatar?: string;
  isVerified?: boolean;
  isSuspended?: boolean;
  suspensionReason?: string | null;
  suspendedAt?: string | null;
  creditScore?: number;
  loanLimit?: number;
  currentLoanBalance?: number;
  createdAt: string;
}

export type CustomerType = 'Micro-Enterprise' | 'Chama';
export type LoanStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'disbursed'
  | 'closed'
  | 'under_review';
export type LoanType = 'Starter' | 'Top-up';

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  phone: string;
  alternativePhone?: string;
  idNumber: string;
  county: string;
  subcounty: string;
  ward: string;
  village: string;
  chiefName: string;
  maritalStatus?: string;
  spouseName?: string;
  spousePhone?: string;
  economicActivity: string;
  monthlyIncome: number;
  createdAt: string;
  creditOfficer: string;
}

export interface LoanApplication {
  id: string;
  loanNumber: string;
  customerId: string;
  customerName: string;
  county: string;
  loanType: LoanType;
  principal: number;
  total: number;
  weeklyInstallment: number;
  duration: number;
  status: LoanStatus;
  appliedDate: string;
  approvedDate?: string;
  disbursedDate?: string;
  creditOfficer: string;
  declineReason?: string;
}

export interface RepaymentEntry {
  id: string;
  date: string;
  amountPaid: number;
  remainingBalance: number;
  nextPaymentDate: string;
}

export interface LoanRepayment {
  id: string;
  loanNumber: string;
  customerName: string;
  loanAmount: number;
  appliedDate: string;
  approvedDate: string;
  disbursedDate: string;
  duration: number;
  entries: RepaymentEntry[];
}

export type InquiryStatus =
  | 'new'
  | 'contacted'
  | 'in_progress'
  | 'completed'
  | 'closed';

export type InquiryType = 'Loan Limit' | 'Balance';

export interface LoanInquiry {
  id: string;
  name: string;
  telephone: string;
  county: string;
  location: string;
  date: string;
  inquiryType: InquiryType;
}

export interface BulkSMS {
  message: string;
  recipients: 'All' | 'Filtered';
}

export interface GlobalSettings {
  maxLoanAmount: number;
  repaymentPeriod: number;
  interestRate: number;
}

export interface ChartData {
  label: string;
  value: number;
}

export interface ChamaGroup {
  name: string;
  chairpersonPhone: string;
  alternativePhone: string;
  registrationCertNumber: string;
  village: string;
  chiefName: string;
  county: string;
  members: ChamaMember[];
}

export interface ChamaMember {
  id: string;
  name: string;
  idNumber: string;
  phone: string;
  isOfficial: boolean;
}

export interface OtpSendRequest {
  phone?: string;
  email?: string;
  purpose: string;
}

export interface OtpVerifyRequest {
  phone?: string;
  email?: string;
  code: string;
  purpose: string;
}

export interface OtpResponse {
  message: string;
  expiresIn: number;
  debugTarget?: string;
  debugCode?: string;
}

export interface ProfileUpdateRequest {
  fullName: string;
  telephone: string;
  email: string;
  branch: string;
  assignment: string;
}

export interface QualificationAnswer {
  id: string;
  userId: string;
  customerType: string;
  educationLevel: string;
  employmentStatus: string;
  monthlyIncome: number;
  hasExistingLoans: boolean;
  existingLoanDetails?: string;
  collateralAvailable: boolean;
  businessType?: string;
  chamaName?: string;
  yearsInBusiness?: number;
  createdAt: string;
  updatedAt: string;
}

export interface QualificationRequest {
  customerType: string;
  educationLevel: string;
  employmentStatus: string;
  monthlyIncome: number;
  hasExistingLoans: boolean;
  existingLoanDetails?: string;
  collateralAvailable: boolean;
  businessType?: string;
  chamaName?: string;
  yearsInBusiness?: number;
}

export interface QualificationResult {
  qualifies: boolean;
  reason: string;
  recommendedLoanAmount: number;
}
