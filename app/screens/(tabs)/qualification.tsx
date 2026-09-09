import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useApiMyLoanInfo } from '@/hooks/useApiQueries';

const STEPS = ['Personal', 'Employment', 'Business', 'Review'];

function sanitizeNumber(value: string): number {
  const digits = value.replace(/[^0-9.]/g, '');
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function QualificationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { isTablet, isDesktop, spacing } = useResponsive();
  const { data: loanInfo, isLoading, error } = useApiMyLoanInfo();

  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
    monthlyIncome: '',
    businessName: '',
    businessType: 'Retail',
    loanPurpose: 'Business',
    yearsInBusiness: '',
  });

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  const monthlyIncome = sanitizeNumber(profile.monthlyIncome);
  const yearsInBusiness = sanitizeNumber(profile.yearsInBusiness);
  const isReadyForReview = monthlyIncome > 0 && yearsInBusiness >= 0;

  const canProceed = useMemo(() => {
    if (step === 0) return monthlyIncome > 0;
    if (step === 1) return true;
    if (step === 2) return profile.businessName.trim().length > 0;
    return isReadyForReview;
  }, [step, monthlyIncome, profile.businessName, isReadyForReview]);

  const handleNext = () => {
    if (!canProceed) {
      Alert.alert('Incomplete', 'Please complete the current step before continuing.');
      return;
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleSubmit = () => {
    if (!canProceed) {
      Alert.alert('Incomplete', 'Please complete the form before submitting.');
      return;
    }
    Alert.alert('Success', 'Qualification submitted successfully.');
    router.push('/(tabs)/loans');
  };

  if (!currentUser) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Header onSearch={() => {}} showSearch={false} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 80 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Loan Qualification</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Complete your profile to see what loan amount you may qualify for.</Text>

        <View style={styles.stepWrapper}>
          <View style={styles.lineContainer}>
            {STEPS.slice(0, -1).map((_, index) => (
              <View key={index} style={[styles.line, { backgroundColor: index < step ? colors.primary : colors.border }]} />
            ))}
          </View>
          <View style={styles.stepsRow}>
            {STEPS.map((label, index) => {
              const isActive = index === step;
              const isCompleted = index < step;
              return (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.circle, { borderColor: colors.primary, backgroundColor: colors.background }]}> 
                    {isCompleted ? <Feather name="check" size={14} color="#fff" /> : isActive ? <View style={[styles.innerDot, { backgroundColor: colors.primary }]} /> : null}
                  </View>
                  <Text style={[styles.stepLabel, { color: isActive ? colors.primary : colors.textMuted }]} numberOfLines={1}>{label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          {step === 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Personal Details</Text>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Monthly Income (Ksh)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                  placeholder="e.g. 35000"
                  placeholderTextColor={colors.textMuted}
                  value={profile.monthlyIncome}
                  onChangeText={(value) => setProfile((prev) => ({ ...prev, monthlyIncome: value }))}
                  keyboardType="numeric"
                />
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Employment Details</Text>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Loan Purpose</Text>
                <View style={styles.chipRow}>
                  {['Business', 'Education', 'Emergency'].map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: profile.loanPurpose === item ? colors.primary : colors.background }]}
                      onPress={() => setProfile((prev) => ({ ...prev, loanPurpose: item }))}
                    >
                      <Text style={[styles.chipText, { color: profile.loanPurpose === item ? '#fff' : colors.text }]}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Business Details</Text>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Business Name</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                  placeholder="e.g. Wanjiku Traders"
                  placeholderTextColor={colors.textMuted}
                  value={profile.businessName}
                  onChangeText={(value) => setProfile((prev) => ({ ...prev, businessName: value }))}
                />
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Business Type</Text>
                <View style={styles.chipRow}>
                  {['Retail', 'Wholesale', 'Services'].map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: profile.businessType === item ? colors.primary : colors.background }]}
                      onPress={() => setProfile((prev) => ({ ...prev, businessType: item }))}
                    >
                      <Text style={[styles.chipText, { color: profile.businessType === item ? '#fff' : colors.text }]}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Years in Business</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                  placeholder="e.g. 3"
                  placeholderTextColor={colors.textMuted}
                  value={profile.yearsInBusiness}
                  onChangeText={(value) => setProfile((prev) => ({ ...prev, yearsInBusiness: value }))}
                  keyboardType="numeric"
                />
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Review & Submit</Text>
              <View style={[styles.summaryBox, { backgroundColor: colors.accent }]}> 
                <Text style={[styles.summaryText, { color: colors.text }]}>Estimated monthly income: Ksh {monthlyIncome.toLocaleString()}</Text>
                <Text style={[styles.summaryText, { color: colors.text }]}>Loan purpose: {profile.loanPurpose}</Text>
                <Text style={[styles.summaryText, { color: colors.text }]}>Business: {profile.businessName || 'Not provided'}</Text>
                <Text style={[styles.summaryText, { color: colors.text }]}>Years in business: {profile.yearsInBusiness || 'Not provided'}</Text>
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.navBtn, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => setStep((value) => Math.max(0, value - 1))}>
              <Text style={[styles.navBtnText, { color: colors.text }]}>Back</Text>
            </TouchableOpacity>
            {step < STEPS.length - 1 ? (
              <TouchableOpacity style={[styles.navBtn, { backgroundColor: colors.primary }]} onPress={handleNext}>
                <Text style={[styles.navBtnText, { color: '#fff' }]}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.navBtn, { backgroundColor: colors.primary }]} onPress={handleSubmit}>
                <Text style={[styles.navBtnText, { color: '#fff' }]}>Submit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 16, marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  stepWrapper: { marginTop: 8, marginBottom: 24, paddingHorizontal: 12 },
  lineContainer: { position: 'absolute', top: 14, left: 40, right: 40, flexDirection: 'row', zIndex: 0 },
  line: { flex: 1, height: 2, marginHorizontal: 6 },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 },
  stepItem: { flex: 1, alignItems: 'center' },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  innerDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel: { marginTop: 6, fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', width: 80 },
  card: { borderRadius: 16, padding: 18, borderWidth: 1 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  field: { gap: 6 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  summaryBox: { borderRadius: 12, padding: 14, gap: 8 },
  summaryText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  navBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});