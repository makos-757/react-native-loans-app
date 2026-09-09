import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Header } from '@/components/Header';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAuth } from '@/context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { API_BASE_URL } from '@/config';
import { useRouter } from 'expo-router';

const MAX_PHOTO_SIZE = 2 * 1024 * 1024;

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const { currentUser, logout, accessToken } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [telephone, setTelephone] = useState(currentUser?.telephone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [branch, setBranch] = useState(currentUser?.branch || '');
  const [assignment, setAssignment] = useState(currentUser?.assignment || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);

  const bottomPad = isDesktop ? 24 : Platform.OS === 'web' ? 34 : insets.bottom;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  if (!currentUser) return null;

  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) {
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_SIZE) {
        Alert.alert('File too large', 'Profile photo must be less than 2MB');
        return;
      }
      if (!asset.fileSize) {
        try {
          const info = await FileSystem.getInfoAsync(asset.uri);
          if (info.size && info.size > MAX_PHOTO_SIZE) {
            Alert.alert('File too large', 'Profile photo must be less than 2MB');
            return;
          }
        } catch {
          // ignore
        }
      }
      setProfilePhotoUri(asset.uri);
    }
  };

  const handleSave = async () => {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const sanitizedPhone = telephone.replace(/\D/g, '');

    if (!trimmedName || !sanitizedPhone || !trimmedEmail) {
      Alert.alert('Error', 'Full name, telephone, and email are required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (sanitizedPhone.length < 7) {
      Alert.alert('Error', 'Please enter a valid telephone number');
      return;
    }
    if (!accessToken) {
      Alert.alert('Error', 'Your session has expired. Please log in again.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('fullName', trimmedName);
      formData.append('telephone', sanitizedPhone);
      formData.append('email', trimmedEmail);

      if (profilePhotoUri) {
        const photoName = profilePhotoUri.split('/').pop() ?? 'profile.jpg';
        const photoType = photoName.endsWith('.png') ? 'image/png' : 'image/jpeg';
        formData.append('profilePhoto', { uri: profilePhotoUri, name: photoName, type: photoType } as any);
      }

      const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Update Failed', data.error || 'Could not update profile');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setProfilePhotoUri(null);
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Error', 'Please enter your password to confirm');
      return;
    }
    if (!accessToken) {
      Alert.alert('Error', 'Your session has expired. Please log in again.');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.hasActiveLoans) {
          Alert.alert(
            'Cannot Delete Account',
            `You have ${data.activeLoanCount} active loan(s) with an outstanding balance of KES ${data.outstandingBalance?.toLocaleString() || '0'}. Please clear your loan balance before requesting account deactivation.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'View Loans', onPress: () => { router.push('/(tabs)/loans' as any); setDeleteVisible(false); } },
            ],
          );
        } else {
          Alert.alert('Cannot Delete Account', data.error || 'Account deactivation failed');
        }
        return;
      }
      await logout();
      router.replace('/login');
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setDeleting(false);
      setDeleteVisible(false);
      setDeletePassword('');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/login');
    } catch {
      Alert.alert('Error', 'Logout failed. Please try again.');
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
        <View style={[styles.profileHeader, { backgroundColor: colors.primary }]}> 
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: colors.primaryForeground }]}
            onPress={pickProfilePhoto}
            activeOpacity={0.8}
          >
            {profilePhotoUri ? (
              <Image source={{ uri: profilePhotoUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {currentUser.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </Text>
            )}
            <View style={styles.avatarOverlay}>
              <Feather name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerName, { color: colors.primaryForeground }]}>{currentUser.fullName}</Text>
          <Text style={[styles.headerRole, { color: 'rgba(255,255,255,0.8)' }]}>{currentUser.role} • {currentUser.branch}</Text>
        </View>

        {saved && (
          <View style={[styles.successBanner, { backgroundColor: colors.success + '20' }]}> 
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={[styles.successText, { color: colors.success }]}>Profile updated successfully</Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Personal Information</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Full Name</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full Name"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Telephone</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              value={telephone}
              onChangeText={setTelephone}
              placeholder="Telephone"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Branch</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              value={branch}
              onChangeText={setBranch}
              placeholder="Branch"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Assignment</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              value={assignment}
              onChangeText={setAssignment}
              placeholder="Assignment"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Account Information</Text>

          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Credit Score</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{currentUser.creditScore ?? 'N/A'}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Loan Limit</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{currentUser.loanLimit ? `Ksh ${currentUser.loanLimit.toLocaleString()}` : 'N/A'}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Current Balance</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{currentUser.currentLoanBalance ? `Ksh ${currentUser.currentLoanBalance.toLocaleString()}` : 'Ksh 0'}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>PF Number</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{currentUser.pfNumber}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>ID Number</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{currentUser.idNumber}</Text>
          </View>
          {!!currentUser.isSuspended && (
            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}> 
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Status</Text>
              <Text style={[styles.infoValue, { color: colors.destructive }]}>Suspended</Text>
            </View>
          )}
          {!!currentUser.suspensionReason && (
            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}> 
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Suspension Reason</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{currentUser.suspensionReason}</Text>
            </View>
          )}
          <View style={styles.infoRow}> 
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Member Since</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}> 
              {new Date(currentUser.createdAt).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow, borderWidth: 1, borderColor: colors.destructive + '40' }]}> 
          <Text style={[styles.cardTitle, { color: colors.destructive }]}>Danger Zone</Text>
          <Text style={[styles.dangerDesc, { color: colors.textMuted }]}>Account deactivation is irreversible. If you have active loan balances, you must settle them first.</Text>
          <TouchableOpacity style={[styles.deleteBtn, { borderColor: colors.destructive }]} onPress={() => setDeleteVisible(true)}>
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Deactivate Account</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.border }]} onPress={handleLogout}>
          <Feather name="log-out" size={16} color={colors.textMuted} />
          <Text style={[styles.logoutBtnText, { color: colors.textMuted }]}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <ConfirmModal
        visible={deleteVisible}
        title="Deactivate Account?"
        message="This action is permanent and cannot be undone. If you have active loans, you must clear them first."
        confirmText="Deactivate Account"
        variant="danger"
        loading={deleting}
        showInput
        inputLabel="Confirm Password"
        inputPlaceholder="Enter your password"
        onConfirm={() => handleDelete()}
        onCancel={() => { setDeleteVisible(false); setDeletePassword(''); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderColor: '#fff',
  },
  avatarText: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  headerName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  headerRole: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  successText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  infoValue: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  dangerDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginBottom: 12,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  deleteBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 24,
  },
  logoutBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
});
