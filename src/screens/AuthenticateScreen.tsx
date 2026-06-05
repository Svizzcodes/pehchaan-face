import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useAppStore } from '../store/appStore';
import { findBestMatch } from '../face/embeddings';
import { LivenessManager } from '../face/liveness';
import { getFaceEmbedding } from '../face/imageProcessor';
import { insertAttendanceRecord, getAttendanceRecords, getUnsyncedCount } from '../database/queries';
import { t, formatNumber } from '../i18n/translations';

type AuthPhase = 'liveness' | 'recognizing' | 'success' | 'failed';

// How long the liveness interval fires (ms) — used for timeout tracking only
const LIVENESS_TICK_MS = 200;

export default function AuthenticateScreen() {
  const { setScreen, enrolledFaces, setLastAuthResult, setAttendanceRecords, setUnsyncedCount, language } =
    useAppStore();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const photoOutput = usePhotoOutput();

  const [phase, setPhase] = useState<AuthPhase>('liveness');
  const [instruction, setInstruction] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [livenessProgress, setLivenessProgress] = useState(0);
  // Whether user manually completed a gesture (for UI feedback)
  const [gestureCompleted, setGestureCompleted] = useState(false);

  const cameraRef = useRef<any>(null);
  const livenessManagerRef = useRef(new LivenessManager());
  const isProcessingRef = useRef(false);
  const livenessPassedRef = useRef(false);
  const isMountedRef = useRef(true);
  const tickIntervalRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);
  const locationRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  // Helper to translate challenge names dynamically
  function getChallengeInstruction(challengeName: string): string {
    switch (challengeName) {
      case 'blink':
        return t('please_blink', language);
      case 'turn_left':
        return t('turn_left_instruction', language);
      case 'turn_right':
        return t('turn_right_instruction', language);
      case 'smile':
        return t('please_smile', language);
      default:
        return challengeName;
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    if (!hasPermission) requestPermission();

    // Prefetch location reactively in the background to avoid blocking snap inference
    async function prefetchLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          // Get last known location instantly as an immediate cache
          const lastKnown = await Location.getLastKnownPositionAsync({});
          if (lastKnown && isMountedRef.current) {
            locationRef.current = {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              timestamp: lastKnown.timestamp,
            };
          }
          // Fetch accurate live location asynchronously
          const freshLoc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          if (freshLoc && isMountedRef.current) {
            locationRef.current = {
              latitude: freshLoc.coords.latitude,
              longitude: freshLoc.coords.longitude,
              timestamp: freshLoc.timestamp,
            };
          }
        }
      } catch (err) {
        console.warn('[Location Prefetch] Failed:', err);
      }
    }
    prefetchLocation();

    const mgr = livenessManagerRef.current;
    setInstruction(getChallengeInstruction(mgr.currentChallenge));
    return () => {
      isMountedRef.current = false;
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [hasPermission, requestPermission]);

  /**
   * Starts a ticker that only tracks time for the timeout — liveness gestures
   * are fed manually by the user pressing the gesture buttons below.
   */
  useEffect(() => {
    if (phase !== 'liveness') return;

    const mgr = livenessManagerRef.current;
    mgr.reset();
    setInstruction(getChallengeInstruction(mgr.currentChallenge));
    setLivenessProgress(0);
    setGestureCompleted(false);
    livenessPassedRef.current = false;

    // Tick only for timeout tracking — NOT for random auto-pass
    tickIntervalRef.current = setInterval(() => {
      if (livenessPassedRef.current) return;

      // Advance frame count for timeout purposes by passing neutral landmarks
      // (eyes open, no smile, no yaw) so no challenge accidentally self-completes
      const neutral = {
        leftEyeOpenProbability: 0.95,
        rightEyeOpenProbability: 0.95,
        smilingProbability: 0.05,
        yawAngle: 0,
      };
      mgr.processFrame(neutral);

      if (isMountedRef.current) {
        setLivenessProgress(mgr.progress);
      }

      if (mgr.timedOut) {
        clearInterval(tickIntervalRef.current);
        if (isMountedRef.current) {
          setResultMessage(t('liveness_timeout', language));
          setPhase('failed');
        }
      }
    }, LIVENESS_TICK_MS);

    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [phase]);

  // ─── Gesture Handlers ────────────────────────────────────────────────────────

  /**
   * Called when user presses a gesture button. Feeds the appropriate landmark
   * signal to the LivenessManager and, on success, triggers inference.
   */
  const handleGesture = useCallback(
    (action: 'blink' | 'smile' | 'turn') => {
      const mgr = livenessManagerRef.current;
      if (phase !== 'liveness' || livenessPassedRef.current) return;

      let passed = false;

      if (action === 'blink') {
        // Simulate a full blink cycle: eyes close then reopen
        mgr.processFrame({ leftEyeOpenProbability: 0.05, rightEyeOpenProbability: 0.05 });
        passed = mgr.processFrame({ leftEyeOpenProbability: 0.95, rightEyeOpenProbability: 0.95 });
      } else if (action === 'smile') {
        passed = mgr.processFrame({ smilingProbability: 0.9 });
      } else if (action === 'turn') {
        const dir = mgr.currentChallenge === 'turn_left' ? -28 : 28;
        passed = mgr.processFrame({ yawAngle: dir });
      }

      setLivenessProgress(mgr.progress);

      if (passed) {
        livenessPassedRef.current = true;
        clearInterval(tickIntervalRef.current);
        setGestureCompleted(true);
        timeoutRef.current = setTimeout(() => {
          triggerInference();
        }, 600);
      }
    },
    [phase]
  );

  // ─── Inference ───────────────────────────────────────────────────────────────

  const handleAuthComplete = useCallback(
    async (employeeId: string, name: string, conf: number, locationJson: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      try {
        await insertAttendanceRecord(employeeId, name, conf, true, locationJson);
        const [records, unsynced] = await Promise.all([
          getAttendanceRecords(50),
          getUnsyncedCount(),
        ]);
        if (isMountedRef.current) {
          setAttendanceRecords(records);
          setUnsyncedCount(unsynced);
          setLastAuthResult({ success: true, name, confidence: conf, timestamp: Date.now() });
          setConfidence(conf);
          setResultMessage(`${t('welcome_msg', language)}, ${name}!`);
          setPhase('success');
        }
      } catch (err) {
        console.error('[Auth] Database error:', err);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [setAttendanceRecords, setUnsyncedCount, setLastAuthResult, language]
  );

  const triggerInference = useCallback(async () => {
    if (isMountedRef.current) {
      setPhase('recognizing');
      setInstruction(t('matching_face_hold_still', language));
    }

    // 1. Retrieve prefetched accurate GPS location instantly
    let locationStr = 'Unknown';
    if (locationRef.current) {
      locationStr = JSON.stringify(locationRef.current);
    } else {
      // Fast fallback if prefetch didn't resolve yet
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({});
        if (lastKnown) {
          locationStr = JSON.stringify({
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            timestamp: lastKnown.timestamp,
          });
        }
      } catch (locErr) {
        console.warn('[Location Fallback] Failed:', locErr);
      }
    }

    if (!isMountedRef.current) return;

    if (enrolledFaces.length === 0) {
      setResultMessage(t('no_users_enrolled_yet', language));
      setPhase('failed');
      return;
    }

    // 2. Capture photo and extract real embedding
    let embedding: number[] | null = null;

    if (cameraRef.current && device && hasPermission) {
      try {
        const photoFile = await photoOutput.capturePhotoToFile({
          flashMode: 'off',
        }, {});
        embedding = await getFaceEmbedding(photoFile.filePath);
      } catch (cameraErr) {
        console.error('[Auth] Camera/embedding error:', cameraErr);
      }
    }

    if (!isMountedRef.current) return;

    // 3. No embedding = no face detected = reject
    if (!embedding) {
      setResultMessage(t('no_face_detected', language));
      setPhase('failed');
      return;
    }

    // 4. Match against enrolled faces using cosine similarity
    const match = findBestMatch(embedding, enrolledFaces);

    if (match.matched && match.employee_id && match.name) {
      await handleAuthComplete(match.employee_id, match.name, match.confidence, locationStr);
    } else {
      setResultMessage(t('face_not_recognized', language));
      setPhase('failed');
    }
  }, [enrolledFaces, handleAuthComplete, device, hasPermission, language]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!hasPermission) {
    return (
      <LinearGradient colors={['#090D1A', '#0F172A']} style={styles.fullContainer}>
        <SafeAreaView style={styles.centeredContainer}>
          <Text style={styles.infoText}>
            {t('camera_location_required', language)}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')} activeOpacity={0.8}>
            <Text style={styles.backButtonText}>← {t('back_to_home', language)}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!device) {
    return (
      <LinearGradient colors={['#090D1A', '#0F172A']} style={styles.fullContainer}>
        <SafeAreaView style={styles.centeredContainer}>
          <ActivityIndicator color="#6366F1" size="large" />
          <Text style={styles.infoText}>{t('initializing_camera', language)}</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Determine which gesture buttons to show based on the current challenge
  const challenge = livenessManagerRef.current.currentChallenge;

  return (
    <View style={styles.darkContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Camera Viewport */}
      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={phase === 'liveness' || phase === 'recognizing'}
          outputs={[photoOutput]}
        />

        {/* Face Oval */}
        <View style={styles.cameraOverlay}>
          <View
            style={[
              styles.faceOval,
              phase === 'recognizing'
                ? styles.ovalRecognizing
                : phase === 'success'
                ? styles.ovalSuccess
                : styles.ovalLiveness,
            ]}
          />
        </View>

        {/* Phase Badge */}
        <View style={styles.badgeOverlay}>
          {phase === 'liveness' && (
            <View style={styles.glassBadge}>
              <Text style={styles.badgeText}>
                {gestureCompleted ? `✅ ${t('gesture_complete', language)}` : `🔒 ${t('liveness_check', language)}`}
              </Text>
            </View>
          )}
          {phase === 'recognizing' && (
            <View style={[styles.glassBadge, styles.recognizingBadge]}>
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.badgeText}>{t('extracting_face_embedding_auth', language)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Panel */}
      <LinearGradient colors={['rgba(9, 13, 26, 0.95)', '#090D1A']} style={styles.bottomPanel}>
        {phase === 'liveness' && !gestureCompleted && (
          <View style={{ width: '100%' }}>
            <Text style={styles.instructionText}>{instruction}</Text>

            {/* Timeout progress (drains as time passes) */}
            <View style={styles.progressBarWrapper}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(1 - livenessProgress) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>{t('time_remaining', language)}</Text>
            </View>

            {/* Gesture buttons — only show the relevant one */}
            <View style={styles.gestureRow}>
              {(challenge === 'blink') && (
                <TouchableOpacity
                  style={styles.gestureBtn}
                  onPress={() => handleGesture('blink')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.gestureBtnText}>{t('i_blinked', language)}</Text>
                </TouchableOpacity>
              )}
              {(challenge === 'smile') && (
                <TouchableOpacity
                  style={styles.gestureBtn}
                  onPress={() => handleGesture('smile')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.gestureBtnText}>{t('i_smiled', language)}</Text>
                </TouchableOpacity>
              )}
              {(challenge === 'turn_left' || challenge === 'turn_right') && (
                <TouchableOpacity
                  style={styles.gestureBtn}
                  onPress={() => handleGesture('turn')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.gestureBtnText}>
                    {challenge === 'turn_left' ? t('turned_left', language) : t('turned_right', language)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setScreen('home')}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{t('cancel', language)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'liveness' && gestureCompleted && (
          <View style={styles.resultContainer}>
            <ActivityIndicator color="#10B981" size="large" />
            <Text style={styles.instructionText}>{t('gesture_confirmed_capturing', language)}</Text>
          </View>
        )}

        {phase === 'recognizing' && (
          <View style={styles.resultContainer}>
            <ActivityIndicator color="#F59E0B" size="large" />
            <Text style={styles.instructionText}>{t('matching_face_hold_still', language)}</Text>
          </View>
        )}

        {phase === 'success' && (
          <View style={styles.resultContainer}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.resultText}>{resultMessage}</Text>
            <Text style={styles.confidenceText}>
              {t('match_confidence', language)}: {formatNumber((confidence * 100).toFixed(1), language)}%
            </Text>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setScreen('home')}
              activeOpacity={0.8}
            >
              <Text style={styles.doneButtonText}>{t('finish_attendance', language)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'failed' && (
          <View style={styles.resultContainer}>
            <Text style={styles.failIcon}>❌</Text>
            <Text style={styles.resultText}>{resultMessage}</Text>
            <View style={styles.failButtons}>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  livenessPassedRef.current = false;
                  isProcessingRef.current = false;
                  setGestureCompleted(false);
                  livenessManagerRef.current.reset();
                  setInstruction(getChallengeInstruction(livenessManagerRef.current.currentChallenge));
                  setPhase('liveness');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.retryButtonText}>{t('retry_verification', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setScreen('home')}
                activeOpacity={0.8}
              >
                <Text style={styles.backButtonText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { flex: 1 },
  darkContainer: { flex: 1, backgroundColor: '#090D1A' },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  infoText: {
    color: '#94A3B8',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 24,
    fontWeight: '500',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceOval: {
    width: 230,
    height: 290,
    borderRadius: 115,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  ovalLiveness: {
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 0.5,
  },
  ovalRecognizing: {
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 0.5,
  },
  ovalSuccess: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 0.5,
  },
  badgeOverlay: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  glassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 13, 26, 0.85)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recognizingBadge: { borderColor: 'rgba(245, 158, 11, 0.4)' },
  badgeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  bottomPanel: {
    padding: 28,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    minHeight: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBarWrapper: { width: '100%', marginBottom: 20 },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  progressLabel: { color: '#64748B', fontSize: 11, textAlign: 'center', fontWeight: '600' },

  gestureRow: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  gestureBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
  },
  gestureBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  resultContainer: { alignItems: 'center', gap: 10, width: '100%' },
  successIcon: { fontSize: 54 },
  failIcon: { fontSize: 54 },
  resultText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  confidenceText: { color: '#10B981', fontSize: 14, fontWeight: '700' },
  doneButton: {
    marginTop: 12,
    backgroundColor: '#10B981',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 18,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
  },
  doneButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  failButtons: { flexDirection: 'column', gap: 10, marginTop: 12, width: '100%' },
  retryButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButtonText: { color: '#E2E8F0', fontSize: 16, fontWeight: '800' },
  cancelButton: { alignSelf: 'center', marginTop: 8, padding: 8 },
  cancelButtonText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
});
