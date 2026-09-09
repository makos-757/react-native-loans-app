// @ts-nocheck
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { ApiError } from '@/components/ApiError';
import { useApiLoanApplications, useApiLoanRepayments } from '@/hooks/useApiQueries';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRole } from '@/hooks/useRole';
import { OfflineScreen } from '@/components/OfflineScreen';
import { EmptyState } from '@/components/EmptyState';
import { formatKsh } from '@/utils/formatCurrency';

function SegmentControl({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  return (
    <View style={[seg.wrap, { backgroundColor: colors.muted, marginHorizontal: isDesktop ? 24 : isTablet ? 20 : 16, marginBottom: 16 }]}>
      {tabs.map((tab, i) => (
        <TouchableOpacity
          key={tab}
          style={[seg.btn, active === i && { backgroundColor: colors.card, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }]}
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

function ApplicationsReport({ officer, branch, search }: { officer: string; branch: string; search: string }) {
  const colors = useColors();
  const { isDesktop } = useResponsive();
  const { data, isLoading, error, refetch } = useApiLoanApplications();

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = search.toLowerCase();
    return data.filter((item: any) => {
      const matchesOfficer = officer === 'All' || item.creditOfficer?.toLowerCase().includes(officer.toLowerCase());
      const matchesBranch = branch === 'All' || item.county?.toLowerCase() === branch.toLowerCase();
      const matchesSearch = !query || item.customerName?.toLowerCase().includes(query) || item.loanNumber?.toLowerCase().includes(query);
      return matchesOfficer && matchesBranch && matchesSearch;
    });
  }, [data, officer, branch, search]);

  if (error) return <ApiError message={error instanceof Error ? error.message : 'Failed to load loan applications'} onRetry={refetch} />;
  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;
  if (!filtered.length) return <EmptyState icon="file-text" title="No applications found" description="Try adjusting your filters or search." />;

  return (
    <View style={{ gap: 10 }}>
      {filtered.map((item: any) => (
        <View key={item.id} style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.name, { color: colors.text }]}>{item.customerName}</Text>
            <Text style={[styles.badge, { color: colors.primary }]}>{item.loanNumber}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Officer: {item.creditOfficer}</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>{item.county}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Principal</Text>
            <Text style={[styles.value, { color: colors.text }]}>{formatKsh(item.principal)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Status</Text>
             <Text style={[styles.value, { color: item.status === 'approved' ? colors.success : colors.warning }]}>{item.status}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function RepaymentsReport({ officer, branch, search }: { officer: string; branch: string; search: string }) {
  const colors = useColors();
  const { data, isLoading, error, refetch } = useApiLoanRepayments();

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = search.toLowerCase();
    return data.filter((item: any) => {
      const matchesOfficer = officer === 'All' || item.creditOfficer?.toLowerCase().includes(officer.toLowerCase());
      const matchesBranch = branch === 'All' || item.county?.toLowerCase() === branch.toLowerCase();
      const matchesSearch = !query || item.customerName?.toLowerCase().includes(query) || item.loanNumber?.toLowerCase().includes(query);
      return matchesOfficer && matchesBranch && matchesSearch;
    });
  }, [data, officer, branch, search]);

  if (error) return <ApiError message={error instanceof Error ? error.message : 'Failed to load repayments'} onRetry={refetch} />;
  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;
  if (!filtered.length) return <EmptyState icon="trending-up" title="No repayments found" description="Try adjusting your filters or search." />;

  return (
    <View style={{ gap: 10 }}>
      {filtered.map((item: any) => (
        <View key={item.id} style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.name, { color: colors.text }]}>{item.customerName}</Text>
            <Text style={[styles.badge, { color: colors.primary }]}>{item.loanNumber}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Amount Paid</Text>
            <Text style={[styles.value, { color: colors.success }]}>{formatKsh(item.amountPaid ?? 0)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Outstanding</Text>
            <Text style={[styles.value, { color: colors.text }]}>{formatKsh(item.remainingBalance ?? 0)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDesktop, isTablet, spacing } = useResponsive();
  const { isConnected } = useNetworkStatus();
  const { hasAccess } = useRole();
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [officer, setOfficer] = useState('All');
  const [branch, setBranch] = useState('All');

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  if (!isConnected) return <OfflineScreen onRetry={() => {}} />;

  if (!hasAccess('supervisor')) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Feather name="lock" size={48} color={colors.textMuted} />
        <Text style={[styles.accessDeniedTitle, { color: colors.text, marginTop: 16 }]}>Access Denied</Text>
        <Text style={[styles.accessDeniedText, { color: colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
          Reports are only available to Supervisors and Managers.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header onSearch={setSearch} showSearch />
      <SegmentControl tabs={['Applications', 'Repayments']} active={activeTab} onChange={setActiveTab} />
      <View style={[styles.filterBar, { paddingHorizontal: hPad }]}>
        <TouchableOpacity style={[styles.filterChip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setOfficer(officer === 'All' ? 'Officer' : 'All')}>
          <Feather name="user" size={14} color={colors.primary} />
          <Text style={[styles.filterText, { color: colors.text }]}>{officer === 'All' ? 'All Officers' : 'Officer Filtered'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterChip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setBranch(branch === 'All' ? 'Nairobi' : 'All')}>
          <Feather name="map-pin" size={14} color={colors.primary} />
          <Text style={[styles.filterText, { color: colors.text }]}>{branch === 'All' ? 'All Branches' : 'Nairobi'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 80 }} showsVerticalScrollIndicator={false}>
        {activeTab === 0 ? <ApplicationsReport officer={officer} branch={branch} search={search} /> : <RepaymentsReport officer={officer} branch={branch} search={search} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  accessDeniedTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  accessDeniedText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  filterBar: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  filterText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  card: { borderRadius: 14, padding: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  badge: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  value: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
