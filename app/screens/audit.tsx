import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useRouter } from 'expo-router';

type AuditTab = 'monthly' | 'logs';

export default function AuditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const router = useRouter();
  const [tab, setTab] = useState<AuditTab>('monthly');

  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingHorizontal: hPad, paddingBottom: 24 }} contentContainerStyle={{ gap: 16 }}>
      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>Audit</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: fontSize.md }]}>
        Monthly financial reports and system audit trail
      </Text>

      <View style={[styles.tabRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'monthly' && { backgroundColor: colors.primary }]}
          onPress={() => setTab('monthly')}
        >
          <Feather name="calendar" size={18} color={tab === 'monthly' ? '#fff' : colors.textMuted} />
          <Text style={[styles.tabText, { color: tab === 'monthly' ? '#fff' : colors.textMuted }]}>Monthly</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'logs' && { backgroundColor: colors.primary }]}
          onPress={() => setTab('logs')}
        >
          <Feather name="file-text" size={18} color={tab === 'logs' ? '#fff' : colors.textMuted} />
          <Text style={[styles.tabText, { color: tab === 'logs' ? '#fff' : colors.textMuted }]}>Logs</Text>
        </TouchableOpacity>
      </View>

      {tab === 'monthly' ? (
        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly Financial Reports</Text>
          <Text style={[styles.placeholder, { color: colors.textMuted }]}>
            Use the Reports tab or ask your manager for monthly summaries.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>System Audit Logs</Text>
          <Text style={[styles.placeholder, { color: colors.textMuted }]}>
            Audit logs are available for Managers and Supervisors.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_700Bold', marginBottom: 4 },
  subtitle: { fontFamily: 'Inter_400Regular', marginBottom: 20 },
  tabRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  placeholder: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});
