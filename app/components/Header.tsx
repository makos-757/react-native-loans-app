import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';

interface HeaderProps {
  title?: string;
  showSearch?: boolean;
  onSearch?: (q: string) => void;
  debounceMs?: number;
}

export function Header({ title = 'Vaultiline', showSearch = true, onSearch, debounceMs }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDesktop, isTablet } = useResponsive();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { hasAccess } = useRole();
  const [profileVisible, setProfileVisible] = useState(false);
  const [notifVisible, setNotifVisible] = useState(false);
  const [quickVisible, setQuickVisible] = useState(false);

  if (!currentUser) return null;

  const topPad = isDesktop ? 0 : Platform.OS === 'web' ? 0 : insets.top;

  const initials = currentUser.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border }]}>

      {/* LEFT SECTION */}
      <View style={styles.left}>
        <View style={styles.logoWrap}>
          <Image
            source={require('@/assets/icon.png')}
            style={styles.logoImage}
          />
        </View>

        <Text style={[styles.logoText, { color: colors.text }]}>Vaultiline</Text>
      </View>

      {/* RIGHT SECTION */}
      <View style={styles.right}>

        {/* Notifications */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => { setNotifVisible(!notifVisible); setQuickVisible(false); }}>
          <Feather name="bell" size={18} color={colors.textMuted} />
          <View style={styles.badge} />
        </TouchableOpacity>

        {/* Quick Action */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => { setQuickVisible(!quickVisible); setNotifVisible(false); }}>
          <Feather name="plus-circle" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity
          style={styles.avatar}
          onPress={() => { setProfileVisible(!profileVisible); setNotifVisible(false); setQuickVisible(false); }}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </TouchableOpacity>

      </View>

      {/* Profile Dropdown */}
      {profileVisible && (
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setProfileVisible(false)} />
      )}
      {profileVisible && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, right: 16, top: topPad + 60, borderColor: colors.border }]}>
          <Text style={[styles.dropName, { color: colors.text }]}>{currentUser.fullName}</Text>
          <Text style={[styles.dropRole, { color: colors.textMuted }]}>{currentUser.role} • {currentUser.branch}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.menuItem} onPress={() => { setProfileVisible(false); router.push('/(tabs)/profile'); }}>
            <Feather name="user" size={15} color={colors.textMuted} />
            <Text style={[styles.menuText, { color: colors.text }]}>My Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={async () => { setProfileVisible(false); await logout(); }}>
            <Feather name="log-out" size={15} color={colors.destructive} />
            <Text style={[styles.menuText, { color: colors.destructive }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Notifications Dropdown */}
      {notifVisible && (
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setNotifVisible(false)} />
      )}
      {notifVisible && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, right: 60, top: topPad + 60, borderColor: colors.border, minWidth: 280 }]}>
          <View style={[styles.notifHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.dropName, { color: colors.text, marginBottom: 0 }]}>Notifications</Text>
            <TouchableOpacity onPress={() => setNotifVisible(false)}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {['Loan LN-2024-001 awaiting approval', '3 new registrations today', 'Bulk SMS sent successfully'].map((n, i) => (
            <View key={i} style={[styles.menuItem, { borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: colors.border }]}>
              <Feather name="bell" size={13} color={colors.primary} />
              <Text style={[styles.menuText, { fontSize: 12, flex: 1, color: colors.text }]}>{n}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Quick Action Dropdown */}
      {quickVisible && (
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setQuickVisible(false)} />
      )}
      {quickVisible && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, right: 60, top: topPad + 60, borderColor: colors.border, minWidth: 200 }]}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setQuickVisible(false); router.push('/(tabs)/loans'); }}>
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={[styles.menuText, { color: colors.text }]}>New Loan</Text>
          </TouchableOpacity>
          {hasAccess('officer') && (
            <TouchableOpacity style={styles.menuItem} onPress={() => { setQuickVisible(false); router.push('/(tabs)/users'); }}>
              <Feather name="user-plus" size={15} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.text }]}>New Customer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  logoWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
  },
  logoImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  logoText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  avatar: {
    marginLeft: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  dropdown: {
    position: 'absolute',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 2000,
    minWidth: 220,
    zIndex: 2000,
    borderWidth: 1,
  },
  dropName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  dropRole: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  divider: { height: 1, marginVertical: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, paddingVertical: 8 },
  menuText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 1500,
    elevation: 1500,
  },
});