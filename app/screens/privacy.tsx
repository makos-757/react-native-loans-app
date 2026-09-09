import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { useRouter } from 'expo-router';

export default function PrivacyPolicyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const router = useRouter();

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header onSearch={() => {}} showSearch={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 80 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>Privacy Policy</Text>
        <Text style={[styles.date, { color: colors.textMuted, fontSize: fontSize.sm }]}>
          Last updated: July 2026
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Data We Collect</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Vaultiline collects the following categories of personal data when you use our services:
          </Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• Phone number — used for account authentication (OTP), identification, and M-Pesa payment processing.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• Email address — used for account recovery and communications.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• National ID number — used for identity verification (KYC) as required by Kenyan regulations.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• Payment records — transaction amounts, references, and M-Pesa payment statuses.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• Profile information — name, branch, assignment, and role (for system users).</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• Device and usage data — IP address, user agent, and audit logs for security purposes.</Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Purpose of Data Collection</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Your data is collected and processed for the following purposes:
          </Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• To provide and maintain our loan management and financial services.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• To verify your identity as required by the Kenya Data Protection Act (2019).</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• To process M-Pesa payments and provide transaction receipts.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• To communicate with you regarding your account, including OTP verification.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• To comply with regulatory and legal obligations in Kenya.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• To improve our services and ensure platform security.</Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Data Protection Compliance</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Vaultiline complies with the Kenya Data Protection Act (2019) and its regulations.
          </Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• Data is stored securely using encryption at rest and in transit (HTTPS).</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• We do not sell or share your personal data with third parties without consent.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• Passwords are hashed using SHA-256 with per-user salts.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• OTP codes are hashed before storage and expire after 5 minutes.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• You have the right to access, correct, or request deletion of your personal data.</Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>• We retain data only as long as necessary for the stated purposes or as required by law.</Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Contact Information</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            For privacy-related inquiries, data access requests, or to report a concern:
          </Text>
          <Text style={[styles.contact, { color: colors.primary }]}>Email: privacy@example.com</Text>
          <Text style={[styles.contact, { color: colors.primary }]}>Phone: +254 20 000 0000</Text>
        </View>

        <TouchableOpacity
          style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.backBtnText, { color: colors.primary }]}>Back to Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', paddingTop: 20, paddingBottom: 4, paddingHorizontal: 16 },
  date: { paddingHorizontal: 16, paddingBottom: 24, fontFamily: 'Inter_400Regular' },
  section: { borderRadius: 16, padding: 18, marginHorizontal: 16, marginBottom: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 8 },
  bullet: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 4, marginLeft: 8 },
  contact: { fontSize: 14, fontFamily: 'Inter_500Medium', marginBottom: 4, marginLeft: 8 },
  backBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16, marginHorizontal: 16, borderWidth: 1.5 },
  backBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});