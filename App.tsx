import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from './src/store/appStore';
import { startNetworkMonitor, stopNetworkMonitor } from './src/sync/networkMonitor';
import { getUnsyncedCount } from './src/database/queries';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import AuthenticateScreen from './src/screens/AuthenticateScreen';
import EnrollScreen from './src/screens/EnrollScreen';
import RecordsScreen from './src/screens/RecordsScreen';
import SyncScreen from './src/screens/SyncScreen';

export default function App() {
  const { currentScreen, setUnsyncedCount } = useAppStore();

  useEffect(() => {
    startNetworkMonitor(async ({ success, count }) => {
      if (success && count > 0) {
        console.log(`[AutoSync] Uploaded ${count} records`);
        const remaining = await getUnsyncedCount();
        setUnsyncedCount(remaining);
      }
    });
    return () => stopNetworkMonitor();
  }, []);

  function renderScreen() {
    switch (currentScreen) {
      case 'authenticate': return <AuthenticateScreen />;
      case 'enroll':       return <EnrollScreen />;
      case 'records':      return <RecordsScreen />;
      case 'sync':         return <SyncScreen />;
      default:             return <HomeScreen />;
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      {renderScreen()}
    </GestureHandlerRootView>
  );
}
