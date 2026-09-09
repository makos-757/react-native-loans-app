import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { API_BASE_URL, IS_TEST_BUILD, APP_ENV, APP_VERSION, BUILD_NUMBER, ENV_LABEL } from '@/config';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { hasAccess, normalizeRole } from '@/lib/rbac';

function SectionCard({ title, icon, children }: { title: string; icon: keyof typeof Feather.glyphMap; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
      <View style={cardStyles.header}>
        <View style={[cardStyles.iconBg, { backgroundColor: colors.accent }]}>
          <Feather name={icon} size={16} color={colors.primary} />
        </View>
        <Text style={[cardStyles.title, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
const cardStyles = StyleSheet.create({
  card: { borderRadius: 16, padding: 18, marginBottom: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  iconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});

function NumericField({ label, value, onChange, prefix, suffix, min, max }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; min?: number; max?: number }) {
  const colors = useColors();
  return (
    <View style={fieldStyles.container}>
      <Text style={[fieldStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={[fieldStyles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
        {prefix && <Text style={[fieldStyles.fix, { color: colors.textMuted }]}>{prefix}</Text>}
        <TextInput
          style={[fieldStyles.input, { color: colors.text }]}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
        />
        {suffix && <Text style={[fieldStyles.fix, { color: colors.textMuted }]}>{suffix}</Text>}
      </View>
      {(min !== undefined || max !== undefined) && (
        <Text style={[fieldStyles.hint, { color: colors.textMuted }]}>
          {min !== undefined && `Min: ${min}`}{min !== undefined && max !== undefined && ' • '}{max !== undefined && `Max: ${max}`}
        </Text>
      )}
    </View>
  );
}
const fieldStyles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 4 },
  fix: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  input: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold', paddingVertical: 10, paddingHorizontal: 6 },
  hint: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
});

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const { settings, updateSettings } = useSettings();
  const { currentUser } = useAuth();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');

  const [maxLoan, setMaxLoan] = useState(settings.maxLoanAmount.toString());
  const [period, setPeriod] = useState(settings.repaymentPeriod.toString());
  const [interest, setInterest] = useState(settings.interestRate.toString());

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  const handleSave = async () => {
    const max = parseInt(maxLoan);
    const p = parseInt(period);
    const r = parseFloat(interest);

    if (isNaN(max) || max < 1000 || max > 10000000) { Alert.alert('Invalid', 'Max loan amount must be between 1,000 and 10,000,000'); return; }
    if (isNaN(p) || p < 1 || p > 52) { Alert.alert('Invalid', 'Repayment period must be 1–52 weeks'); return; }
    if (isNaN(r) || r < 0 || r > 100) { Alert.alert('Invalid', 'Interest rate must be 0–100%'); return; }

    setSaving(true);
    await new Promise(res => setTimeout(res, 800));
    updateSettings({ maxLoanAmount: max, repaymentPeriod: p, interestRate: r });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!currentUser) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header onSearch={setSearch} showSearch={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Current User Info */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.profileAvatar}>
            <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>
              {currentUser.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.primaryForeground }]}>{currentUser.fullName}</Text>
            <Text style={[styles.profileSub, { color: 'rgba(255,255,255,0.8)' }]}>{currentUser.role} • {currentUser.branch}</Text>
            <Text style={[styles.profileEmail, { color: 'rgba(255,255,255,0.7)' }]}>{currentUser.email}</Text>
          </View>
        </View>

        {/* Loan Parameters */}
        <SectionCard title="Loan Parameters" icon="sliders">
          <NumericField
            label="Maximum Loan Amount"
            value={maxLoan}
            onChange={setMaxLoan}
            prefix="Ksh "
            min={1000}
            max={10000000}
          />
          <NumericField
            label="Repayment Period"
            value={period}
            onChange={setPeriod}
            suffix=" weeks"
            min={1}
            max={52}
          />
          <NumericField
            label="Interest Rate"
            value={interest}
            onChange={setInterest}
            suffix=" %"
            min={0}
            max={100}
          />

          {/* Live Calculation Preview */}
          <View style={[styles.previewBox, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <Text style={[styles.previewTitle, { color: colors.primaryHover }]}>Sample Calculation Preview</Text>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Principal (50,000)</Text>
              <Text style={[styles.previewValue, { color: colors.text }]}>Ksh 50,000</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Interest ({interest}%)</Text>
              <Text style={[styles.previewValue, { color: colors.text }]}>Ksh {(50000 * parseFloat(interest || '0') / 100).toLocaleString()}</Text>
            </View>
            <View style={[styles.previewRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
              <Text style={[styles.previewLabel, { color: colors.primaryHover, fontFamily: 'Inter_700Bold' }]}>Total</Text>
              <Text style={[styles.previewValue, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                Ksh {(50000 + 50000 * parseFloat(interest || '0') / 100).toLocaleString()}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Weekly Installment</Text>
              <Text style={[styles.previewValue, { color: colors.text }]}>
                Ksh {Math.ceil((50000 + 50000 * parseFloat(interest || '0') / 100) / parseInt(period || '1')).toLocaleString()}
              </Text>
            </View>
          </View>

          {saved && (
            <View style={[styles.successBanner, { backgroundColor: '#dcfce7' }]}>
              <Feather name="check-circle" size={14} color="#16a34a" />
              <Text style={styles.successText}>Settings saved successfully</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="save" size={16} color="#fff" />
            }
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Parameters'}</Text>
          </TouchableOpacity>
        </SectionCard>

        {/* Your Access Level (read-only — derived from your real account role) */}
        <SectionCard title="Access Level" icon="shield">
          <View style={[styles.roleBadge, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
            <Feather
              name={hasAccess(currentUser.role, 'manager') ? 'award' : hasAccess(currentUser.role, 'supervisor') ? 'eye' : hasAccess(currentUser.role, 'officer') ? 'shield' : 'user'}
              size={14}
              color={colors.primary}
            />
            <Text style={[styles.roleBadgeText, { color: colors.primaryHover }]}>{currentUser.role} (Super Admin)</Text>
          </View>
          <View style={[styles.accessGrid, { backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 12 }]}>
            <Text style={[styles.accessTitle, { color: colors.text }]}>Role Hierarchy</Text>
             {[
              { label: 'User', level: 1, granted: true },
              { label: 'Officer', level: 2, granted: hasAccess(currentUser.role, 'officer') },
              { label: 'Supervisor', level: 3, granted: hasAccess(currentUser.role, 'supervisor') },
              { label: 'Manager (Super Admin)', level: 4, granted: hasAccess(currentUser.role, 'manager') },
            ].map(({ label, level, granted }) => (
              <View key={label} style={styles.accessRow}>
                <Feather name={granted ? 'check-circle' : 'x-circle'} size={14} color={granted ? colors.success : colors.textMuted} />
                <Text style={[styles.accessText, { color: granted ? colors.text : colors.textMuted }]}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.accessGrid, { backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 12 }]}>
            <Text style={[styles.accessTitle, { color: colors.text }]}>Your Permissions</Text>
             {[
              { perm: 'Approve/Decline Loans', granted: hasAccess(currentUser.role, 'officer') },
              { perm: 'Suspend/Unsuspend Users', granted: hasAccess(currentUser.role, 'manager') },
              { perm: 'Adjust Loan Limits', granted: hasAccess(currentUser.role, 'manager') },
              { perm: 'View All Transactions', granted: hasAccess(currentUser.role, 'supervisor') },
              { perm: 'View Audit Logs', granted: hasAccess(currentUser.role, 'supervisor') },
              { perm: 'Trigger Manual Reviews', granted: hasAccess(currentUser.role, 'supervisor') },
              { perm: 'Delete Records', granted: hasAccess(currentUser.role, 'supervisor') },
              { perm: 'Register Customers', granted: true },
            ].map(({ perm, granted }) => (
              <View key={perm} style={styles.accessRow}>
                <Feather name={granted ? 'check-circle' : 'x-circle'} size={14} color={granted ? colors.success : colors.textMuted} />
                <Text style={[styles.accessText, { color: granted ? colors.text : colors.textMuted }]}>{perm}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

{/* Manager Tools */}
         {hasAccess(currentUser.role, 'manager') && (
           <SectionCard title="Manager Tools" icon="briefcase">
<TouchableOpacity style={[styles.profileLink, { borderColor: colors.border }]} onPress={() => router.push('/audit' as any)}>
                 <Feather name="calendar" size={18} color={colors.primary} />
                 <View style={{ flex: 1 }}>
                   <Text style={[styles.profileLinkTitle, { color: colors.text }]}>Monthly Reports</Text>
                   <Text style={[styles.profileLinkSub, { color: colors.textMuted }]}>View financial summaries and loan performance</Text>
                 </View>
                 <Feather name="chevron-right" size={18} color={colors.textMuted} />
               </TouchableOpacity>
               <TouchableOpacity style={[styles.profileLink, { borderColor: colors.border }]} onPress={() => router.push('/audit' as any)}>
                <Feather name="file-text" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.profileLinkTitle, { color: colors.text }]}>Audit Logs</Text>
                  <Text style={[styles.profileLinkSub, { color: colors.textMuted }]}>Review system activity and admin actions</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
           </SectionCard>
         )}

        {/* Account */}
        <SectionCard title="Account" icon="user">
          <TouchableOpacity style={[styles.profileLink, { borderColor: colors.border }]}           onPress={() => router.push('/(tabs)/profile' as any)}>
            <Feather name="user" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileLinkTitle, { color: colors.text }]}>Profile & Account</Text>
              <Text style={[styles.profileLinkSub, { color: colors.textMuted }]}>Update details, manage security, deactivate or delete account</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </SectionCard>

        {/* About */}
        <SectionCard title="About Vaultiline" icon="info">
          {[
            { label: 'Version', value: APP_VERSION },
            { label: 'Build', value: IS_TEST_BUILD ? 'Test Build' : (ENV_LABEL[APP_ENV] || APP_ENV) },
            { label: 'Env', value: APP_ENV },
            { label: 'Build #', value: BUILD_NUMBER },
            { label: 'API', value: API_BASE_URL.replace('https://', '') },
            { label: 'Organization', value: 'Vaultiline Ltd' },
            { label: 'Support', value: 'support@example.com' },
          ].map(item => (
            <View key={item.label} style={[styles.aboutRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.aboutLabel, { color: colors.textMuted }]}>{item.label}</Text>
              <Text style={[styles.aboutValue, { color: colors.text }]}>{item.value}</Text>
            </View>
          ))}
        </SectionCard>

{/* Legal */}
        <SectionCard title="Legal" icon="file-text">
          <TouchableOpacity style={[styles.profileLink, { borderColor: colors.border }]} onPress={() => router.push('/privacy' as any)}>
            <Feather name="shield" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileLinkTitle, { color: colors.text }]}>Privacy Policy</Text>
              <Text style={[styles.profileLinkSub, { color: colors.textMuted }]}>How we collect, use, and protect your data</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.profileLink, { borderColor: colors.border }]} onPress={() => router.push('/loan-terms' as any)}>
            <Feather name="file-text" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileLinkTitle, { color: colors.text }]}>Loan Terms & Disclosures</Text>
              <Text style={[styles.profileLinkSub, { color: colors.textMuted }]}>Interest rates, repayment terms, and penalties</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </SectionCard>

{/* Manager Tools */}
         {hasAccess(currentUser.role, 'manager') && (
           <SectionCard title="Manager Tools" icon="bar-chart-2">
              <TouchableOpacity style={[styles.profileLink, { borderColor: colors.border }]} onPress={() => router.push('/audit' as any)}>
                <Feather name="activity" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.profileLinkTitle, { color: colors.text }]}>Audit Logs</Text>
                  <Text style={[styles.profileLinkSub, { color: colors.textMuted }]}>View system audit trail and activity logs</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
             <TouchableOpacity style={[styles.profileLink, { borderColor: colors.border }]} onPress={() => Alert.alert('Coming Soon', 'Monthly reports feature will be available in a future update')}>
               <Feather name="file-text" size={18} color={colors.primary} />
               <View style={{ flex: 1 }}>
                 <Text style={[styles.profileLinkTitle, { color: colors.text }]}>Monthly Reports</Text>
                 <Text style={[styles.profileLinkSub, { color: colors.textMuted }]}>Financial summaries and loan performance reports</Text>
               </View>
               <Feather name="chevron-right" size={18} color={colors.textMuted} />
             </TouchableOpacity>
           </SectionCard>
         )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 16, marginBottom: 16 },
  profileAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  profileName: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  profileSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter_400Regular', marginTop: 2 },
  profileEmail: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', marginTop: 1 },
  previewBox: { borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1 },
  previewTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  previewLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  previewValue: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 8, marginBottom: 10 },
  successText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#16a34a' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start' },
  roleBadgeText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  accessGrid: {},
  accessTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  accessRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  accessText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  aboutLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  aboutValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  profileLinkTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  profileLinkSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
});
