import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Platform,
  Modal,
  ScrollView,
  Alert,
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
import {
  getAllEnrolledFaces,
  getAttendanceRecords,
  getUnsyncedCount,
  getRecentUniqueAttendanceDays,
  UniqueAttendanceDay,
  AttendanceRecord,
  deleteEnrolledFace,
} from '../database/queries';
import { loadFaceModel } from '../face/modelRunner';
import { t, SUPPORTED_LANGUAGES, formatNumber } from '../i18n/translations';

export default function HomeScreen() {
  const {
    setScreen,
    enrolledFaces,
    setEnrolledFaces,
    setAttendanceRecords,
    setUnsyncedCount,
    modelLoaded,
    setModelLoaded,
    unsyncedCount,
    removeEnrolledFace,
    language,
    setLanguage,
  } = useAppStore();

  const [showEnrolledModal, setShowEnrolledModal] = useState(false);
  const [recentUniqueDays, setRecentUniqueDays] = useState<UniqueAttendanceDay[]>([]);

  // Animation shared values for drifting background orbs
  const orb1X = useSharedValue(0);
  const orb1Y = useSharedValue(0);
  const orb2X = useSharedValue(0);
  const orb2Y = useSharedValue(0);
  const orb3X = useSharedValue(0);
  const orb3Y = useSharedValue(0);

  useEffect(() => {
    initializeApp();

    // Floating animation loop for Orb 1 (Top-Right, Indigo)
    orb1X.value = withRepeat(
      withTiming(50, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb1Y.value = withRepeat(
      withTiming(40, { duration: 11000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );

    // Floating animation loop for Orb 2 (Bottom-Left, Purple)
    orb2X.value = withRepeat(
      withTiming(-60, { duration: 10000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb2Y.value = withRepeat(
      withTiming(-50, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );

    // Floating animation loop for Orb 3 (Middle-Right, Teal)
    orb3X.value = withRepeat(
      withTiming(40, { duration: 11000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb3Y.value = withRepeat(
      withTiming(-60, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
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

  async function initializeApp() {
    try {
      // Load face model once
      loadFaceModel().then((m) => {
        setModelLoaded(m !== null);
      });

      // Load database records
      const [faces, records, unsynced, uniqueDays] = await Promise.all([
        getAllEnrolledFaces(),
        getAttendanceRecords(50),
        getUnsyncedCount(),
        getRecentUniqueAttendanceDays(30),
      ]);

      setEnrolledFaces(faces);
      setAttendanceRecords(records);
      setUnsyncedCount(unsynced);
      setRecentUniqueDays(uniqueDays);
    } catch (err) {
      console.error('[Init] Failed:', err);
    }
  }

  async function handleDelete(employee_id: string, empName: string) {
    Alert.alert(
      t('purge_confirm_title', language) || 'Delete Record',
      `${t('remove_user_confirm', language) || 'Are you sure you want to remove this profile?'} (${empName})`,
      [
        { text: t('cancel', language) || 'Cancel', style: 'cancel' },
        {
          text: t('delete', language) || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEnrolledFace(employee_id);
              removeEnrolledFace(employee_id);
              const uniqueDays = await getRecentUniqueAttendanceDays(30);
              setRecentUniqueDays(uniqueDays);
              Alert.alert(t('success', language) || 'Success', `${empName} ${t('purge_success_alert', language) === 'ಸಾಧನದ ಸಂಗ್ರಹಣೆಯಿಂದ ಸಿಂಕ್ ಮಾಡಿದ ದಾಖಲೆಗಳನ್ನು ಅಳಿಸಲಾಗಿದೆ.' ? 'ತೆಗೆದುಹಾಕಲಾಗಿದೆ.' : 'removed.'}`);
            } catch (err) {
              console.error('[Delete] Failed:', err);
              Alert.alert(t('error', language) || 'Error', 'Failed to delete.');
            }
          },
        },
      ]
    );
  }

  // Get unique authorized days count for an employee ID within a timestamp range (sliding window)
  function getAuthorizedDaysCount(employeeId: string, daysRange: number): number {
    const startTime = Date.now() - daysRange * 24 * 60 * 60 * 1000;
    const d = new Date(startTime);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    return recentUniqueDays.filter(
      (r) => r.employee_id === employeeId && r.date >= dateStr
    ).length;
  }

  const groupedFaces = enrolledFaces.reduce<Record<string, typeof enrolledFaces>>((acc, face) => {
    const designation = face.designation?.trim() || t('general_unassigned', language);
    if (!acc[designation]) acc[designation] = [];
    acc[designation].push(face);
    return acc;
  }, {});

  return (
    <LinearGradient
      colors={['#090D1A', '#0F172A', '#1E1B4B']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Decorative dynamic background orbs */}
      <Animated.View style={[styles.backgroundOrb1, animatedOrb1Style]} pointerEvents="none" />
      <Animated.View style={[styles.backgroundOrb2, animatedOrb2Style]} pointerEvents="none" />
      <Animated.View style={[styles.backgroundOrb3, animatedOrb3Style]} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.appName}>{t('app_title', language)}</Text>
            <Text style={styles.appSubtitle}>{t('app_subtitle', language)}</Text>
            
            {/* Language Selector */}
            <View style={styles.langSelectorWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.langSelectorContainer}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langPill,
                      language === lang.code && styles.langPillActive,
                    ]}
                    onPress={() => setLanguage(lang.code)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.langPillText, language === lang.code && styles.langPillTextActive]}>
                      {lang.flag} {lang.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.statusRow}>
              <View style={[styles.statusDot, modelLoaded ? styles.dotGreen : styles.dotOrange]} />
              <Text style={styles.statusText}>
                {modelLoaded ? t('offline_active', language) : t('fallback_mode', language)}
              </Text>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={[styles.glassCard, styles.glassCardInteractive]}
              onPress={() => setShowEnrolledModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{formatNumber(enrolledFaces.length, language)}</Text>
              <Text style={styles.statLabel}>👥 {t('enrolled_personnel', language)}</Text>
              <Text style={styles.tapToViewText}>{t('tap_to_view', language)}</Text>
            </TouchableOpacity>
            <View style={styles.glassCard}>
              <Text style={[styles.statNumber, unsyncedCount > 0 && styles.textWarning]}>
                {formatNumber(unsyncedCount, language)}
              </Text>
              <Text style={[styles.statLabel, unsyncedCount > 0 && styles.statLabelWarning]}>
                {unsyncedCount > 0 ? t('awaiting_aws_sync', language) : t('synced_secure', language)}
              </Text>
            </View>
          </View>

          {/* Main Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              onPress={() => setScreen('authenticate')}
              activeOpacity={0.9}
              style={styles.primaryButtonWrapper}
            >
              <LinearGradient
                colors={['#6366F1', '#4F46E5']}
                style={styles.primaryButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.primaryButtonIcon}>🔍</Text>
                <Text style={styles.primaryButtonText}>{t('authenticate_face', language)}</Text>
                <Text style={styles.primaryButtonSub}>{t('authenticate_face_sub', language)}</Text>
              </LinearGradient>
            </TouchableOpacity>
   
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setScreen('enroll')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonIcon}>👤</Text>
              <Text style={styles.secondaryButtonText}>{t('enroll_new_face', language)}</Text>
            </TouchableOpacity>
   
            <View style={styles.bottomRow}>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={() => setScreen('records')}
                activeOpacity={0.8}
              >
                <Text style={styles.smallButtonText}>📋 {t('attendance_logs', language)}</Text>
              </TouchableOpacity>
   
              <TouchableOpacity
                style={[styles.smallButton, unsyncedCount > 0 && styles.smallButtonAlert]}
                onPress={() => setScreen('sync')}
                activeOpacity={0.8}
              >
                <Text style={[styles.smallButtonText, unsyncedCount > 0 && styles.smallButtonTextAlert]}>
                  ☁️ {t('aws_sync', language)} {unsyncedCount > 0 ? `(${formatNumber(unsyncedCount, language)})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>{t('zero_network_ready', language)}</Text>
        </ScrollView>
      </SafeAreaView>
 
      {/* Grouped Enrolled Personnel Modal */}
      <Modal
        visible={showEnrolledModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEnrolledModal(false)}
      >
        <View style={modalStyles.modalContainer}>
          <LinearGradient
            colors={['#0F172A', '#090D1A']}
            style={modalStyles.modalContent}
          >
            {/* Modal Header */}
            <View style={modalStyles.modalHeader}>
              <View>
                <Text style={modalStyles.modalTitle}>{t('enrolled_personnel', language)}</Text>
                <Text style={modalStyles.modalSubtitle}>{t('grouped_by_designation', language)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowEnrolledModal(false)}
                style={modalStyles.closeBtn}
                activeOpacity={0.7}
              >
                <Text style={modalStyles.closeBtnText}>{t('close', language)}</Text>
              </TouchableOpacity>
            </View>
 
            {/* List */}
            <ScrollView contentContainerStyle={modalStyles.modalScroll}>
              {enrolledFaces.length === 0 ? (
                <View style={modalStyles.emptyState}>
                  <Text style={modalStyles.emptyText}>{t('no_personnel_enrolled', language)}</Text>
                  <TouchableOpacity
                    style={modalStyles.enrollPromptBtn}
                    onPress={() => {
                      setShowEnrolledModal(false);
                      setScreen('enroll');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={modalStyles.enrollPromptText}>{t('enroll_someone_now', language)}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                Object.keys(groupedFaces).sort().map((designation) => (
                  <View key={designation} style={modalStyles.sectionCard}>
                    {/* Section Header */}
                    <View style={modalStyles.sectionHeader}>
                      <Text style={modalStyles.sectionTitle}>{designation}</Text>
                      <View style={modalStyles.sectionBadge}>
                        <Text style={modalStyles.sectionBadgeText}>
                          {formatNumber(groupedFaces[designation].length, language)} {groupedFaces[designation].length === 1 ? t('person', language) : t('people', language)}
                        </Text>
                      </View>
                    </View>
 
                    {/* Section Personnel List */}
                    <View style={modalStyles.personnelList}>
                      {groupedFaces[designation].map((face) => {
                        const weeklyCount = getAuthorizedDaysCount(face.employee_id, 7);
                        const monthlyCount = getAuthorizedDaysCount(face.employee_id, 30);
 
                        return (
                          <View key={face.employee_id} style={modalStyles.personItem}>
                            {/* Avatar */}
                            <View style={modalStyles.avatar}>
                              <Text style={modalStyles.avatarText}>
                                {face.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
 
                            {/* Details */}
                            <View style={modalStyles.personDetails}>
                              <Text style={modalStyles.personName}>{face.name}</Text>
                              <Text style={modalStyles.personId}>ID: {face.employee_id}</Text>
                              
                              {/* Stats badges */}
                              <View style={modalStyles.statsRow}>
                                <View style={[modalStyles.statBadge, weeklyCount > 0 ? modalStyles.badgeActive : modalStyles.badgeInactive]}>
                                  <Text style={modalStyles.statBadgeText}>
                                    {weeklyCount > 0 ? `🟢 ${formatNumber(weeklyCount, language)}/${formatNumber(7, language)} ${t('days_weekly', language)}` : `⚪ ${formatNumber(0, language)} ${t('days_weekly', language)}`}
                                  </Text>
                                </View>
                                <View style={[modalStyles.statBadge, monthlyCount > 0 ? modalStyles.badgeActive : modalStyles.badgeInactive]}>
                                  <Text style={modalStyles.statBadgeText}>
                                    {monthlyCount > 0 ? `📅 ${formatNumber(monthlyCount, language)}/${formatNumber(30, language)} ${t('days_monthly', language)}` : `📅 ${formatNumber(0, language)} ${t('days_monthly', language)}`}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            {/* Delete Button */}
                            <TouchableOpacity
                              onPress={() => handleDelete(face.employee_id, face.name)}
                              style={modalStyles.deleteBtn}
                              activeOpacity={0.7}
                            >
                              <Text style={modalStyles.deleteBtnText}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </LinearGradient>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 16 : 24,
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  appName: {
    fontSize: 54,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textShadowColor: 'rgba(99, 102, 241, 0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 6,
    letterSpacing: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    shadowOpacity: 0.5,
  },
  dotGreen: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  dotOrange: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  statusText: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
    marginBottom: 32,
  },
  glassCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    shadowOpacity: 0.2,
  },
  glassCardInteractive: {
    borderColor: 'rgba(99, 102, 241, 0.25)',
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.15,
  },
  tapToViewText: {
    fontSize: 10,
    color: '#818CF8',
    marginTop: 6,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  textWarning: {
    color: '#F59E0B',
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statLabelWarning: {
    color: 'rgba(245, 158, 11, 0.8)',
  },
  actionsContainer: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  primaryButtonWrapper: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    shadowOpacity: 0.35,
  },
  primaryButton: {
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  primaryButtonIcon: {
    fontSize: 34,
    marginBottom: 6,
  },
  primaryButtonText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  primaryButtonSub: {
    fontSize: 11,
    color: '#E0E7FF',
    marginTop: 4,
    opacity: 0.9,
    fontWeight: '500',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  secondaryButtonIcon: {
    fontSize: 20,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  smallButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  smallButtonAlert: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  smallButtonTextAlert: {
    color: '#F59E0B',
  },
  footer: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    marginTop: 24,
    marginBottom: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  langSelectorWrapper: {
    marginVertical: 10,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
  },
  langSelectorContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  langPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginRight: 4,
  },
  langPillActive: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 0.3,
  },
  langPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  langPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

const modalStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    height: '85%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalScroll: {
    padding: 24,
    paddingBottom: 60,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
  },
  enrollPromptBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  enrollPromptText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 18,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#A5B4FC',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionBadgeText: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '700',
  },
  personnelList: {
    gap: 14,
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  personDetails: {
    flex: 1,
    marginRight: 8,
  },
  personName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  personId: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'column',
    gap: 6,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  statBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  badgeInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  deleteBtn: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 16,
  },
});
