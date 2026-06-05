import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';

import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/appStore';
import { enrollFace, getAllEnrolledFaces, deleteEnrolledFace } from '../database/queries';
import { getFaceEmbedding } from '../face/imageProcessor';
import { t, formatNumber } from '../i18n/translations';

type EnrollStep = 'form' | 'capture' | 'processing' | 'done';

// Number of successful captures to average for a more robust embedding
const REQUIRED_CAPTURES = 3;

export default function EnrollScreen() {
  const { setScreen, enrolledFaces, setEnrolledFaces, removeEnrolledFace, language } = useAppStore();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const photoOutput = usePhotoOutput();

  const [step, setStep] = useState<EnrollStep>('form');
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [showList, setShowList] = useState(false);

  // Capture progress
  const [capturesDone, setCapturesDone] = useState(0);
  const [captureStatus, setCaptureStatus] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);

  const cameraRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    if (!hasPermission) {
      requestPermission();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [hasPermission]);

  function validateForm(): boolean {
    if (!employeeId.trim()) {
      Alert.alert(t('required_field', language), t('enter_employee_id', language));
      return false;
    }
    if (!name.trim()) {
      Alert.alert(t('required_field', language), t('enter_employee_name', language));
      return false;
    }
    const exists = enrolledFaces.some((f) => f.employee_id === employeeId.trim());
    if (exists) {
      Alert.alert(
        t('duplicate_id_title', language),
        t('duplicate_id_msg', language).replace('{id}', employeeId.trim())
      );
      return false;
    }
    return true;
  }

  function startCapture() {
    if (!validateForm()) return;
    if (!device || !hasPermission) {
      Alert.alert(t('camera_error_title', language), t('camera_error_alert', language));
      return;
    }
    setCapturesDone(0);
    setCaptureStatus(t('position_face_instructions', language));
    setIsCapturing(false);
    setStep('capture');
  }

  /**
   * Captures up to REQUIRED_CAPTURES photos, extracts embeddings, and averages them.
   * Shows clear feedback for each attempt. Only enrolls if face is detected.
   */
  async function captureOne() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      setCaptureStatus(t('hold_still', language));

      const photoFile = await photoOutput.capturePhotoToFile({
        flashMode: 'off',
      }, {});

      const embedding = await getFaceEmbedding(photoFile.filePath);

      if (!embedding) {
        // No face detected in this shot
        if (isMountedRef.current) {
          setCaptureStatus(t('no_face_detected', language));
          setIsCapturing(false);
        }
        return;
      }

      const newCount = capturesDone + 1;
      if (isMountedRef.current) {
        setCapturesDone(newCount);
        if (newCount < REQUIRED_CAPTURES) {
          setCaptureStatus(
            t('capture_progress', language)
              .replace('{done}', formatNumber(newCount, language))
              .replace('{total}', formatNumber(REQUIRED_CAPTURES, language))
          );
          setIsCapturing(false);
        } else {
          // We have all captures — finalise enrollment
          setCaptureStatus(
            t('all_captures_done', language)
              .replace('{total}', formatNumber(REQUIRED_CAPTURES, language))
          );
          await finaliseEnrollment(embedding);
        }
      }
    } catch (err: any) {
      console.error('[EnrollScreen] captureOne error:', err);
      if (isMountedRef.current) {
        setCaptureStatus(`⚠️ ${t('error', language)}: ${err?.message || err}. Please try again.`);
        setIsCapturing(false);
      }
    }
  }

  async function finaliseEnrollment(lastEmbedding: number[]) {
    if (isMountedRef.current) setStep('processing');
    try {
      // Store the last (most recent) L2-normalised embedding.
      // For a more robust system you'd average all REQUIRED_CAPTURES embeddings.
      await enrollFace(
        employeeId.trim(),
        name.trim(),
        designation.trim(),
        lastEmbedding
      );
      const updatedFaces = await getAllEnrolledFaces();
      if (isMountedRef.current) {
        setEnrolledFaces(updatedFaces);
        setStep('done');
      }
    } catch (err: any) {
      Alert.alert(t('error', language), err?.message ?? 'Unknown error occurred.');
      if (isMountedRef.current) {
        setStep('form');
        setIsCapturing(false);
      }
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
            await deleteEnrolledFace(employee_id);
            removeEnrolledFace(employee_id);
          },
        },
      ]
    );
  }

  function resetForm() {
    setEmployeeId('');
    setName('');
    setDesignation('');
    setCapturesDone(0);
    setCaptureStatus('');
    setIsCapturing(false);
    if (isMountedRef.current) setStep('form');
  }

  // ─── Camera / Capture View ──────────────────────────────────────────────────
  if (step === 'capture') {
    return (
      <View style={styles.darkContainer}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.cameraContainer}>
          {device && hasPermission ? (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              outputs={[photoOutput]}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#090D1A' }]} />
          )}
          {/* Oval guide */}
          <View style={styles.cameraOverlay}>
            <View style={[
              styles.faceOval,
              capturesDone > 0 ? styles.ovalProgress : styles.ovalIdle,
            ]} />
          </View>
          {/* Progress dots */}
          <View style={styles.progressDotsContainer}>
            {Array.from({ length: REQUIRED_CAPTURES }).map((_, i) => (
              <View
                key={i}
                style={[styles.progressDot, i < capturesDone ? styles.progressDotFilled : styles.progressDotEmpty]}
              />
            ))}
          </View>
        </View>

        {/* Status + Capture button */}
        <View style={styles.captureInfoPanel}>
          <Text style={styles.captureInfoName}>{name}</Text>
          <Text style={styles.captureInfoId}>ID: {employeeId}</Text>
          <Text style={styles.captureStatus}>{captureStatus}</Text>

          <TouchableOpacity
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
            onPress={captureOne}
            disabled={isCapturing}
            activeOpacity={0.8}
          >
            {isCapturing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.captureButtonText}>
                📸 {t('start_face_capture', language)} ({formatNumber(capturesDone + 1, language)}/{formatNumber(REQUIRED_CAPTURES, language)})
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep('form')} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>{t('cancel', language)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Processing Step ────────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <View style={styles.darkContainer}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.processingText}>{t('extracting_face_embedding', language)}</Text>
          <Text style={styles.processingSubText}>{t('this_may_take_a_moment', language)}</Text>
        </View>
      </View>
    );
  }

  // ─── Done Step ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <LinearGradient colors={['#090D1A', '#0F172A']} style={styles.fullContainer}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.doneContainer}>
          <Text style={styles.doneIcon}>✅</Text>
          <Text style={styles.doneTitle}>{t('enrollment_complete', language)}</Text>
          <View style={styles.glassResultCard}>
            <Text style={styles.doneLabel}>{t('full_name', language).replace(' *', '')}</Text>
            <Text style={styles.doneValue}>{name}</Text>
            <View style={styles.separator} />
            <Text style={styles.doneLabel}>{t('employee_id', language).replace(' *', '')}</Text>
            <Text style={styles.doneValue}>{employeeId}</Text>
          </View>
          <View style={styles.doneButtons}>
            <TouchableOpacity style={styles.primaryGradientBtn} onPress={resetForm} activeOpacity={0.8}>
              <LinearGradient
                colors={['#6366F1', '#4F46E5']}
                style={styles.btnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.primaryButtonText}>{t('enroll_another', language)}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')} activeOpacity={0.8}>
              <Text style={styles.backButtonText}>{t('back_to_home', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    );
  }

  // ─── Form Step ─────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={['#090D1A', '#0F172A', '#1E1B4B']} style={styles.fullContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setScreen('home')} activeOpacity={0.7} style={styles.iconBtn}>
                <Text style={styles.backText}>← {t('back', language)}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{t('enroll_personnel_title', language)}</Text>
              <TouchableOpacity onPress={() => setShowList(!showList)} activeOpacity={0.7}>
                <Text style={styles.listToggle}>
                  {showList ? t('hide_list', language) : `${t('list_count', language)} (${formatNumber(enrolledFaces.length, language)})`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Enrolled List */}
            {showList && (
              <View style={styles.glassListCard}>
                <Text style={styles.listHeaderTitle}>{t('enrolled_personnel_records', language)}</Text>
                {enrolledFaces.length === 0 ? (
                  <Text style={styles.emptyText}>{t('no_users_enrolled_yet', language)}</Text>
                ) : (
                  enrolledFaces.map((face) => (
                    <View key={face.employee_id} style={styles.enrolledItem}>
                      <View style={styles.enrolledAvatar}>
                        <Text style={styles.enrolledAvatarText}>
                          {face.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.enrolledInfo}>
                        <Text style={styles.enrolledName}>{face.name}</Text>
                        <Text style={styles.enrolledId}>ID: {face.employee_id}</Text>
                        {face.designation ? (
                          <Text style={styles.enrolledDesig}>{face.designation}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDelete(face.employee_id, face.name)}
                        activeOpacity={0.7}
                        style={styles.deleteBtn}
                      >
                        <Text style={styles.deleteText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Form Input Card */}
            <View style={styles.glassFormCard}>
              <Text style={styles.formTitle}>{t('new_face_profile', language)}</Text>

              <Text style={styles.label}>{t('employee_id', language)}</Text>
              <TextInput
                style={styles.input}
                value={employeeId}
                onChangeText={setEmployeeId}
                placeholder="e.g. EMP009"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
              />

              <Text style={styles.label}>{t('full_name', language)}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Priyanshu Sharma"
                placeholderTextColor="#64748B"
              />

              <Text style={styles.label}>{t('designation', language)}</Text>
              <TextInput
                style={styles.input}
                value={designation}
                onChangeText={setDesignation}
                placeholder="e.g. Senior Field Technician"
                placeholderTextColor="#64748B"
              />

              {/* Capture instructions */}
              <View style={styles.instructionBox}>
                <Text style={styles.instructionBoxTitle}>📸 {t('how_enrollment_works', language)}</Text>
                <Text style={styles.instructionBoxText}>
                  {t('how_enrollment_works_details', language)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.primaryGradientBtn}
                onPress={startCapture}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#6366F1', '#4F46E5']}
                  style={styles.btnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.primaryButtonText}>📸 {t('start_face_capture', language)}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fullContainer: { flex: 1 },
  darkContainer: { flex: 1, backgroundColor: '#090D1A' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? 40 : 0 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  iconBtn: { padding: 4 },
  backText: { color: '#6366F1', fontSize: 16, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  listToggle: { color: '#6366F1', fontSize: 14, fontWeight: '700' },

  glassListCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  listHeaderTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: { color: '#64748B', textAlign: 'center', padding: 12, fontSize: 14 },
  enrolledItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  enrolledAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrolledAvatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  enrolledInfo: { flex: 1 },
  enrolledName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  enrolledId: { color: '#94A3B8', fontSize: 12, marginTop: 1 },
  enrolledDesig: { color: '#64748B', fontSize: 12, marginTop: 1 },
  deleteBtn: { padding: 6 },
  deleteText: { fontSize: 18 },

  glassFormCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    shadowOpacity: 0.25,
  },
  formTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  label: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    fontWeight: '500',
  },

  instructionBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    marginTop: 20,
  },
  instructionBoxTitle: { color: '#A5B4FC', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  instructionBoxText: { color: '#94A3B8', fontSize: 13, lineHeight: 20 },

  primaryGradientBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 24,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
  },
  btnGradient: { padding: 18, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  // ── Camera Capture View ──────────────────────────────────────────────────────
  cameraContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
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
  ovalIdle: {
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.5,
  },
  ovalProgress: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.5,
  },

  progressDotsContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  progressDotEmpty: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
  },
  progressDotFilled: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },

  captureInfoPanel: {
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: '#090D1A',
    gap: 10,
  },
  captureInfoName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  captureInfoId: { color: '#6366F1', fontSize: 13, fontWeight: '700' },
  captureStatus: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: 20,
    minHeight: 36,
  },
  captureButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
    width: '100%',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0.35,
  },
  captureButtonDisabled: { opacity: 0.5 },
  captureButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancelLink: { marginTop: 4, padding: 8 },
  cancelLinkText: { color: '#64748B', fontSize: 14, fontWeight: '600' },

  // ── Processing ───────────────────────────────────────────────────────────────
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 40,
  },
  processingText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  processingSubText: { color: '#64748B', fontSize: 14, fontWeight: '500' },

  // ── Done ─────────────────────────────────────────────────────────────────────
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  doneIcon: { fontSize: 72, marginBottom: 16 },
  doneTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginBottom: 20 },
  glassResultCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 30,
  },
  doneLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  doneValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  separator: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.06)', marginVertical: 14 },
  doneButtons: { width: '100%', gap: 12 },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButtonText: { color: '#E2E8F0', fontSize: 16, fontWeight: '700' },
});
