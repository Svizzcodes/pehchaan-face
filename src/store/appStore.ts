import { create } from 'zustand';
import { EnrolledFace, AttendanceRecord } from '../database/queries';

type AppScreen = 'home' | 'authenticate' | 'enroll' | 'records' | 'sync';

interface AppState {
  // Navigation
  currentScreen: AppScreen;
  setScreen: (screen: AppScreen) => void;

  // Language
  language: 'en' | 'hi' | 'mr' | 'bn' | 'te' | 'ta' | 'gu' | 'kn';
  setLanguage: (lang: 'en' | 'hi' | 'mr' | 'bn' | 'te' | 'ta' | 'gu' | 'kn') => void;

  // Enrolled faces cache (loaded from DB on startup)
  enrolledFaces: EnrolledFace[];
  setEnrolledFaces: (faces: EnrolledFace[]) => void;
  addEnrolledFace: (face: EnrolledFace) => void;
  removeEnrolledFace: (employee_id: string) => void;

  // Attendance records
  attendanceRecords: AttendanceRecord[];
  setAttendanceRecords: (records: AttendanceRecord[]) => void;
  addAttendanceRecord: (record: AttendanceRecord) => void;

  // Sync state
  unsyncedCount: number;
  setUnsyncedCount: (count: number) => void;
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;
  lastSyncTime: number | null;
  setLastSyncTime: (time: number) => void;

  // Model state
  modelLoaded: boolean;
  setModelLoaded: (loaded: boolean) => void;

  // Auth result (shown after recognition)
  lastAuthResult: {
    success: boolean;
    name: string | null;
    confidence: number;
    timestamp: number;
  } | null;
  setLastAuthResult: (result: AppState['lastAuthResult']) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentScreen: 'home',
  setScreen: (screen) => set({ currentScreen: screen }),

  language: 'en',
  setLanguage: (lang) => set({ language: lang }),

  enrolledFaces: [],
  setEnrolledFaces: (faces) => set({ enrolledFaces: faces }),
  addEnrolledFace: (face) =>
    set((state) => ({ enrolledFaces: [...state.enrolledFaces, face] })),
  removeEnrolledFace: (employee_id) =>
    set((state) => ({
      enrolledFaces: state.enrolledFaces.filter((f) => f.employee_id !== employee_id),
    })),

  attendanceRecords: [],
  setAttendanceRecords: (records) => set({ attendanceRecords: records }),
  addAttendanceRecord: (record) =>
    set((state) => ({
      attendanceRecords: [record, ...state.attendanceRecords].slice(0, 100),
    })),

  unsyncedCount: 0,
  setUnsyncedCount: (count) => set({ unsyncedCount: count }),
  isSyncing: false,
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  lastSyncTime: null,
  setLastSyncTime: (time) => set({ lastSyncTime: time }),

  modelLoaded: false,
  setModelLoaded: (loaded) => set({ modelLoaded: loaded }),

  lastAuthResult: null,
  setLastAuthResult: (result) => set({ lastAuthResult: result }),
}));
