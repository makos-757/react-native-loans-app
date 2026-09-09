// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmModal, OTPModal } from '@/components/ConfirmModal';
import { EmptyState } from '@/components/EmptyState';
import { useApiCustomers, useApiCreateCustomer, useApiCreateInquiry, useApiUsers } from '@/hooks/useApiQueries';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRole } from '@/hooks/useRole';
import { normalizeRole } from '@/lib/rbac';
import { OfflineScreen } from '@/components/OfflineScreen';
import { ApiError } from '@/components/ApiError';
import type { AppUser, UserRole } from '@/types';
import { cacheData, getCachedData } from '@/utils/offlineStorage';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  User: 1,
  Officer: 2,
  Supervisor: 3,
  Manager: 4,
};

// ──── Segment Control ────────────────────────────────────────────────────────
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
          <Text style={[seg.text, { color: active === i ? colors.primary : colors.textMuted, fontSize: isDesktop ? 14 : 13 }]}>{tab}</Text>
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

// ──── User Card ──────────────────────────────────────────────────────────────
function UserCard({ user, onDelete, onResetPassword, onSuspend, onUnsuspend, onChangeRole, canDelete, canManage }: { user: AppUser; onDelete: () => void; onResetPassword: () => void; onSuspend: () => void; onUnsuspend: () => void; onChangeRole: () => void; canDelete: boolean; canManage: boolean }) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const [expanded, setExpanded] = useState(false);
  const fullName = typeof user.fullName === 'string' ? user.fullName : 'Unknown';
  const telephone = typeof user.telephone === 'string' ? user.telephone : '';
  const branch = typeof user.branch === 'string' ? user.branch : '';
  const role = typeof user.role === 'string' ? user.role : 'user';
  const isSuspended = Boolean(user.isSuspended);
  const initials = typeof user.fullName === 'string' ? user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[ucStyles.card, { backgroundColor: colors.card, shadowColor: colors.shadow, padding: isDesktop ? 18 : 14, opacity: isSuspended ? 0.7 : 1 }]}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={ucStyles.top}>
        <View style={[ucStyles.avatar, { backgroundColor: isSuspended ? colors.muted : colors.accent, width: isDesktop ? 48 : 42, height: isDesktop ? 48 : 42 }]}>
          <Text style={[ucStyles.avatarText, { color: isSuspended ? colors.textMuted : colors.primary, fontSize: isDesktop ? 17 : 15 }]}>
            {initials}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}>
            <Text style={[ucStyles.name, { color: colors.text, fontSize: isDesktop ? 15 : 14, marginRight: 8 }]} numberOfLines={1}>{fullName}</Text>
            {isSuspended ? (
              <View style={[ucStyles.suspendedBadge, { backgroundColor: '#fee2e2' }]}>
                <Text style={[ucStyles.suspendedText, { color: '#b91c1c' }]}>SUSPENDED</Text>
              </View>
            ) : null}
          </View>
          <Text style={[ucStyles.sub, { color: colors.textMuted, fontSize: isDesktop ? 13 : 12 }]} numberOfLines={1}>{telephone + ' \u2022 ' + branch}</Text>
        </View>
        <StatusBadge status={role} size="sm" />
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </View>

      {expanded ? (
        <View style={ucStyles.details}>
          <View style={[ucStyles.divider, { backgroundColor: colors.border }]} />
          <View style={ucStyles.infoGrid}>
            {[
              { label: 'ID Number', value: user.idNumber },
              { label: 'PF Number', value: user.pfNumber },
              { label: 'Assignment', value: user.assignment },
              { label: 'Email', value: user.email },
              { label: 'Credit Score', value: String(user.creditScore ?? 'N/A') },
              { label: 'Loan Limit', value: user.loanLimit ? `Ksh ${user.loanLimit.toLocaleString()}` : 'N/A' },
              { label: 'Loan Balance', value: user.currentLoanBalance ? `Ksh ${user.currentLoanBalance.toLocaleString()}` : 'Ksh 0' },
              ...(user.suspensionReason ? [{ label: 'Suspension Reason', value: user.suspensionReason }] : []),
            ].map(item => (
              <View key={item.label} style={ucStyles.infoItem}>
                <Text style={[ucStyles.infoLabel, { color: colors.textMuted, fontSize: isDesktop ? 11 : 10 }]}>{item.label}</Text>
                <Text style={[ucStyles.infoValue, { color: colors.text, fontSize: isDesktop ? 14 : 13 }]} numberOfLines={1}>{item.value}</Text>
              </View>
            ))}
          </View>
          <View style={[ucStyles.actions, { marginTop: isDesktop ? 16 : 12 }]}>
            {canManage && !isSuspended ? (
              <TouchableOpacity style={[ucStyles.actionBtn, { backgroundColor: '#fef3c7', paddingVertical: isDesktop ? 10 : 8 }]} onPress={onSuspend}>
                <Feather name="pause-circle" size={14} color="#92400e" />
                <Text style={[ucStyles.actionText, { color: '#92400e', fontSize: isDesktop ? 13 : 12 }]}>Suspend</Text>
              </TouchableOpacity>
            ) : null}
            {canManage && isSuspended ? (
              <TouchableOpacity style={[ucStyles.actionBtn, { backgroundColor: '#d1fae5', paddingVertical: isDesktop ? 10 : 8 }]} onPress={onUnsuspend}>
                <Feather name="check-circle" size={14} color="#065f46" />
                <Text style={[ucStyles.actionText, { color: '#065f46', fontSize: isDesktop ? 13 : 12 }]}>Unsuspend</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[ucStyles.actionBtn, { backgroundColor: colors.muted, paddingVertical: isDesktop ? 10 : 8 }]}>
              <Feather name="edit-2" size={14} color={colors.primary} />
              <Text style={[ucStyles.actionText, { color: colors.primary, fontSize: isDesktop ? 13 : 12 }]}>Edit</Text>
            </TouchableOpacity>
            {canManage && (
              <TouchableOpacity style={[ucStyles.actionBtn, { backgroundColor: colors.accent, paddingVertical: isDesktop ? 10 : 8 }]} onPress={onChangeRole}>
                <Feather name="user" size={14} color={colors.primary} />
                <Text style={[ucStyles.actionText, { color: colors.primary, fontSize: isDesktop ? 13 : 12 }]}>Change Role</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[ucStyles.actionBtn, { backgroundColor: '#fef3c7', paddingVertical: isDesktop ? 10 : 8 }]} onPress={onResetPassword}>
              <Feather name="key" size={14} color="#92400e" />
              <Text style={[ucStyles.actionText, { color: '#92400e', fontSize: isDesktop ? 13 : 12 }]}>Reset Password</Text>
            </TouchableOpacity>
            {canDelete ? (
              <TouchableOpacity style={[ucStyles.actionBtn, { backgroundColor: '#fee2e2', paddingVertical: isDesktop ? 10 : 8 }]} onPress={onDelete}>
                <Feather name="trash-2" size={14} color={colors.destructive} />
                <Text style={[ucStyles.actionText, { color: colors.destructive, fontSize: isDesktop ? 13 : 12 }]}>Delete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
const ucStyles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold' },
  name: { fontFamily: 'Inter_600SemiBold' },
  sub: { fontFamily: 'Inter_400Regular', marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoItem: { width: '47%' },
  infoLabel: { fontFamily: 'Inter_500Medium', marginBottom: 2 },
  infoValue: { fontFamily: 'Inter_500Medium' },
  details: { marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, flex: 1, justifyContent: 'center' },
  actionText: { fontFamily: 'Inter_600SemiBold' },
  suspendedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  suspendedText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
});

// ──── Registration Multi-Step Form ───────────────────────────────────────────
function RegistrationField({ label, value, onChange, colors, keyboardType = 'default', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; colors: ReturnType<typeof useColors>; keyboardType?: string; placeholder?: string }) {
  return (
    <View style={regStyles.field}>
      <Text style={[regStyles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        style={[regStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType as any}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

function createEmptyRegistrationForm() {
  return {
    name: '',
    phone: '',
    altPhone: '',
    county: 'Nairobi',
    subcounty: '',
    ward: '',
    village: '',
    chiefName: '',
    maritalStatus: 'Single',
    spouseName: '',
    spousePhone: '',
    activityType: 'Business',
    monthlyIncome: '',
    businessName: '',
    businessType: 'Merchandise',
    businessLocation: '',
    prevLoans: 'No',
    institution: '',
    duration: '',
    settlementStatus: '',
  };
}

function RegistrationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<'Micro-Enterprise' | 'Chama' | null>(null);
  const [form, setForm] = useState(createEmptyRegistrationForm);
  const [submitted, setSubmitted] = useState(false);
  const createCustomer = useApiCreateCustomer();

  const update = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const steps = ['Type', 'Basic Info', 'Economic Activity', 'Business', 'Loan History', 'Confirm'];
  const progress = Math.min(100, Math.max(0, ((step + 1) / steps.length) * 100));

  const resetForm = () => {
    setStep(0);
    setType(null);
    setForm(createEmptyRegistrationForm());
  };

  const validateStep = () => {
    if (step === 0 && !type) return 'Please select a registration type';
    if (step === 1 && !form.name.trim()) return 'Please enter the customer name';
    if (step === 1 && !form.phone.trim()) return 'Please enter the primary phone number';
    if (step === 2 && !form.activityType) return 'Please select an activity type';
    if (step === 2 && !form.monthlyIncome) return 'Please enter monthly income';
    if (step === 3 && !form.businessName.trim()) return 'Please enter the business name';
    return null;
  };

  const handleNext = () => {
    const error = validateStep();
    if (error) {
      Alert.alert('Validation', error);
      return;
    }
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    const error = validateStep();
    if (error) {
      Alert.alert('Validation', error);
      return;
    }
    if (!type) return;

    setSubmitted(true);
    try {
      const payload: Record<string, unknown> = {
        customerType: type,
        name: form.name,
        phone: form.phone,
        idNumber: '',
        county: form.county,
        subcounty: form.subcounty,
        ward: form.ward,
        village: form.village,
        chiefName: form.chiefName,
        maritalStatus: form.maritalStatus,
        spouseName: form.spouseName || null,
        spousePhone: form.spousePhone || null,
        economicActivity: form.activityType,
        monthlyIncome: parseFloat(form.monthlyIncome) || 0,
        businessName: form.businessName,
        businessType: form.businessType,
        businessLocation: form.businessLocation,
        prevLoans: form.prevLoans,
        institution: form.institution,
        duration: form.duration,
        settlementStatus: form.settlementStatus,
        creditOfficer: 'Current User',
      };
      await createCustomer.mutateAsync(payload);
      Alert.alert('Success', 'Customer registered successfully!', [{ text: 'OK', onPress: () => { onClose(); resetForm(); } }]);
    } catch {
      Alert.alert('Error', 'Failed to register customer. Please try again.');
    } finally {
      setSubmitted(false);
    }
  };

  const renderStep = () => {
    if (step === 0) return (
      <View style={regStyles.typeStep}>
        <Text style={[regStyles.stepTitle, { color: colors.text }]}>Select Registration Type</Text>
        {(['Micro-Enterprise', 'Chama'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[regStyles.typeBtn, { borderColor: type === t ? colors.primary : colors.border, backgroundColor: type === t ? colors.accent : colors.card }]}
            onPress={() => setType(t)}
          >
            <Feather name={t === 'Chama' ? 'users' : 'user'} size={28} color={type === t ? colors.primary : colors.textMuted} />
            <Text style={[regStyles.typeName, { color: type === t ? colors.primary : colors.text }]}>{t}</Text>
            <Text style={[regStyles.typeDesc, { color: colors.textMuted }]}>
              {t === 'Micro-Enterprise' ? 'Individual business owner' : 'Community group / Chama'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );

    if (step === 1) return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[regStyles.stepTitle, { color: colors.text }]}>Basic Information</Text>
        <RegistrationField label={type === 'Chama' ? 'Group Name' : 'Full Name'} value={form.name} onChange={(v: string) => update('name', v)} colors={colors} />
        <RegistrationField label="Primary Phone" value={form.phone} onChange={(v: string) => update('phone', v)} keyboardType="phone-pad" colors={colors} />
        <RegistrationField label="Alternative Phone" value={form.altPhone} onChange={(v: string) => update('altPhone', v)} keyboardType="phone-pad" colors={colors} />
        <View style={regStyles.field}>
          <Text style={[regStyles.label, { color: colors.text }]}>County</Text>
          <View style={[regStyles.picker, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika'].slice(0, 6).map((c) => (
                <TouchableOpacity key={c} style={[regStyles.countyChip, { backgroundColor: form.county === c ? colors.primary : colors.muted }]} onPress={() => update('county', c)}>
                  <Text style={[regStyles.countyText, { color: form.county === c ? '#fff' : colors.text }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
        <RegistrationField label="Subcounty" value={form.subcounty} onChange={(v: string) => update('subcounty', v)} colors={colors} />
        <RegistrationField label="Ward" value={form.ward} onChange={(v: string) => update('ward', v)} colors={colors} />
        <RegistrationField label="Village" value={form.village} onChange={(v: string) => update('village', v)} colors={colors} />
        <RegistrationField label="Chief's Name" value={form.chiefName} onChange={(v: string) => update('chiefName', v)} colors={colors} />
        {type === 'Micro-Enterprise' && (
          <>
            <View style={regStyles.field}>
              <Text style={[regStyles.label, { color: colors.text }]}>Marital Status</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Single', 'Married', 'Divorced', 'Widowed'].map((s) => (
                  <TouchableOpacity key={s} style={[regStyles.pill, { backgroundColor: form.maritalStatus === s ? colors.primary : colors.muted }]} onPress={() => update('maritalStatus', s)}>
                    <Text style={[regStyles.pillText, { color: form.maritalStatus === s ? '#fff' : colors.text }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {form.maritalStatus === 'Married' && (
              <>
                <RegistrationField label="Spouse Name" value={form.spouseName} onChange={(v: string) => update('spouseName', v)} colors={colors} />
                <RegistrationField label="Spouse Phone" value={form.spousePhone} onChange={(v: string) => update('spousePhone', v)} keyboardType="phone-pad" colors={colors} />
              </>
            )}
          </>
        )}
      </ScrollView>
    );

    if (step === 2) return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[regStyles.stepTitle, { color: colors.text }]}>Economic Activities</Text>
        <View style={regStyles.field}>
          <Text style={[regStyles.label, { color: colors.text }]}>Activity Type</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {['Farming', 'Business', 'Other'].map((a) => (
              <TouchableOpacity key={a} style={[regStyles.pill, { backgroundColor: form.activityType === a ? colors.primary : colors.muted }]} onPress={() => update('activityType', a)}>
                <Text style={[regStyles.pillText, { color: form.activityType === a ? '#fff' : colors.text }]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <RegistrationField label="Monthly Income (Ksh)" value={form.monthlyIncome} onChange={(v: string) => update('monthlyIncome', v)} keyboardType="numeric" colors={colors} />
        <View style={[regStyles.infoBox, { backgroundColor: colors.accent }]}>
          <Feather name="camera" size={14} color={colors.primary} />
          <Text style={[regStyles.infoText, { color: colors.primaryHover }]}>
            Photo upload available (tap to add an activity photo)
          </Text>
        </View>
      </ScrollView>
    );

    if (step === 3) return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[regStyles.stepTitle, { color: colors.text }]}>Business Details</Text>
        <RegistrationField label="Business Name" value={form.businessName} onChange={(v: string) => update('businessName', v)} colors={colors} />
        <View style={regStyles.field}>
          <Text style={[regStyles.label, { color: colors.text }]}>Business Type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['Merchandise', 'Farm'].map((t) => (
              <TouchableOpacity key={t} style={[regStyles.pill, { backgroundColor: form.businessType === t ? colors.primary : colors.muted }]} onPress={() => update('businessType', t)}>
                <Text style={[regStyles.pillText, { color: form.businessType === t ? '#fff' : colors.text }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <RegistrationField label="Business Location" value={form.businessLocation} onChange={(v: string) => update('businessLocation', v)} colors={colors} />
        <View style={[regStyles.infoBox, { backgroundColor: colors.accent }]}>
          <Feather name="map-pin" size={14} color={colors.primary} />
          <Text style={[regStyles.infoText, { color: colors.primaryHover }]}>GPS coordinates captured automatically via device location</Text>
        </View>
      </ScrollView>
    );

    if (step === 4) return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[regStyles.stepTitle, { color: colors.text }]}>Loan History</Text>
        <View style={regStyles.field}>
          <Text style={[regStyles.label, { color: colors.text }]}>Previous Loans?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['Yes', 'No'].map((v) => (
              <TouchableOpacity key={v} style={[regStyles.pill, { backgroundColor: form.prevLoans === v ? colors.primary : colors.muted, flex: 1 }]} onPress={() => update('prevLoans', v)}>
                <Text style={[regStyles.pillText, { color: form.prevLoans === v ? '#fff' : colors.text, textAlign: 'center' }]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {form.prevLoans === 'Yes' && (
          <>
            <RegistrationField label="Institution Name" value={form.institution} onChange={(v: string) => update('institution', v)} colors={colors} />
            <RegistrationField label="Duration (months)" value={form.duration} onChange={(v: string) => update('duration', v)} keyboardType="numeric" colors={colors} />
            <View style={regStyles.field}>
              <Text style={[regStyles.label, { color: colors.text }]}>Settlement Status</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Settled', 'Ongoing', 'Defaulted'].map((s) => (
                  <TouchableOpacity key={s} style={[regStyles.pill, { flex: 1, backgroundColor: form.settlementStatus === s ? colors.primary : colors.muted }]} onPress={() => update('settlementStatus', s)}>
                    <Text style={[regStyles.pillText, { color: form.settlementStatus === s ? '#fff' : colors.text, textAlign: 'center', fontSize: 10 }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    );

    if (step === 5) return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[regStyles.stepTitle, { color: colors.text }]}>Confirm & Submit</Text>
        <View style={[regStyles.summary, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          {[
            ['Type', type ?? ''],
            ['Name', form.name || '—'],
            ['Phone', form.phone || '—'],
            ['County', form.county],
            ['Activity', form.activityType],
            ['Business', form.businessName || '—'],
            ['Monthly Income', form.monthlyIncome ? `Ksh ${parseFloat(form.monthlyIncome).toLocaleString()}` : '—'],
            ['Prev Loans', form.prevLoans],
            ['Settlement', form.settlementStatus || '—'],
          ].map(([k, v]) => (
            <View key={k} style={regStyles.summaryRow}>
              <Text style={[regStyles.summaryKey, { color: colors.textMuted }]}>{k}</Text>
              <Text style={[regStyles.summaryVal, { color: colors.text }]}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={[regStyles.otpNote, { color: colors.textMuted }]}>By submitting, you confirm the information provided is correct.</Text>
      </ScrollView>
    );

    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[regStyles.modal, { backgroundColor: colors.background }]}>
        {/* Modal Header */}
        <View style={[regStyles.modalHeader, { backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={regStyles.modalTitle}>New Registration</Text>
          <Text style={[regStyles.stepCount, { color: 'rgba(255,255,255,0.7)' }]}>{step + 1}/{steps.length}</Text>
        </View>

        {/* Progress Bar */}
        <View style={[regStyles.progressBg, { backgroundColor: colors.border }]}>
          <View style={[regStyles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
        </View>

        {/* Step Labels */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={regStyles.stepsRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {steps.map((s, i) => (
            <View key={s} style={[regStyles.stepLabel, { backgroundColor: i <= step ? colors.primary : colors.muted }]}>
              <Text style={[regStyles.stepLabelText, { color: i <= step ? '#fff' : colors.textMuted }]}>{s}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Content */}
        <View style={{ flex: 1, padding: 20 }}>
          {renderStep()}
        </View>

        {/* Navigation */}
        <View style={[regStyles.navRow, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity style={[regStyles.navBtn, { backgroundColor: colors.muted }]} onPress={() => step > 0 ? setStep((s) => s - 1) : onClose()} disabled={submitted}>
            <Feather name="arrow-left" size={16} color={colors.text} />
            <Text style={[regStyles.navBtnText, { color: colors.text }]}>{step === 0 ? 'Cancel' : 'Back'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[regStyles.navBtn, { backgroundColor: colors.primary, flex: 1.5 }]}
            onPress={step === steps.length - 1 ? handleSubmit : handleNext}
            disabled={submitted}
          >
            {submitted ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Text style={[regStyles.navBtnText, { color: '#fff' }]}>{step === steps.length - 1 ? 'Submit' : 'Next'}</Text>
                <Feather name={step === steps.length - 1 ? 'check' : 'arrow-right'} size={16} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const regStyles = StyleSheet.create({
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff' },
  stepCount: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  progressBg: { height: 3 },
  progressFill: { height: 3, borderRadius: 2 },
  stepsRow: { maxHeight: 44, paddingVertical: 8 },
  stepLabel: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  stepLabelText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  typeStep: { flex: 1, gap: 12 },
  typeBtn: { borderWidth: 2, borderRadius: 14, padding: 20, alignItems: 'center', gap: 8 },
  typeName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  typeDesc: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  stepTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular' },
  picker: { borderWidth: 1.5, borderRadius: 10, padding: 8 },
  countyChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 6 },
  countyText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  pillText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginTop: 4 },
  infoText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  summary: { borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryKey: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  summaryVal: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  otpBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 13, marginBottom: 12 },
  otpBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  navRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 32, borderTopWidth: 1 },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 10, flex: 1 },
  navBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});

// ──── Role Assignment Modal ──────────────────────────────────────────────────
function RoleModal({ visible, user, onClose, onSuccess }: { visible: boolean; user: AppUser | null; onClose: () => void; onSuccess: () => void }) {
  const colors = useColors();
  const [selectedRole, setSelectedRole] = useState<string>('');
  const { isTablet, isDesktop } = useResponsive();
  const { accessToken } = useAuth();

  const roles = [
    { value: 'User', label: 'User', desc: 'Standard user - can apply for loans and view own data' },
    { value: 'Officer', label: 'Loan Officer', desc: 'Can process loan applications and manage customers' },
    { value: 'Supervisor', label: 'Supervisor', desc: 'Can oversee officers, view reports, and approve loans' },
    { value: 'Manager', label: 'Manager', desc: 'Full access - manage users, settings, and all operations' },
  ];

  useEffect(() => {
    if (user) {
      setSelectedRole(user.role || 'User');
    }
  }, [user]);

  const handleConfirm = async () => {
    if (!user || !selectedRole) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: user.id, role: selectedRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to update role');
      } else {
        Alert.alert('Success', `${user.fullName}'s role has been updated to ${selectedRole}`);
        onSuccess();
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      onClose();
    }
  };

  if (!user) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[rmStyles.modal, { backgroundColor: colors.background }]}>
        <View style={[rmStyles.header, { backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={rmStyles.modalTitle}>Assign Role</Text>
            <Text style={[rmStyles.subtitle, { color: 'rgba(255,255,255,0.7)' }]}>{user.fullName}</Text>
          </View>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
          <Text style={[rmStyles.infoText, { color: colors.textMuted }]}>
            Select a role to assign to this user. Each role has different permissions:
          </Text>

          {roles.map((role) => (
            <TouchableOpacity
              key={role.value}
              style={[rmStyles.roleCard, { borderColor: selectedRole === role.value ? colors.primary : colors.border, backgroundColor: selectedRole === role.value ? colors.accent : colors.card }]}
              onPress={() => setSelectedRole(role.value)}
            >
              <View style={[rmStyles.radioOuter, { borderColor: selectedRole === role.value ? colors.primary : colors.border }]}>
                {selectedRole === role.value && <View style={[rmStyles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[rmStyles.roleLabel, { color: selectedRole === role.value ? colors.primary : colors.text }]}>{role.label}</Text>
                <Text style={[rmStyles.roleDesc, { color: colors.textMuted }]}>{role.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <View style={{ height: 16 }} />

          <TouchableOpacity
            style={[rmStyles.confirmBtn, { backgroundColor: colors.primary }]}
            onPress={handleConfirm}
            disabled={selectedRole === (user?.role || 'User')}
          >
            <Feather name="check" size={18} color="#fff" />
            <Text style={rmStyles.confirmBtnText}>Update Role</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const rmStyles = StyleSheet.create({
  modal: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  infoText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 4 },
  roleCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 12, borderWidth: 1.5 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  roleLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  roleDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  confirmBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});

// ──── Main Screen ────────────────────────────────────────────────────────────
export default function UsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing } = useResponsive();
  const { isConnected } = useNetworkStatus();
  const { hasAccess } = useRole();
  const { suspendUser, unsuspendUser } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [otpTarget, setOtpTarget] = useState<AppUser | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AppUser | null>(null);
  const [registrationVisible, setRegistrationVisible] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [roleTarget, setRoleTarget] = useState<AppUser | null>(null);
  const [updatingRole, setUpdatingRole] = useState(false);

  const { data: users, isLoading, error, refetch } = useApiUsers();
  const deleteUser = useApiCreateCustomer();

  const filtered = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    const q = search.toLowerCase();
    return users.filter(u =>
      u.fullName.toLowerCase().includes(q) ||
      u.idNumber.toLowerCase().includes(q) ||
      u.branch.toLowerCase().includes(q) ||
      u.telephone.includes(q)
    );
  }, [users, search]);

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  const handleSuspend = async (reason?: string) => {
    if (!suspendTarget || !reason?.trim()) return;
    const success = await suspendUser(suspendTarget.id, reason.trim());
    if (success) {
      setSuspendTarget(null);
      setSuspensionReason('');
      refetch();
    }
  };

  const handleUnsuspend = async (userId: string) => {
    const success = await unsuspendUser(userId);
    if (success) {
      refetch();
    }
  };

  const handleRoleChange = async (newRole: string) => {
    if (!roleTarget || !newRole) return;
    setUpdatingRole(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: roleTarget.id, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to update role');
        return;
      }
      Alert.alert('Success', `Role updated to ${newRole}`);
      setRoleTarget(null);
      refetch();
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setUpdatingRole(false);
    }
  };

  if (!isConnected) {
    return <OfflineScreen onRetry={() => refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header onSearch={setSearch} showSearch />

      <SegmentControl tabs={['System Users', 'Registration']} active={activeTab} onChange={setActiveTab} />

      {activeTab === 0 ? (
        <>
          {/* Filter bar */}
          <View style={[styles.filterBar, { paddingHorizontal: hPad, paddingBottom: 12 }]}>
            <Text style={[styles.resultCount, { color: colors.textMuted }]}>
              {filtered.length} user{filtered.length !== 1 ? 's' : ''} found
            </Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setRegistrationVisible(true)}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.addBtnText}>Add User</Text>
            </TouchableOpacity>
          </View>

          {/* Role Legend */}
          <View style={[styles.roleLegend, { backgroundColor: colors.card, borderColor: colors.border, paddingHorizontal: hPad }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.roleLegendText, { color: colors.textMuted }]}>
              <Text style={[styles.roleLegendBold, { color: colors.text }]}>Roles:</Text>
              {' '}
              <Text style={{ color: colors.primary }}>Manager</Text> (full access) •
              <Text style={{ color: colors.info }}> Supervisor</Text> (reports/approvals) •
              <Text style={{ color: '#f59e0b' }}> Officer</Text> (loans/customers) •
              <Text style={{ color: colors.textMuted }}> User</Text> (basic)
            </Text>
          </View>

          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <ApiError message={error instanceof Error ? error.message : 'Failed to load users'} onRetry={() => refetch()} />
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 80 }}
              showsVerticalScrollIndicator={false}
            >
              {filtered.length === 0 ? (
                <EmptyState icon="users" title="No users found" description="Try a different search term" />
              ) : (
                filtered.map(user => (
                <UserCard
                  key={user.id}
                  user={user}
                  onDelete={() => setDeleteTarget(user)}
                  onResetPassword={() => setOtpTarget(user)}
                  onSuspend={() => setSuspendTarget(user)}
                  onUnsuspend={() => handleUnsuspend(user.id)}
                  onChangeRole={() => setRoleTarget(user)}
                  canDelete={hasAccess('manager')}
                  canManage={hasAccess('supervisor')}
                />
                ))
              )}
            </ScrollView>
          )}
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 80 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.regCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
            <View style={[styles.regIconBg, { backgroundColor: colors.accent }]}>
              <Feather name="user-plus" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.regTitle, { color: colors.text }]}>New Registration</Text>
            <Text style={[styles.regDesc, { color: colors.textMuted }]}>
              Register a new Micro-Enterprise or Chama group for loan eligibility. The multi-step form captures all required details.
            </Text>
            <TouchableOpacity
              style={[styles.regBtn, { backgroundColor: colors.primary }]}
              onPress={() => setRegistrationVisible(true)}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.regBtnText}>Start Registration</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.regCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
            <Text style={[styles.cardHeader, { color: colors.text }]}>Recent Registrations</Text>
            {(users || []).slice(0, 5).length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No registrations yet</Text>
            ) : (
              (users || []).slice(0, 5).map((u, i) => (
                <View key={u.id} style={[styles.recentRow, { borderBottomColor: colors.border, borderBottomWidth: i < 4 ? 1 : 0 }]}>
                  <View>
                    <Text style={[styles.recentName, { color: colors.text }]}>{u.fullName}</Text>
                    <Text style={[styles.recentSub, { color: colors.textMuted }]}>{u.email}</Text>
                  </View>
                  <StatusBadge status={normalizeRole(u.role)} size="sm" />
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* Registration Full-Screen Modal */}
      <RegistrationModal visible={registrationVisible} onClose={() => setRegistrationVisible(false)} />

      {/* Delete confirm */}
      <ConfirmModal
        visible={!!deleteTarget}
        title="Delete User"
        message={`Are you sure you want to delete ${deleteTarget?.fullName}? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteUser.isPending}
        onConfirm={() => { if (deleteTarget) { deleteUser.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); } }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* OTP Reset */}
      <OTPModal
        visible={!!otpTarget}
        userName={otpTarget?.fullName ?? ''}
        onSuccess={() => setOtpTarget(null)}
        onCancel={() => setOtpTarget(null)}
      />

      {/* Suspend confirm */}
      <ConfirmModal
        visible={!!suspendTarget}
        title="Suspend User"
        message={`Suspend ${suspendTarget?.fullName}? They will not be able to log in until unsuspended.`}
        confirmText="Suspend"
        variant="danger"
        loading={false}
        showInput={true}
        inputLabel="Suspension Reason"
        inputPlaceholder="Enter reason for suspension"
        onConfirm={(reason) => {
          if (reason && suspendTarget) {
            handleSuspend(reason);
          }
        }}
        onCancel={() => { setSuspendTarget(null); setSuspensionReason(''); }}
      />

      {/* Role Assignment */}
      <RoleModal
        visible={!!roleTarget}
        user={roleTarget}
        onClose={() => setRoleTarget(null)}
        onSuccess={() => refetch()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  roleLegend: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1 },
  roleLegendText: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },
  roleLegendBold: { fontFamily: 'Inter_600SemiBold' },
  regCard: { borderRadius: 16, padding: 20, marginBottom: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  regIconBg: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12, alignSelf: 'center' },
  regTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center', marginBottom: 8 },
  regDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  regBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  regBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  cardHeader: { fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  recentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  recentName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  recentSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
