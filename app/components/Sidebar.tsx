import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: 'grid' as const, href: '/(tabs)/', minRole: 'user' as const },
  { label: 'Users', icon: 'users' as const, href: '/(tabs)/users', minRole: 'officer' as const },
  { label: 'Loans', icon: 'credit-card' as const, href: '/(tabs)/loans', minRole: 'user' as const },
  { label: 'Reports', icon: 'bar-chart-2' as const, href: '/(tabs)/reports', minRole: 'supervisor' as const },
  { label: 'Audit', icon: 'file-text' as const, href: '/audit', minRole: 'manager' as const },
  { label: 'More', icon: 'more-horizontal' as const, href: '/(tabs)/more', minRole: 'user' as const },
];

export function Sidebar() {
  const colors = useColors();
  const { isMobile, isTablet, isDesktop, spacing, fontSize, sidebarWidth } = useResponsive();
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const { hasAccess } = useRole();

  if (!currentUser) return null;
  if (isMobile) return null;

  const initials = currentUser.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isActive = (href: string) => {
    if (href === '/(tabs)/') return pathname === '/' || pathname === '/(tabs)/';
    return pathname.includes(href.replace('/(tabs)', ''));
  };

  const navLabelStyle = {
    fontSize: isDesktop ? 15 : isTablet ? 14 : 13,
    fontFamily: 'Inter_500Medium' as const,
  };

  const navItems = NAV_ITEMS.filter(item => hasAccess(item.minRole));

  return (
    <View style={[styles.sidebar, { backgroundColor: colors.card, borderRightColor: colors.border, width: sidebarWidth }]}>
      {/* Logo */}
      <View style={[styles.logoArea, { borderBottomColor: colors.border, paddingHorizontal: isDesktop ? 24 : 16, paddingVertical: isDesktop ? 24 : 16 }]}>
        <View style={[styles.logoIconBg, { backgroundColor: colors.primary, width: isDesktop ? 44 : 36, height: isDesktop ? 44 : 36 }]}>
          <Image source={require('@/assets/icon.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <View style={styles.logoText}>
          <Text style={[styles.appName, { color: colors.text, fontSize: isDesktop ? 18 : 16 }]}>Vaultiline</Text>
          <Text style={[styles.appSub, { color: colors.textMuted, fontSize: isDesktop ? 12 : 11 }]}>Mashinani</Text>
        </View>
      </View>

      {/* Nav items */}
      <ScrollView style={styles.nav} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: isDesktop ? 20 : 12, paddingHorizontal: isDesktop ? 16 : 10 }}>
        <Text style={[styles.navGroup, { color: colors.textMuted, fontSize: isDesktop ? 11 : 10 }]}>MAIN MENU</Text>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <TouchableOpacity
              key={item.href}
              style={[
                styles.navItem,
                active && { backgroundColor: colors.accent },
                { paddingVertical: isDesktop ? 12 : 10, paddingHorizontal: isDesktop ? 12 : 8 },
              ]}
              onPress={() => router.navigate(item.href as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.navIconWrap, active && { backgroundColor: colors.primary }, { width: isDesktop ? 34 : 30, height: isDesktop ? 34 : 30 }]}>
                <Feather name={item.icon} size={isDesktop ? 18 : 16} color={active ? '#fff' : colors.textMuted} />
              </View>
              <Text style={[styles.navLabel, { color: active ? colors.primary : colors.text }, navLabelStyle]}>
                {item.label}
              </Text>
              {active && <View style={[styles.activeBar, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* User card at bottom */}
      <View style={[styles.userCard, { borderTopColor: colors.border, backgroundColor: colors.muted, padding: isDesktop ? 18 : 14 }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary, width: isDesktop ? 40 : 34, height: isDesktop ? 40 : 34 }]}>
          <Text style={[styles.avatarText, { fontSize: isDesktop ? 14 : 12 }]}>{initials}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.text, fontSize: isDesktop ? 14 : 13 }]} numberOfLines={1}>
            {currentUser.fullName}
          </Text>
          <Text style={[styles.userRole, { color: colors.textMuted, fontSize: isDesktop ? 12 : 11 }]} numberOfLines={1}>
            {currentUser.role} • {currentUser.branch}
          </Text>
        </View>
        <TouchableOpacity style={[styles.signOutBtn, { padding: isDesktop ? 10 : 8 }]}>
          <Feather name="log-out" size={isDesktop ? 18 : 16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    height: '100%',
    borderRightWidth: 1,
    flexDirection: 'column',
  },
  logoArea: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 12,
  },
  logoIconBg: {
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoText: { flexDirection: 'column' },
  appName: { fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  appSub: { fontFamily: 'Inter_400Regular', marginTop: 1 },
  nav: { flex: 1 },
  navGroup: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 8,
    marginTop: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    marginBottom: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  navIconWrap: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  navLabel: {
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  activeBar: {
    position: 'absolute',
    right: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    gap: 10,
  },
  avatar: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: '#fff', fontFamily: 'Inter_700Bold' },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontFamily: 'Inter_600SemiBold' },
  userRole: { fontFamily: 'Inter_400Regular', marginTop: 1 },
  signOutBtn: { padding: 8 },
});
