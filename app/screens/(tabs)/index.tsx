import { formatKsh } from "@/utils/formatCurrency";
import { API_BASE_URL } from '@/config';
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { KPICard } from '@/components/KPICard';
import { BarChart, LineChart, PieChart } from '@/components/SimpleChart';
import { useApiDashboardStats, useApiChartData } from '@/hooks/useApiQueries';
import { ApiError } from '@/components/ApiError';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRole } from '@/hooks/useRole';
import { OfflineScreen } from '@/components/OfflineScreen';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';

function BulkEmailAndSmsSection() {
  const colors = useColors();
  const { isDesktop } = useResponsive();
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState<'All' | 'Filtered'>('All');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const { accessToken } = useAuth();

  const handleSend = async () => {
    if (!message.trim()) { Alert.alert('Error', 'Please enter a message'); return; }
    if (!accessToken) { Alert.alert('Error', 'Not authenticated'); return; }
    if (!sendEmail && !sendSms) { Alert.alert('Error', 'Please select at least one channel (Email or SMS)'); return; }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/bulk-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: message.trim(),
          recipientType: recipients === 'All' ? 'all' : 'filtered',
          filterBranch: '',
          sendEmail,
          sendSms,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to send messages');
        return;
      }
      const channels = [];
      if (sendEmail) channels.push('email');
      if (sendSms) channels.push('SMS');
      setResult({ sent: data.sent, failed: data.failed, total: data.total });
      Alert.alert('Success', `Sent to ${data.sent} of ${data.total} recipients via ${channels.join(' and ')}${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
      setMessage('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[smsStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={smsStyles.header}>
        <View style={[smsStyles.iconBg, { backgroundColor: colors.accent }]}>
          <Feather name="send" size={18} color={colors.primary} />
        </View>
        <Text style={[smsStyles.title, { color: colors.text }]}>Bulk Email and SMS</Text>
      </View>

      <View style={smsStyles.channelRow}>
        <TouchableOpacity
          style={[smsStyles.channelBtn, sendEmail && smsStyles.channelActive]}
          onPress={() => setSendEmail(!sendEmail)}
        >
          <Feather name="mail" size={14} color={sendEmail ? '#fff' : colors.textMuted} />
          <Text style={[smsStyles.channelText, { color: sendEmail ? '#fff' : colors.textMuted }]}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[smsStyles.channelBtn, sendSms && smsStyles.channelActive]}
          onPress={() => setSendSms(!sendSms)}
        >
          <Feather name="message-square" size={14} color={sendSms ? '#fff' : colors.textMuted} />
          <Text style={[smsStyles.channelText, { color: sendSms ? '#fff' : colors.textMuted }]}>SMS</Text>
        </TouchableOpacity>
      </View>

      <View style={smsStyles.recipientRow}>
        {(['All', 'Filtered'] as const).map(opt => (
          <TouchableOpacity
            key={opt}
            style={[
              smsStyles.recipientBtn,
              recipients === opt ? smsStyles.recipientActive : smsStyles.recipientInactive,
            ]}
            onPress={() => setRecipients(opt)}
          >
            <Text style={[
              smsStyles.recipientText,
              recipients === opt ? smsStyles.recipientTextActive : smsStyles.recipientTextInactive,
            ]}>
              {opt} Recipients
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={[smsStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
        placeholder="Type your message here..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={4}
        value={message}
        onChangeText={setMessage}
        maxLength={160}
      />
      <Text style={[smsStyles.charCount, { color: colors.textMuted }]}>{message.length}/160</Text>

      <View style={smsStyles.actions}>
        <TouchableOpacity
          style={[smsStyles.btn, smsStyles.btnSecondary]}
          onPress={() => setMessage('')}
        >
          <Feather name="trash-2" size={14} color={colors.destructive} />
          <Text style={[smsStyles.btnText, smsStyles.btnTextSecondary]}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[smsStyles.btn, smsStyles.btnDanger]}
          onPress={() => {}}
        >
          <Feather name="edit-2" size={14} color={colors.warning} />
          <Text style={[smsStyles.btnText, { color: colors.warning }]}>Edit Template</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[smsStyles.btn, smsStyles.btnPrimary]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="send" size={14} color="#fff" />
          }
          <Text style={[smsStyles.btnText, smsStyles.btnTextPrimary]}>Send</Text>
        </TouchableOpacity>
      </View>
      {result && (
        <View style={[smsStyles.result, { backgroundColor: colors.background }]}>
          <Text style={[smsStyles.resultText, { color: colors.text }]}>
            Sent: <Text style={{ color: '#10b981' }}>{result.sent}</Text> | Failed: <Text style={{ color: '#ef4444' }}>{result.failed}</Text> | Total: {result.total}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDesktop, isTablet } = useResponsive();
  const { isConnected } = useNetworkStatus();
  const { hasAccess } = useRole();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useApiDashboardStats();
  const { data: chartData, isLoading: chartLoading, error: chartError, refetch: refetchCharts } = useApiChartData();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce((value: string) => setSearchQuery(value), 300);

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const pad = isDesktop ? colors.spacing.xxl : isTablet ? colors.spacing.xl : colors.spacing.lg;
  const fz = colors.fontSize;

  if (!isConnected) {
    return <OfflineScreen onRetry={() => { refetchStats(); refetchCharts(); }} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header showSearch onSearch={debouncedSearch} debounceMs={300} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 17, paddingHorizontal: pad, paddingBottom: bottomPad + (isDesktop ? 24 : 80) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fz.xl }]}>Overview</Text>
          <Text style={[styles.sectionSub, { color: colors.textMuted, fontSize: fz.sm }]}>
            Today, {new Date().toDateString()}
          </Text>
        </View>

{/* KPI Cards */}
         <View style={[styles.kpiGrid, isDesktop && styles.kpiGridDesktop, isTablet && styles.kpiGridTablet]}>
           {hasAccess('officer') && (
           <View style={styles.kpiItem}>
             <KPICard
               title="Total Customers"
               value={stats?.totalCustomers.toLocaleString() ?? '—'}
               icon="users"
               color={colors.primary}
               trend={0}
               isLoading={statsLoading}
               onPress={() => router.push('/(tabs)/users')}
             />
           </View>
           )}
           <View style={styles.kpiItem}>
             <KPICard
               title="Applications"
               value={(stats?.totalApplications ?? 0).toLocaleString()}
               icon="file-text"
               color="#6366f1"
               trend={0}
               isLoading={statsLoading}
               onPress={() => router.push('/(tabs)/loans')}
             />
           </View>
           {hasAccess('supervisor') && (
           <View style={styles.kpiItem}>
             <KPICard
               title="Total Repayments"
               value={formatKsh(stats?.totalRepayments ?? 0)}
               icon="trending-up"
               color="#10b981"
               trend={0}
               isLoading={statsLoading}
               onPress={() => router.push('/(tabs)/reports')}
             />
           </View>
           )}
           <View style={styles.kpiItem}>
             <KPICard
               title="Active Loans"
               value={(stats?.activeLoans ?? 0).toLocaleString()}
               icon="credit-card"
               color="#f59e0b"
               trend={0}
               isLoading={statsLoading}
               onPress={() => router.push('/(tabs)/loans')}
             />
           </View>
         </View>
        {statsError && (
          <ApiError message={statsError instanceof Error ? statsError.message : 'Failed to load statistics'} onRetry={() => refetchStats()} />
        )}

        {hasAccess('manager') && (
          <View style={[styles.chartsContainer, { maxWidth: isDesktop ? 720 : undefined }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fz.lg }]}>6-Month Analytics</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted, fontSize: fz.sm }]}>
                  Loan applications, repayments & distribution
                </Text>
              </View>

              {chartLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textMuted, marginTop: 12 }]}>Loading analytics...</Text>
                </View>
              ) : chartError ? (
                <ApiError message={chartError instanceof Error ? chartError.message : 'Failed to load analytics'} onRetry={() => refetchCharts()} />
              ) : chartData ? (
                <>
                  {isDesktop || isTablet ? (
                    <View style={[styles.chartRow, isTablet && styles.chartRowTablet]}>
                      <View style={{ flex: 1 }}>
                        <BarChart
                          data={chartData.applications}
                          title="Loan Applications per Month"
                          color={colors.primary}
                        />
                      </View>
                  <View style={{ flex: 1 }}>
                  <LineChart
                    data={chartData.repayments}
                    title="Monthly Repayments (Ksh)"
                    color={colors.success}
                    formatValue={(v) => `${(v / 1000).toFixed(0)}K`}
                  />
                  </View>
                    </View>
                  ) : (
                    <>
                      <BarChart
                        data={chartData.applications}
                        title="Loan Applications per Month"
                        color={colors.primary}
                      />
                      <LineChart
                        data={chartData.repayments}
                        title="Monthly Repayments (Ksh)"
                        color={colors.success}
                        formatValue={(v) => `${(v / 1000).toFixed(0)}K`}
                      />
                    </>
                  )}
                  <View style={{ maxWidth: isDesktop ? 520 : 400, alignSelf: isDesktop ? 'flex-start' : 'center', marginTop: 16 }}>
                <PieChart
                  data={chartData.loanTypes}
                  title="Loan Type Distribution"
                  colors={[colors.primary, colors.success]}
                />
                </View>
                </>
              ) : null}
            </View>
        )}

          {hasAccess('manager') && (
            <View style={[styles.sectionHeader, { marginTop: 28 }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fz.lg }]}>Bulk Email and SMS</Text>
              <Text style={[styles.sectionSub, { color: colors.textMuted, fontSize: fz.sm }]}>
                Send messages to recipients
              </Text>
            </View>
          )}
          {hasAccess('manager') && <BulkEmailAndSmsSection />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  sectionSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiGridDesktop: {
    flexWrap: 'nowrap',
  },
  kpiGridTablet: {
    flexWrap: 'wrap',
  },
  kpiItem: {
    width: '48%',
  },
  chartsContainer: {
    marginTop: 8,
  },
  chartRow: {
    flexDirection: 'row',
    gap: 16,
  },
  chartRowTablet: {
    flexWrap: 'wrap',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});

const smsStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  iconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  channelRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  channelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 8, borderWidth: 1,
  },
  channelActive: { backgroundColor: '#059669', borderColor: '#059669' },
  channelText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  recipientRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  recipientBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1,
    paddingHorizontal: 12,
  },
  recipientActive: { backgroundColor: '#059669', borderColor: '#059669' },
  recipientInactive: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  recipientText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  recipientTextActive: { color: '#ffffff' },
  recipientTextInactive: { color: '#475569' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 88, textAlignVertical: 'top', borderColor: '#e2e8f0' },
  charCount: { textAlign: 'right', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 12, color: '#94a3b8' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 12, borderRadius: 8, borderWidth: 1,
  },
  btnPrimary: { backgroundColor: '#059669', borderColor: '#059669' },
  btnSecondary: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  btnDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  btnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  btnTextPrimary: { color: '#ffffff' },
  btnTextSecondary: { color: '#059669' },
  btnTextDanger: { color: '#dc2626' },
  result: { marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  resultText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
