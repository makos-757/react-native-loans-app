import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useResponsive } from '@/hooks/useResponsive';
import { useRole } from '@/hooks/useRole';
import { Sidebar } from '@/components/Sidebar';

type IconName = keyof typeof Feather.glyphMap;

function TabIconWithBadge({ name, color, size, badgeCount = 0 }: { name: IconName; color: string; size: number; badgeCount?: number }) {
  return (
    <View style={{ width: size ?? 24, height: size ?? 24, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={name as any} size={size ?? 22} color={color} />
      {badgeCount > 0 && (
        <View style={[styles.badge, { backgroundColor: '#ef4444' }]} accessibilityRole="image" accessibilityLabel={`${badgeCount} new notifications`}>
          <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const { isDesktop } = useResponsive();
  const isIOS = Platform.OS === 'ios';
  const { hasAccess } = useRole();

  if (isDesktop) {
    return (
      <View style={[styles.desktopRoot, { backgroundColor: colors.background }]}>
        <Sidebar />
        <View style={styles.desktopContent}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
          >
            <Tabs.Screen name="index" />
            {hasAccess('officer') && <Tabs.Screen name="users" />}
            <Tabs.Screen name="loans" />
            {hasAccess('supervisor') && <Tabs.Screen name="reports" />}
            <Tabs.Screen name="more" />
            <Tabs.Screen name="profile" />
            {hasAccess('officer') && <Tabs.Screen name="settings" />}
            {hasAccess('officer') && <Tabs.Screen name="qualification" />}
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerShown: false,
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: colors.card,
          borderTopWidth: 0,
          borderTopColor: colors.border,
          elevation: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'Inter_500Medium',
          marginBottom: 2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={95}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <TabIconWithBadge name="grid" color={color} size={size ?? 22} badgeCount={0} />,
        }}
      />
      {hasAccess('officer') && (
        <Tabs.Screen
          name="users"
          options={{
            title: 'Users',
            tabBarIcon: ({ color, size }) => <Feather name="users" size={size ?? 22} color={color} />,
          }}
        />
      )}
      <Tabs.Screen
        name="loans"
        options={{
          title: 'Loans',
          tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size ?? 22} color={color} />,
        }}
      />
      {hasAccess('supervisor') && (
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size ?? 22} color={color} />,
          }}
        />
      )}
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Feather name="more-horizontal" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
      {hasAccess('officer') && <Tabs.Screen name="settings" options={{ href: null }} />}
      {hasAccess('officer') && <Tabs.Screen name="qualification" options={{ href: null }} />}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopContent: {
    flex: 1,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    lineHeight: 14,
  },
});