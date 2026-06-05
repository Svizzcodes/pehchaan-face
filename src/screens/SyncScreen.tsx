import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/appStore';
import { syncAttendanceToAWS } from '../sync/awsSync';
import { checkConnectivity } from '../sync/networkMonitor';
import { getUnsyncedCount, purgeSyncedRecords, getAttendanceRecords } from '../database/queries';
import { t, formatNumber } from '../i18n/translations';

export default function SyncScreen() {
  const {
    setScreen,
    unsyncedCount,
    setUnsyncedCount,
    isSyncing,
    setIsSyncing,
    lastSyncTime,
    setLastSyncTime,
    setAttendanceRecords,
    language,
  } = useAppStore();

  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    uploaded: number;
    purged: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    checkConnectivity().then(setIsOnline);
    refreshCount();
  }, []);

  async function refreshCount() {
    const count = await getUnsyncedCount();
    setUnsyncedCount(count);
  }

  async function handleSync() {
    const online = await checkConnectivity();
    setIsOnline(online);

    if (!online) {
      Alert.alert(
        t('offline_title', language),
        t('offline_sync_alert', language)
      );
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await syncAttendanceToAWS();
      setSyncResult({
        success: result.success,
        uploaded: result.uploadedCount,
        purged: result.purgedCount,
        error: result.error,
      });

      if (result.success) {
        setLastSyncTime(Date.now());
        const [count, records] = await Promise.all([
          getUnsyncedCount(),
          getAttendanceRecords(50),
        ]);
        setUnsyncedCount(count);
        setAttendanceRecords(records);
      }
    } finally {
      setIsSyncing(false);
    }
  }

  async function handlePurge() {
    Alert.alert(
      t('purge_confirm_title', language),
      t('purge_confirm_body', language),
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('purge_synced_storage', language).replace('Purge Synced Device Storage', 'Purge'),
          style: 'destructive',
          onPress: async () => {
            const count = await purgeSyncedRecords();
            const records = await getAttendanceRecords(50);
            setAttendanceRecords(records);
            Alert.alert(t('success', language), t('removed_count_logs', language).replace('{count}', formatNumber(count, language)));
          },
        },
      ]
    );
  }

  function formatTime(ts: number): string {
    return formatNumber(new Date(ts).toLocaleString('en-IN'), language);
  }

  return (
    <LinearGradient colors={['#090D1A', '#0F172A', '#1E1B4B']} style={styles.fullContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setScreen('home')} activeOpacity={0.7} style={styles.iconBtn}>
            <Text style={styles.backText}>← {t('back', language)}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('sync_purge_title', language)}</Text>
          <View style={{ width: 50 }} />
        </View>

        <View style={styles.content}>
          {/* Network Status */}
          <View style={styles.glassCard}>
            <Text style={styles.cardTitle}>{t('device_connection', language)}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  isOnline === null
                    ? styles.dotGray
                    : isOnline
                    ? styles.dotGreen
                    : styles.dotRed,
                ]}
              />
              <Text style={styles.statusText}>
                {isOnline === null ? t('scanning', language) : isOnline ? t('online_aws', language) : t('offline_mode', language)}
              </Text>
              <TouchableOpacity
                onPress={() => checkConnectivity().then(setIsOnline)}
                style={styles.refreshBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.refreshBtnText}>{t('check_btn', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pending Records */}
          <View style={styles.glassCard}>
            <Text style={styles.cardTitle}>{t('pending_records', language)}</Text>
            <Text style={[styles.pendingCount, unsyncedCount > 0 && styles.pendingCountAlert]}>
              {formatNumber(unsyncedCount, language)}
            </Text>
            <Text style={styles.pendingLabel}>{t('logs_awaiting_upload', language)}</Text>
          </View>

          {/* Last Sync */}
          {lastSyncTime && (
            <View style={styles.glassCard}>
              <Text style={styles.cardTitle}>{t('last_sync_timestamp', language)}</Text>
              <Text style={styles.lastSyncTime}>{formatTime(lastSyncTime)}</Text>
            </View>
          )}

          {/* Sync Result */}
          {syncResult && (
            <View style={[styles.glassCard, syncResult.success ? styles.cardSuccess : styles.cardError]}>
              {syncResult.success ? (
                <>
                  <Text style={styles.resultTitle}>✅ {t('sync_successful', language)}</Text>
                  <Text style={styles.resultDetail}>
                    {t('synced', language)}: {formatNumber(syncResult.uploaded, language)} {t('logs', language)}
                  </Text>
                  <Text style={styles.resultDetail}>
                    {t('purge_synced_storage', language)}: {formatNumber(syncResult.purged, language)} {t('logs', language)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.resultTitle}>❌ {t('sync_failed', language)}</Text>
                  <Text style={styles.resultDetail}>{syncResult.error}</Text>
                  <Text style={styles.resultHint}>
                    {t('verify_aws_config', language)}
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Actions */}
          <TouchableOpacity
            style={[styles.syncButton, (isSyncing || unsyncedCount === 0) && styles.buttonDisabled]}
            onPress={handleSync}
            disabled={isSyncing || unsyncedCount === 0}
            activeOpacity={0.8}
          >
            {isSyncing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <LinearGradient
                colors={unsyncedCount === 0 ? ['#334155', '#334155'] : ['#6366F1', '#4F46E5']}
                style={styles.btnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.syncButtonText}>
                  ☁️ {unsyncedCount === 0 ? t('everything_synced', language) : t('sync_logs_to_aws', language).replace('{count}', formatNumber(unsyncedCount, language))}
                </Text>
              </LinearGradient>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.purgeButton}
            onPress={handlePurge}
            activeOpacity={0.8}
          >
            <Text style={styles.purgeButtonText}>🗑️ {t('purge_synced_storage', language)}</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            {t('sync_hint', language)}
          </Text>
        </View>
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
  content: { padding: 20, gap: 14 },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardSuccess: { borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.04)' },
  cardError: { borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.04)' },
  cardTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: '#10B981', shadowColor: '#10B981', shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.5 },
  dotRed: { backgroundColor: '#EF4444', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.5 },
  dotGray: { backgroundColor: '#64748B' },
  statusText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1 },
  refreshBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  refreshBtnText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  pendingCount: { color: '#10B981', fontSize: 48, fontWeight: '800' },
  pendingCountAlert: { color: '#F59E0B' },
  pendingLabel: { color: '#94A3B8', fontSize: 13, marginTop: 2, fontWeight: '500' },
  lastSyncTime: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  resultTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  resultDetail: { color: '#E2E8F0', fontSize: 14, marginTop: 2, fontWeight: '500' },
  resultHint: { color: '#94A3B8', fontSize: 12, marginTop: 8, fontWeight: '500' },
  syncButton: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  btnGradient: {
    padding: 20,
    alignItems: 'center',
  },
  syncButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  purgeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 2,
  },
  purgeButtonText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  hint: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    fontWeight: '500',
    paddingHorizontal: 10,
  },
});
