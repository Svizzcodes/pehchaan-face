import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Platform,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppStore } from '../store/appStore';
import { getAttendanceRecords, AttendanceRecord } from '../database/queries';
import { t, formatNumber } from '../i18n/translations';

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function RecordItem({ item }: { item: AttendanceRecord }) {
  const { language } = useAppStore();
  let locationCoords: { latitude: number; longitude: number } | null = null;
  if (item.location) {
    try {
      locationCoords = JSON.parse(item.location);
    } catch (e) {
      // Ignore parse failure
    }
  }

  const openMap = () => {
    if (!locationCoords) return;
    const { latitude, longitude } = locationCoords;
    const url = Platform.select({
      ios: `maps://app?saddr=&daddr=${latitude},${longitude}`,
      android: `google.navigation:q=${latitude},${longitude}`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    });
    if (url) Linking.openURL(url);
  };

  return (
    <View style={styles.glassRecordCard}>
      <View style={styles.recordAvatar}>
        <Text style={styles.recordAvatarText}>
          {item.employee_name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.recordInfo}>
        <Text style={styles.recordName}>{item.employee_name}</Text>
        <Text style={styles.recordId}>ID: {item.employee_id}</Text>
        
        {/* Time Stamp */}
        <Text style={styles.recordTime}>
          {formatDate(item.timestamp)} · {formatTime(item.timestamp)}
        </Text>

        {/* Location Info */}
        {locationCoords ? (
          <TouchableOpacity onPress={openMap} activeOpacity={0.7} style={styles.locationContainer}>
            <Text style={styles.locationText}>
              📍 {formatNumber(locationCoords.latitude.toFixed(4), language)}°, {formatNumber(locationCoords.longitude.toFixed(4), language)}°
            </Text>
            <Text style={styles.viewMapText}>({t('view_map', language)})</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.locationPlaceholder}>📍 {t('no_location', language)}</Text>
        )}
      </View>

      <View style={styles.recordRight}>
        <Text style={styles.confidenceText}>
          {formatNumber((item.confidence * 100).toFixed(0), language)}% {t('match', language)}
        </Text>
        <View style={[styles.syncBadge, item.synced ? styles.syncedBadge : styles.unsyncedBadge]}>
          <Text style={styles.syncBadgeText}>{item.synced ? `✓ ${t('synced', language)}` : `⏳ ${t('pending', language)}`}</Text>
        </View>
        {item.liveness_passed && (
          <View style={styles.livenessBadge}>
            <Text style={styles.livenessBadgeText}>🛡️ {t('liveness_ok', language)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function RecordsScreen() {
  const { setScreen, attendanceRecords, setAttendanceRecords, language } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  // Animation shared values for drifting background orbs
  const orb1X = useSharedValue(0);
  const orb1Y = useSharedValue(0);
  const orb2X = useSharedValue(0);
  const orb2Y = useSharedValue(0);
  const orb3X = useSharedValue(0);
  const orb3Y = useSharedValue(0);

  useEffect(() => {
    // Floating animation loop for Orb 1 (Top-Right, Indigo)
    orb1X.value = withRepeat(
      withTiming(40, { duration: 10000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb1Y.value = withRepeat(
      withTiming(50, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );

    // Floating animation loop for Orb 2 (Bottom-Left, Purple)
    orb2X.value = withRepeat(
      withTiming(-50, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb2Y.value = withRepeat(
      withTiming(-60, { duration: 11000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );

    // Floating animation loop for Orb 3 (Middle-Right, Teal)
    orb3X.value = withRepeat(
      withTiming(30, { duration: 11000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb3Y.value = withRepeat(
      withTiming(-50, { duration: 8000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedOrb1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb1X.value },
      { translateY: orb1Y.value },
    ],
  }));

  const animatedOrb2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb2X.value },
      { translateY: orb2Y.value },
    ],
  }));

  const animatedOrb3Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb3X.value },
      { translateY: orb3Y.value },
    ],
  }));

  async function refresh() {
    setRefreshing(true);
    const records = await getAttendanceRecords(100);
    setAttendanceRecords(records);
    setRefreshing(false);
  }

  return (
    <LinearGradient colors={['#090D1A', '#0F172A', '#1E1B4B']} style={styles.fullContainer}>
      {/* Decorative dynamic background orbs */}
      <Animated.View style={[styles.backgroundOrb1, animatedOrb1Style]} pointerEvents="none" />
      <Animated.View style={[styles.backgroundOrb2, animatedOrb2Style]} pointerEvents="none" />
      <Animated.View style={[styles.backgroundOrb3, animatedOrb3Style]} pointerEvents="none" />

      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setScreen('home')} activeOpacity={0.7} style={styles.iconBtn}>
            <Text style={styles.backText}>← {t('back', language)}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('attendance_records_title', language)}</Text>
          <Text style={styles.countText}>{formatNumber(attendanceRecords.length, language)} {t('logs', language)}</Text>
        </View>

        {attendanceRecords.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>{t('no_records_saved', language)}</Text>
            <Text style={styles.emptySubtitle}>
              {t('records_empty_subtitle', language)}
            </Text>
          </View>
        ) : (
          <FlatList
            data={attendanceRecords}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <RecordItem item={item} />}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor="#6366F1"
                colors={['#6366F1']}
              />
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fullContainer: { flex: 1 },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? 40 : 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  iconBtn: { padding: 4 },
  backText: { color: '#6366F1', fontSize: 16, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  countText: {
    color: '#6366F1',
    fontSize: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  listContent: { padding: 16, paddingBottom: 40 },
  separator: { height: 12 },
  glassRecordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recordAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  recordAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  recordInfo: { flex: 1, gap: 2, marginRight: 8 },
  recordName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  recordId: { color: '#94A3B8', fontSize: 12 },
  recordTime: { color: '#64748B', fontSize: 12, marginTop: 2 },
  locationContainer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4, gap: 4 },
  locationText: { color: '#6366F1', fontSize: 12, fontWeight: '700' },
  viewMapText: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  locationPlaceholder: { color: '#475569', fontSize: 12, marginTop: 4, fontWeight: '500' },
  recordRight: { alignItems: 'flex-end', gap: 6, minWidth: 90 },
  confidenceText: { color: '#10B981', fontSize: 13, fontWeight: '800' },
  syncBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  syncedBadge: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)' },
  unsyncedBadge: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)' },
  syncBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  livenessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  livenessBadgeText: { fontSize: 9, fontWeight: '700', color: '#C7D2FE' },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: { fontSize: 64, marginBottom: 12 },
  emptyTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySubtitle: { color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22, fontWeight: '500' },
  backgroundOrb1: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 100,
    shadowOpacity: 0.6,
  },
  backgroundOrb2: {
    position: 'absolute',
    bottom: 100,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 120,
    shadowOpacity: 0.5,
  },
  backgroundOrb3: {
    position: 'absolute',
    top: '40%',
    right: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(20, 184, 166, 0.06)',
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 90,
    shadowOpacity: 0.4,
  },
});
