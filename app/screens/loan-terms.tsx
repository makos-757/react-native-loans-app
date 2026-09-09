import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { useRouter } from 'expo-router';

export default function LoanTermsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  const interestRate = 2.5;
  const maxPeriod = 52;
  const principalExample = 50000;
  const totalInterest = principalExample * (interestRate / 100) * maxPeriod;
  const totalPayable = principalExample + totalInterest;
  const weeklyInstallment = Math.ceil(totalPayable / maxPeriod);
  const latePenaltyRate = 5;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header onSearch={() => {}} showSearch={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>Loan Terms &amp; Disclosures</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: fontSize.sm }]}>
          Please read these terms carefully before requesting a loan.
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Interest Rates</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Our loans carry a flat interest rate of <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.text }}>{interestRate}%</Text> per annum, calculated on the principal amount. The total interest payable is determined by the loan amount and repayment period.
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Repayment Period</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Loans are repayable over a period of <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.text }}>1 to {maxPeriod} weeks</Text>. Weekly installments are debited automatically from your registered M-Pesa line. The maximum loan term is {maxPeriod} weeks (1 year).
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Late Payment Penalties</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            A late payment penalty of <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.text }}>{latePenaltyRate}%</Text> of the outstanding installment will be applied for each week a payment remains overdue. Continued non-payment may result in escalation actions and reporting to credit bureaus.
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Total Payable Amount (Example)</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            For a loan of Ksh {principalExample.toLocaleString()} over {maxPeriod} weeks at {interestRate}% interest:
          </Text>
          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { color: colors.textMuted }]}>Principal:</Text>
            <Text style={[styles.calcValue, { color: colors.text }]}>Ksh {principalExample.toLocaleString()}</Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { color: colors.textMuted }]}>Total Interest ({interestRate}% p.a.):</Text>
            <Text style={[styles.calcValue, { color: colors.text }]}>Ksh {totalInterest.toLocaleString()}</Text>
          </View>
          <View style={[styles.calcRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }]}>
            <Text style={[styles.calcLabel, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>Total Payable:</Text>
            <Text style={[styles.calcValue, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>Ksh {totalPayable.toLocaleString()}</Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { color: colors.textMuted }]}>Weekly Installment:</Text>
            <Text style={[styles.calcValue, { color: colors.text }]}>Ksh {weeklyInstallment.toLocaleString()}</Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Acceptance of Terms</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            By requesting a loan through Vaultiline, you acknowledge that you have read, understood, and agree to be bound by these terms and conditions. You confirm that the information provided in your loan application is accurate and complete.
          </Text>
        </View>

        <TouchableOpacity
            style={[styles.checkboxRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setAccepted(!accepted)}
          >
            <View style={[styles.checkbox, { backgroundColor: accepted ? colors.primary : colors.background, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
              {accepted && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={[styles.checkboxLabel, { color: colors.textMuted }]}>
              I have read and accept the loan terms and disclosures
            </Text>
          </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: accepted ? colors.primary : colors.muted }, { opacity: accepted ? 1 : 0.5 }]}
          onPress={() => {
            if (!accepted) return;
            router.push('/(tabs)/qualification' as any);
          }}
          disabled={!accepted}
        >
          <Text style={[styles.submitBtnText, { color: '#fff' }]}>Continue to Loan Application</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', paddingTop: 20, paddingBottom: 4, paddingHorizontal: 16 },
  subtitle: { paddingHorizontal: 16, paddingBottom: 24, fontFamily: 'Inter_400Regular' },
  section: { borderRadius: 16, padding: 18, marginHorizontal: 16, marginBottom: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 8 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  calcLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  calcValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1 },
  checkbox: { marginRight: 4 },
  checkboxLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginHorizontal: 16, marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});