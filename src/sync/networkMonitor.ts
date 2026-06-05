import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { syncAttendanceToAWS } from './awsSync';

type SyncCallback = (result: { success: boolean; count: number }) => void;

let unsubscribe: (() => void) | null = null;
let lastConnected: boolean | null = null; // null = unknown initial state
let isSyncing = false;

/**
 * Start monitoring network connectivity.
 * Automatically triggers sync ONCE when connection is restored.
 */
export function startNetworkMonitor(onSync?: SyncCallback): void {
  if (unsubscribe) return; // Already monitoring

  unsubscribe = NetInfo.addEventListener(async (state: NetInfoState) => {
    const isConnected = !!(state.isConnected && state.isInternetReachable !== false);

    // Only trigger sync when transitioning from offline → online
    // Skip the very first event (initial state load) by checking lastConnected !== null
    if (isConnected && lastConnected === false && !isSyncing) {
      console.log('[Network] Connection restored. Starting sync...');
      isSyncing = true;
      try {
        const result = await syncAttendanceToAWS();
        if (onSync) {
          onSync({ success: result.success, count: result.uploadedCount });
        }
      } catch (err) {
        console.error('[Network] Auto-sync failed:', err);
      } finally {
        isSyncing = false;
      }
    }

    lastConnected = isConnected;
  });
}

export function stopNetworkMonitor(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    lastConnected = null;
  }
}

export async function checkConnectivity(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable !== false);
}
