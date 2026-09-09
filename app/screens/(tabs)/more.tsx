import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

type FeatherIconName = keyof typeof Feather.glyphMap;
import { useColors } from '@/hooks/useColors';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import { hasAccess } from '@/lib/rbac';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ALLOWED_SCREENS = ['profile', 'settings', 'audit', 'qualification'] as const;
const LAST_ITEM_TTL_MS = 1000 * 60 * 60 * 24;

type MoreMenuItem = {
  title: string;
  icon: FeatherIconName;
  screen: (typeof ALLOWED_SCREENS)[number];
  description: string;
};

const OFFICER_ITEMS: MoreMenuItem[] = [
  {
    title: 'Profile',
    icon: 'user',
    screen: 'profile',
    description: 'View and edit your profile',
  },
];

const SUPERVISOR_ITEMS: MoreMenuItem[] = [
  {
    title: 'Profile',
    icon: 'user',
    screen: 'profile',
    description: 'View and edit your profile',
  },
  {
    title: 'Audit',
    icon: 'file-text',
    screen: 'audit',
    description: 'Monthly reports and system logs',
  },
];

const MANAGER_ITEMS: MoreMenuItem[] = [
  {
    title: 'Profile',
    icon: 'user',
    screen: 'profile',
    description: 'View and edit your profile',
  },
  {
    title: 'Settings',
    icon: 'settings',
    screen: 'settings',
    description: 'App preferences and loan parameters',
  },
  {
    title: 'Loan Eligibility',
    icon: 'check-circle',
    screen: 'qualification',
    description: 'Pre-loan qualification wizard',
  },
  {
    title: 'Audit',
    icon: 'file-text',
    screen: 'audit',
    description: 'Monthly reports and system logs',
  },
];

const USER_ITEMS: MoreMenuItem[] = [
  {
    title: 'Profile',
    icon: 'user',
    screen: 'profile',
    description: 'View and edit your profile',
  },
  {
    title: 'Loan Eligibility',
    icon: 'check-circle',
    screen: 'qualification',
    description: 'Pre-loan qualification wizard',
  },
];

function getMenuItems(role: string) {
  if (hasAccess(role, 'manager')) return MANAGER_ITEMS;
  if (hasAccess(role, 'supervisor')) return SUPERVISOR_ITEMS;
  if (hasAccess(role, 'officer')) return OFFICER_ITEMS;
  return USER_ITEMS;
}

export default function MoreScreen() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { logout, currentUser } = useAuth();
  const { role } = useRole();
  const [lastItem, setLastItem] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem('vaultiline_last_more_item').then((value) => {
      if (cancelled || !value) return;
      try {
        const parsed = JSON.parse(value);
        const isFresh = parsed?.timestamp && Date.now() - parsed.timestamp < LAST_ITEM_TTL_MS;
        if (isFresh && ALLOWED_SCREENS.includes(parsed.screen)) {
          setLastItem(parsed.screen);
        } else {
          AsyncStorage.removeItem('vaultiline_last_more_item');
        }
      } catch {
        AsyncStorage.removeItem('vaultiline_last_more_item');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const menuItems = getMenuItems(role);

  const handlePress = async (screen: (typeof ALLOWED_SCREENS)[number]) => {
    if (!ALLOWED_SCREENS.includes(screen)) return;
    await AsyncStorage.setItem('vaultiline_last_more_item', JSON.stringify({ screen, timestamp: Date.now() }));
    setLastItem(screen);
    router.push(screen === 'audit' ? '/audit' : `/(tabs)/${screen}` as any);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoggingOut(true);
            await logout();
            router.replace('/login');
          } catch {
            Alert.alert('Error', 'Failed to logout. Please try again.');
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const accountItems = menuItems.filter((item) => ['profile', 'settings'].includes(item.screen));
  const toolsItems = menuItems.filter((item) => !['profile', 'settings'].includes(item.screen));

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}> 
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>More</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Additional features and settings</Text>

        {accountItems.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ACCOUNT</Text>
            {accountItems.map((item) => {
              const isActive = pathname === (item.screen === 'audit' ? '/audit' : `/(tabs)/${item.screen}`);
              const isLast = lastItem === item.screen;
              return (
                <TouchableOpacity
                  key={item.screen}
                  style={[styles.menuItem, { backgroundColor: colors.card, borderColor: isActive ? colors.primary : colors.border }, isActive && styles.menuItemActive]}
                  onPress={() => handlePress(item.screen)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBg, { backgroundColor: isActive ? colors.primary : colors.accent + '20' }]}> 
                    <Feather name={item.icon} size={20} color={isActive ? '#fff' : colors.primary} />
                  </View>
                  <View style={styles.menuItemContent}>
                    <Text style={[styles.menuItemTitle, { color: isActive ? colors.primary : colors.text }]}>{item.title}</Text>
                    <Text style={[styles.menuItemDescription, { color: colors.textMuted }]}>{item.description}</Text>
                  </View>
                  {isLast && <View style={[styles.lastBadge, { backgroundColor: colors.accent }]}><Text style={styles.lastBadgeText}>Last</Text></View>}
                  <Feather name="chevron-right" size={18} color={isActive ? colors.primary : colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {toolsItems.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>TOOLS & LOGS</Text>
            {toolsItems.map((item) => {
              const isActive = pathname === (item.screen === 'audit' ? '/audit' : `/(tabs)/${item.screen}`);
              const isLast = lastItem === item.screen;
              return (
                <TouchableOpacity
                  key={item.screen}
                  style={[styles.menuItem, { backgroundColor: colors.card, borderColor: isActive ? colors.primary : colors.border }, isActive && styles.menuItemActive]}
                  onPress={() => handlePress(item.screen)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBg, { backgroundColor: isActive ? colors.primary : colors.accent + '20' }]}> 
                    <Feather name={item.icon} size={20} color={isActive ? '#fff' : colors.primary} />
                  </View>
                  <View style={styles.menuItemContent}>
                    <Text style={[styles.menuItemTitle, { color: isActive ? colors.primary : colors.text }]}>{item.title}</Text>
                    <Text style={[styles.menuItemDescription, { color: colors.textMuted }]}>{item.description}</Text>
                  </View>
                  {isLast && <View style={[styles.lastBadge, { backgroundColor: colors.accent }]}><Text style={styles.lastBadgeText}>Last</Text></View>}
                  <Feather name="chevron-right" size={18} color={isActive ? colors.primary : colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: '#FEF2F2' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
          disabled={loggingOut}
        >
          {loggingOut ? <ActivityIndicator size="small" color="#DC2626" /> : <Feather name="log-out" size={20} color="#DC2626" />}
          <Text style={[styles.logoutText, { color: '#DC2626' }]}>Logout</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textMuted }]}>Vaultiline v1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    marginTop: 16,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  menuItemActive: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  menuItemDescription: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  lastBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lastBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
  },
});
