import { formatKsh } from "@/utils/formatCurrency";
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmModal } from '@/components/ConfirmModal';
import { EmptyState } from '@/components/EmptyState';
import { OfflineScreen } from '@/components/OfflineScreen';
import { ApiError } from '@/components/ApiError';
import { useApiLoanApplications, useApiLoanRepayments, useApiInquiries, useApiUpdateLoanStatus, useApiMyLoanInfo, useApiCreateCustomer, useApiCreateInquiry } from '@/hooks/useApiQueries';
import { useApiMpesaStk } from '@/hooks/useApiQueries';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRole } from '@/hooks/useRole';
import type { LoanApplication, LoanRepayment, LoanStatus } from '@/types';
import { API_BASE_URL } from '@/config';
import { useRouter } from 'expo-router';

function sanitizeNumericInput(value: string): number {
  const digits = value.replace(/[^0-9.]/g, '');
  if (!digits) return 0;
  const parts = digits.split('.');
  if (parts.length > 2) {
    return Number(parts[0] + '.' + parts.slice(1).join(''));
  }
  const normalized = parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts[0];
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeIntegerInput(value: string): number {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function SegmentControl({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  return (
    <View style={[seg.wrap, { backgroundColor: colors.muted, marginHorizontal: isDesktop ? 24 : isTablet ? 20 : 16, marginBottom: isDesktop ? 20 : 16 }]}>
      {tabs.map((tab, i) => (
        <TouchableOpacity
          key={tab}
          style={[seg.btn, active === i && { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }]}
          onPress={() => onChange(i)}
        >
          <Text style={[seg.text, { color: active === i ? colors.primary : colors.textMuted, fontSize: isDesktop ? 14 : 12 }]}>{tab}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const seg = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  text: { fontFamily: 'Inter_600SemiBold' },
});

// ──── Applications ────────────────────────────────────────────────────────────
function ApplicationsView({ searchQuery }: { searchQuery: string }) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const { hasAccess } = useRole();
  const { data: loans, isLoading, error, refetch } = useApiLoanApplications();
  const updateStatus = useApiUpdateLoanStatus();
  const [actionTarget, setActionTarget] = useState<{ loan: LoanApplication; action: LoanStatus } | null>(null);

  const filtered = useMemo(() => {
    if (!loans) return [];
    const q = (searchQuery || '').toLowerCase();
    return loans.filter((l: any) =>
      (l as any).customerName.toLowerCase().includes(q) ||
      (l as any).loanNumber.toLowerCase().includes(q) ||
      (l as any).county.toLowerCase().includes(q)
    );
  }, [loans, searchQuery]);

  if (error) {
    return <ApiError message={error instanceof Error ? error.message : 'Failed to load applications'} onRetry={() => refetch()} />;
  }

  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />;

  const handleAction = (loan: LoanApplication, action: LoanStatus) => {
    setActionTarget({ loan, action });
  };

  return (
    <>
      {filtered.length === 0 ? (
        <EmptyState icon="file-text" title="No loan applications" description="Applications will appear here" />
      ) : (
        filtered.map((loan: LoanApplication) => (
          <View key={loan.id} style={[appStyles.card, { backgroundColor: colors.card, shadowColor: colors.shadow, padding: isDesktop ? 18 : 14 }]}>
            <View style={appStyles.cardHeader}>
              <View>
                <Text style={[appStyles.loanNum, { color: colors.primary, fontSize: isDesktop ? 13 : 12 }]}>{loan.loanNumber}</Text>
                <Text style={[appStyles.custName, { color: colors.text, fontSize: isDesktop ? 16 : 15 }]}>{loan.customerName}</Text>
                <Text style={[appStyles.county, { color: colors.textMuted, fontSize: isDesktop ? 12 : 11 }]}>{loan.county} County • {loan.creditOfficer}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <StatusBadge status={loan.status} />
                <StatusBadge status={loan.loanType} size="sm" />
              </View>
            </View>

            <View style={[appStyles.divider, { backgroundColor: colors.border }]} />

            <View style={appStyles.amountRow}>
              <View style={appStyles.amountItem}>
                <Text style={[appStyles.amtLabel, { color: colors.textMuted, fontSize: isDesktop ? 11 : 10 }]}>Principal</Text>
                <Text style={[appStyles.amtValue, { color: colors.text, fontSize: isDesktop ? 14 : 13 }]}>{formatKsh(loan.principal)}</Text>
              </View>
              <View style={appStyles.amountItem}>
                <Text style={[appStyles.amtLabel, { color: colors.textMuted, fontSize: isDesktop ? 11 : 10 }]}>Total (30%)</Text>
                <Text style={[appStyles.amtValue, { color: colors.primary, fontSize: isDesktop ? 14 : 13 }]}>{formatKsh(loan.total)}</Text>
              </View>
              <View style={appStyles.amountItem}>
                <Text style={[appStyles.amtLabel, { color: colors.textMuted, fontSize: isDesktop ? 11 : 10 }]}>Weekly</Text>
                <Text style={[appStyles.amtValue, { color: colors.text, fontSize: isDesktop ? 14 : 13 }]}>{formatKsh(loan.weeklyInstallment)}</Text>
              </View>
              <View style={appStyles.amountItem}>
                <Text style={[appStyles.amtLabel, { color: colors.textMuted, fontSize: isDesktop ? 11 : 10 }]}>Duration</Text>
                <Text style={[appStyles.amtValue, { color: colors.text, fontSize: isDesktop ? 14 : 13 }]}>{loan.duration}w</Text>
              </View>
            </View>

            <Text style={[appStyles.date, { color: colors.textMuted, fontSize: isDesktop ? 12 : 11 }]}>Applied: {loan.appliedDate}</Text>
            {loan.declineReason && (
              <Text style={[appStyles.date, { color: colors.destructive, fontSize: isDesktop ? 12 : 11 }]}>Reason: {loan.declineReason}</Text>
            )}

             {hasAccess('officer') && (loan.status === 'pending' || loan.status === 'under_review') && (
              <View style={appStyles.actions}>
                <TouchableOpacity style={[appStyles.actionBtn, { backgroundColor: colors.accent, borderColor: colors.success }]} onPress={() => handleAction(loan, 'approved')}>
                  <Feather name="check" size={13} color={colors.primaryHover} />
                  <Text style={[appStyles.actionText, { color: colors.primaryHover, fontSize: isDesktop ? 12 : 11 }]}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[appStyles.actionBtn, { backgroundColor: colors.warning + '25', borderColor: colors.warning }]} onPress={() => handleAction(loan, 'under_review')}>
                  <Feather name="rotate-ccw" size={13} color={colors.warning} />
                  <Text style={[appStyles.actionText, { color: colors.warning, fontSize: isDesktop ? 12 : 11 }]}>Review</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[appStyles.actionBtn, { backgroundColor: colors.destructive + '25', borderColor: colors.destructive }]} onPress={() => handleAction(loan, 'declined')}>
                  <Feather name="x" size={13} color={colors.destructive} />
                  <Text style={[appStyles.actionText, { color: colors.destructive, fontSize: isDesktop ? 12 : 11 }]}>Decline</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      )}

      <ConfirmModal
        visible={!!actionTarget}
        title={`${actionTarget?.action} Loan?`}
        message={`${actionTarget?.action === 'approved' ? 'Approve' : actionTarget?.action === 'declined' ? 'Decline' : 'Send back for review'} loan ${actionTarget?.loan.loanNumber} for ${actionTarget?.loan.customerName}?`}
        confirmText={actionTarget?.action ?? 'Confirm'}
        variant={actionTarget?.action === 'approved' ? 'success' : actionTarget?.action === 'declined' ? 'danger' : 'primary'}
        showInput={actionTarget?.action === 'declined'}
        inputLabel="Reason for Decline"
        inputPlaceholder="Enter the reason for declining this loan..."
        loading={updateStatus.isPending}
        onConfirm={() => {
          if (actionTarget) {
            updateStatus.mutate({ id: actionTarget.loan.id, status: actionTarget.action }, { onSuccess: () => setActionTarget(null) });
          }
        }}
        onCancel={() => setActionTarget(null)}
      />
    </>
  );
}

const appStyles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  loanNum: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  custName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  county: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  divider: { height: 1, marginVertical: 12 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  amountItem: { alignItems: 'center' },
  amtLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  amtValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  date: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  actionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});

// ──── Repayments ──────────────────────────────────────────────────────────────
function MpesaPaymentModal({ visible, onClose, loanNumber, customerName }: { visible: boolean; onClose: () => void; loanNumber: string; customerName: string }) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const mpesaStk = useApiMpesaStk();
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  const handlePay = async () => {
    if (!phone.trim() || !amount.trim()) {
      Alert.alert('Error', 'Please enter phone and amount');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    try {
      setStatus('pending');
      setStatusMsg('Initiating M-Pesa STK Push...');
      const res = await mpesaStk.mutateAsync({ data: { phone: phone.trim(), amount: numAmount, reference: loanNumber, description: `Loan repayment for ${loanNumber}` } });
      const cid = res.CheckoutRequestID || null;
      setCheckoutId(cid);
      setStatusMsg('STK Push sent. Please complete payment on your phone.');
      if (cid) {
        pollStatus(cid);
      }
    } catch (err) {
      setStatus('failed');
      setStatusMsg(err instanceof Error ? err.message : 'Could not initiate M-Pesa payment');
    }
  };

  const pollStatus = async (cid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/mpesa/status?checkoutRequestId=${encodeURIComponent(cid)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.status === 'completed') {
        setStatus('completed');
        setStatusMsg(`Payment completed! Receipt: ${data.receiptNumber || 'N/A'}`);
      } else if (data.status === 'failed') {
        setStatus('failed');
        setStatusMsg(`Payment failed: ${data.resultDesc || 'Unknown reason'}`);
      } else {
        setTimeout(() => pollStatus(cid), 2000);
      }
    } catch {
      setTimeout(() => pollStatus(cid), 2000);
    }
  };

  const handleClose = () => {
    setPhone('');
    setAmount('');
    setCheckoutId(null);
    setStatus('idle');
    setStatusMsg('');
    onClose();
  };

  const modalMaxWidth = isDesktop ? 480 : isTablet ? 440 : 400;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={isTablet || isDesktop ? 'formSheet' : 'pageSheet'}>
      <View style={[mpStyles.modal, { backgroundColor: colors.background, maxWidth: modalMaxWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={[mpStyles.header, { backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={handleClose}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={[mpStyles.title, { fontSize: isDesktop ? 18 : 17 }]}>M-Pesa Payment</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ padding: isTablet || isDesktop ? 28 : 20, gap: isTablet || isDesktop ? 18 : 16 }}>
          <View style={[mpStyles.infoBox, { backgroundColor: colors.accent }]}>
            <Feather name="file-text" size={isTablet || isDesktop ? 16 : 14} color={colors.primary} />
            <Text style={[mpStyles.infoText, { color: colors.primaryHover, fontSize: isTablet || isDesktop ? 14 : 12 }]}>
              Paying for {customerName} • Loan {loanNumber}
            </Text>
          </View>
          <View>
            <Text style={[mpStyles.label, { color: colors.text, fontSize: isTablet || isDesktop ? 14 : 12 }]}>Phone Number</Text>
            <TextInput
              style={[mpStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background, fontSize: isTablet || isDesktop ? 16 : 14 }]}
              placeholder="0712345678"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={status === 'idle'}
            />
          </View>
          <View>
            <Text style={[mpStyles.label, { color: colors.text, fontSize: isTablet || isDesktop ? 14 : 12 }]}>Amount (Ksh)</Text>
            <TextInput
              style={[mpStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background, fontSize: isTablet || isDesktop ? 16 : 14 }]}
              placeholder="5000"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              editable={status === 'idle'}
            />
          </View>

          {status !== 'idle' && (
            <View style={[mpStyles.statusBox, { backgroundColor: status === 'completed' ? colors.success + '20' : status === 'failed' ? colors.destructive + '20' : colors.accent }]}>
              <Feather
                name={status === 'completed' ? 'check-circle' : status === 'failed' ? 'x-circle' : 'loader'}
                size={isTablet || isDesktop ? 20 : 16}
                color={status === 'completed' ? colors.success : status === 'failed' ? colors.destructive : colors.primary}
              />
              <Text style={[mpStyles.statusText, { color: status === 'completed' ? colors.success : status === 'failed' ? colors.destructive : colors.primary, fontSize: isTablet || isDesktop ? 14 : 12 }]}>
                {statusMsg}
              </Text>
            </View>
          )}

          {status === 'idle' ? (
            <TouchableOpacity
              style={[mpStyles.payBtn, { backgroundColor: colors.primary }]}
              onPress={handlePay}
              disabled={mpesaStk.isPending}
            >
              {mpesaStk.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="smartphone" size={isTablet || isDesktop ? 18 : 16} color="#fff" />
              )}
              <Text style={[mpStyles.payBtnText, { fontSize: isTablet || isDesktop ? 16 : 15 }]}>{mpesaStk.isPending ? 'Processing...' : 'Pay Now'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[mpStyles.payBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
              onPress={handleClose}
            >
              <Feather name="check" size={isTablet || isDesktop ? 18 : 16} color={colors.text} />
              <Text style={[mpStyles.payBtnText, { color: colors.text, fontSize: isTablet || isDesktop ? 16 : 15 }]}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const mpStyles = StyleSheet.create({
  modal: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff' },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  infoText: { fontFamily: 'Inter_400Regular', flex: 1 },
  label: { fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  payBtnText: { fontFamily: 'Inter_600SemiBold', color: '#fff' },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, marginTop: 4 },
  statusText: { fontFamily: 'Inter_500Medium', flex: 1 },
});

// ──── Apply Loan ──────────────────────────────────────────────────────────────
function WorkflowProgress() {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const steps = [
    { icon: 'file-text', label: 'Apply', color: colors.primary },
    { icon: 'search', label: 'Review', color: colors.warning },
    { icon: 'check-circle', label: 'Approve', color: colors.success },
    { icon: 'dollar-sign', label: 'Disburse', color: colors.info },
  ];
  return (
    <View style={[applyStyles.workflowWrap, { backgroundColor: colors.card, borderColor: colors.border, paddingHorizontal: isDesktop ? 24 : isTablet ? 20 : 16 }]}>
      <Text style={[applyStyles.workflowTitle, { color: colors.text }]}>Loan Process</Text>
      <View style={applyStyles.workflowRow}>
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <View style={[applyStyles.workflowStep, { backgroundColor: colors.muted }]}>
              <Feather name={s.icon as any} size={isDesktop ? 18 : 16} color={s.color} />
              <Text style={[applyStyles.workflowLabel, { color: colors.text, fontSize: isDesktop ? 12 : 11 }]}>{s.label}</Text>
            </View>
            {i < steps.length - 1 && <View style={[applyStyles.workflowLine, { backgroundColor: colors.border }]} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function ApplyView({ onApplied }: { onApplied?: () => void }) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const { currentUser, accessToken } = useAuth();
  const { data: loanInfo } = useApiMyLoanInfo();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loanType, setLoanType] = useState<'Starter' | 'Top-up'>('Starter');
  const [principal, setPrincipal] = useState('');
  const [duration, setDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdLoan, setCreatedLoan] = useState<any>(null);

  const minLoan = 1000;
  const maxDuration = 12;
  const interestRate = loanInfo?.interestRate ?? 0.3;

  const principalNum = sanitizeNumericInput(principal);
  const durationNum = sanitizeIntegerInput(duration);
  const total = principalNum > 0 && durationNum > 0 ? Math.round(principalNum * (1 + interestRate * durationNum / 12) * 100) / 100 : 0;
  const weeklyInstallment = durationNum > 0 ? Math.ceil(total / durationNum) : 0;
  const availableLimit = Math.max(0, (loanInfo?.loanLimit ?? 0) - (loanInfo?.currentLoanBalance ?? 0));

  const canApply = Boolean(
    loanInfo &&
    principalNum > 0 &&
    durationNum > 0 &&
    principalNum >= minLoan &&
    durationNum <= maxDuration &&
    principalNum <= availableLimit
  );

  const handleSubmit = async () => {
    if (!canApply || !currentUser || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          customerId: currentUser.id,
          customerName: currentUser.fullName,
          loanType,
          principal: principalNum,
          duration: durationNum,
          creditOfficer: currentUser.fullName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Application Failed', data.error || 'Could not submit loan application');
        return;
      }
      setCreatedLoan(data.loan);
      setSuccess(true);
      onApplied?.();
      setTimeout(() => {
        setSuccess(false);
        setStep(0);
        setPrincipal('');
        setDuration('');
        setCreatedLoan(null);
      }, 3000);
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  function getCreditScoreLabel(score: number) {
    if (score >= 700) return 'Excellent';
    if (score >= 500) return 'Good';
    return 'High Risk';
  }

  if (success && createdLoan) {
    return (
      <View style={[applyStyles.successBox, { backgroundColor: colors.card }]}> 
        <View style={[applyStyles.successIcon, { backgroundColor: colors.success + '20' }]}> 
          <Feather name="check-circle" size={48} color={colors.success} />
        </View>
        <Text style={[applyStyles.successTitle, { color: colors.text }]}>Application Submitted!</Text>
        <Text style={[applyStyles.successText, { color: colors.textMuted }]}>
          Your loan application ({createdLoan.loanNumber || ''}) has been received. A loan officer will review it, then a supervisor will approve it before disbursement.
        </Text>
        <View style={[applyStyles.workflowWrap, { backgroundColor: colors.muted, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 }]}>
          <View style={applyStyles.workflowRow}>
            {[
              { icon: 'check-circle', label: 'Applied', color: colors.success },
              { icon: 'search', label: 'Review', color: colors.warning },
              { icon: 'check', label: 'Approve', color: colors.primary },
              { icon: 'dollar-sign', label: 'Disburse', color: colors.info },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                <View style={[applyStyles.workflowStep, { backgroundColor: 'transparent' }]}>
                  <Feather name={s.icon as any} size={16} color={s.color} />
                  <Text style={[applyStyles.workflowLabel, { color: colors.text, fontSize: 10 }]}>{s.label}</Text>
                </View>
                {i < 3 && <View style={[applyStyles.workflowLine, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            ))}
          </View>
        </View>
        <TouchableOpacity style={[applyStyles.btn, { backgroundColor: colors.primary }]} onPress={() => { setSuccess(false); setStep(0); setPrincipal(''); setDuration(''); setCreatedLoan(null); }}>
          <Text style={[applyStyles.btnText, { color: '#fff' }]}>Apply Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <WorkflowProgress />
      {step === 0 && (
        <View style={{ gap: 12 }}>
          <Text style={[applyStyles.stepTitle, { color: colors.text }]}>Select Loan Type</Text>
          {(['Starter', 'Top-up'] as const).map(t => (
            <TouchableOpacity key={t} style={[applyStyles.typeCard, { borderColor: loanType === t ? colors.primary : colors.border, backgroundColor: loanType === t ? colors.accent : colors.card }]} onPress={() => setLoanType(t)}>
              <Feather name={t === 'Starter' ? 'sun' : 'arrow-up-circle'} size={24} color={loanType === t ? colors.primary : colors.textMuted} />
              <View>
                <Text style={[applyStyles.typeTitle, { color: loanType === t ? colors.primary : colors.text }]}>{t} Loan</Text>
                <Text style={[applyStyles.typeDesc, { color: colors.textMuted }]}> 
                  {t === 'Starter' ? 'First-time loan for new customers' : 'Additional loan for existing customers'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[applyStyles.btn, { backgroundColor: colors.primary }]} onPress={() => setStep(1)} disabled={!loanType}>
            <Text style={[applyStyles.btnText, { color: '#fff' }]}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 12 }}>
          <Text style={[applyStyles.stepTitle, { color: colors.text }]}>Loan Amount</Text>
          <TextInput
            style={[applyStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            placeholder={`Minimum Ksh ${minLoan.toLocaleString()}`}
            placeholderTextColor={colors.textMuted}
            value={principal}
            onChangeText={setPrincipal}
            keyboardType="numeric"
          />
          {principalNum > 0 && principalNum < minLoan && (
            <Text style={[applyStyles.errorText, { color: colors.destructive }]}>Minimum loan amount is Ksh {minLoan.toLocaleString()}</Text>
          )}
          {loanInfo && principalNum > availableLimit && (
            <Text style={[applyStyles.errorText, { color: colors.destructive }]}>Amount exceeds your available limit of Ksh {availableLimit.toLocaleString()}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[applyStyles.btn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, flex: 1 }]} onPress={() => setStep(0)}>
              <Text style={[applyStyles.btnText, { color: colors.text }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[applyStyles.btn, { backgroundColor: colors.primary, flex: 1 }]} onPress={() => setStep(2)} disabled={!canApply}>
              <Text style={[applyStyles.btnText, { color: '#fff' }]}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 12 }}>
          <Text style={[applyStyles.stepTitle, { color: colors.text }]}>Repayment Duration</Text>
          <TextInput
            style={[applyStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            placeholder={`Maximum ${maxDuration} weeks`}
            placeholderTextColor={colors.textMuted}
            value={duration}
            onChangeText={setDuration}
            keyboardType="numeric"
          />
          {durationNum > maxDuration && (
            <Text style={[applyStyles.errorText, { color: colors.destructive }]}>Maximum duration is {maxDuration} weeks</Text>
          )}

          {total > 0 && (
            <View style={[applyStyles.summary, { backgroundColor: colors.accent }]}> 
              <Text style={[applyStyles.summaryTitle, { color: colors.text }]}>Loan Summary</Text>
              <View style={applyStyles.summaryRow}>
                <Text style={[applyStyles.summaryLabel, { color: colors.textMuted }]}>Principal</Text>
                <Text style={[applyStyles.summaryValue, { color: colors.text }]}>Ksh {principalNum.toLocaleString()}</Text>
              </View>
              <View style={applyStyles.summaryRow}>
                <Text style={[applyStyles.summaryLabel, { color: colors.textMuted }]}>Charges ({Math.round(interestRate * 100)}%)</Text>
                <Text style={[applyStyles.summaryValue, { color: colors.text }]}>Ksh {(total - principalNum).toLocaleString()}</Text>
              </View>
              <View style={applyStyles.summaryRow}>
                <Text style={[applyStyles.summaryLabel, { color: colors.text }]}>Total Amount</Text>
                <Text style={[applyStyles.summaryValue, { color: colors.primary }]}>Ksh {total.toLocaleString()}</Text>
              </View>
              <View style={applyStyles.summaryRow}>
                <Text style={[applyStyles.summaryLabel, { color: colors.textMuted }]}>Weekly Installment</Text>
                <Text style={[applyStyles.summaryValue, { color: colors.text }]}>Ksh {weeklyInstallment.toLocaleString()}</Text>
              </View>
              <View style={applyStyles.summaryRow}>
                <Text style={[applyStyles.summaryLabel, { color: colors.textMuted }]}>Duration</Text>
                <Text style={[applyStyles.summaryValue, { color: colors.text }]}>{durationNum} weeks</Text>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[applyStyles.btn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, flex: 1 }]} onPress={() => setStep(1)}>
              <Text style={[applyStyles.btnText, { color: colors.text }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[applyStyles.btn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleSubmit} disabled={!canApply || submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[applyStyles.btnText, { color: '#fff' }]}>Submit Application</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const applyStyles = StyleSheet.create({
  successBox: { borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  successIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  successTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  successText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 16 },
  btn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  stepTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  typeCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1 },
  typeTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  typeDesc: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular' },
  errorText: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  summary: { borderRadius: 10, padding: 16, marginTop: 12 },
  summaryTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  summaryValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  workflowWrap: { borderRadius: 14, paddingVertical: 14, borderWidth: 1, gap: 10 },
  workflowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  workflowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  workflowStep: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 },
  workflowLabel: { fontFamily: 'Inter_500Medium' },
  workflowLine: { flex: 1, height: 2, marginHorizontal: 4, borderRadius: 1 },
});

export default ApplicationsView;
