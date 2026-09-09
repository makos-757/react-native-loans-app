import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { API_BASE_URL } from '@/config';

export default function KycScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const { currentUser, accessToken } = useAuth();
  const router = useRouter();

  const [idNumber, setIdNumber] = useState('');
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [idPhotoUri, setIdPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const MAX_SIZE = 3 * 1024 * 1024; // 3MB

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  if (!currentUser) return null;

  const pickSelfie = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) {
      // Check file size, fallback to FileSystem if missing
      if (asset.fileSize && asset.fileSize > MAX_SIZE) {
        Alert.alert('File too large', 'Image must be less than 3MB');
        return;
      }
      if (!asset.fileSize) {
        try {
          const info = await FileSystem.getInfoAsync(asset.uri);
          if (info.size && info.size > MAX_SIZE) {
            Alert.alert('File too large', 'Image must be less than 3MB');
            return;
          }
        } catch {
          // ignore and allow smaller images
        }
      }
      setSelfieUri(asset.uri);
    }
  };

  const pickIdPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.7,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) {
      if (asset.fileSize && asset.fileSize > MAX_SIZE) {
        Alert.alert('File too large', 'Image must be less than 3MB');
        return;
      }
      if (!asset.fileSize) {
        try {
          const info = await FileSystem.getInfoAsync(asset.uri);
          if (info.size && info.size > MAX_SIZE) {
            Alert.alert('File too large', 'Image must be less than 3MB');
            return;
          }
        } catch {
          // ignore
        }
      }
      setIdPhotoUri(asset.uri);
    }
  };

  const handleSubmit = async () => {
    if (!idNumber.trim()) {
      Alert.alert('Error', 'ID number is required');
      return;
    }
    if (!selfieUri || !idPhotoUri) {
      Alert.alert('Error', 'Please upload both selfie and ID photo');
      return;
    }
    if (!accessToken) {
      Alert.alert('Error', 'Session expired. Please log in again.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('idNumber', idNumber.trim());

      const selfieName = selfieUri.split('/').pop() ?? 'selfie.jpg';
      const selfieType = selfieName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      formData.append('selfie', { uri: selfieUri, name: selfieName, type: selfieType } as any);

      const idPhotoName = idPhotoUri.split('/').pop() ?? 'id-photo.jpg';
      const idPhotoType = idPhotoName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      formData.append('idPhoto', { uri: idPhotoUri, name: idPhotoName, type: idPhotoType } as any);

      const res = await fetch(`${API_BASE_URL}/api/kyc/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('KYC Error', data.error || 'Failed to submit KYC');
        return;
      }
      Alert.alert('Success', 'KYC information submitted for verification.');
      router.replace('/(tabs)/profile' as any);
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header onSearch={() => {}} showSearch={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: bottomPad + 80 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>Identity Verification (KYC)</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: fontSize.sm }]}>
          Provide your national ID details to verify your identity. This is required before you can access loan services.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>National ID Number</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            placeholder="e.g., 12345678"
            placeholderTextColor={colors.textMuted}
            value={idNumber}
            onChangeText={setIdNumber}
            keyboardType="numeric"
          />

          <Text style={[styles.cardTitle, { color: colors.text, marginTop: 16 }]}>Selfie Photo</Text>
          <TouchableOpacity
            style={[styles.photoButton, { borderColor: colors.border }]}
            onPress={pickSelfie}
          >
            <Text style={{ color: colors.primary, fontFamily: 'Inter_400Regular' }}>
              {selfieUri ? '📷 Selfie selected' : '📷 Pick selfie from gallery'}
            </Text>
          </TouchableOpacity>
          {selfieUri && (
            <Image source={{ uri: selfieUri }} style={{ width: 80, height: 80, marginTop: 8, borderRadius: 8 }} />
          )}

          <Text style={[styles.cardTitle, { color: colors.text, marginTop: 16 }]}>ID Photo</Text>
          <TouchableOpacity
            style={[styles.photoButton, { borderColor: colors.border }]}
            onPress={pickIdPhoto}
          >
            <Text style={{ color: colors.primary, fontFamily: 'Inter_400Regular' }}>
              {idPhotoUri ? '📷 ID photo selected' : '📷 Pick ID photo from gallery'}
            </Text>
          </TouchableOpacity>
          {idPhotoUri && (
            <Image source={{ uri: idPhotoUri }} style={{ width: 120, height: 80, marginTop: 8, borderRadius: 8 }} />
          )}

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.submitBtnText, { color: '#fff' }]}>Submit KYC Verification</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', paddingTop: 20, paddingBottom: 4, paddingHorizontal: 16 },
  subtitle: { paddingHorizontal: 16, paddingBottom: 24, fontFamily: 'Inter_400Regular' },
  card: { borderRadius: 16, padding: 18, marginHorizontal: 16, borderWidth: 1 },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  photoButton: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  submitBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});