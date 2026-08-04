// AsyncStorage's native module doesn't exist under Jest (no real
// device/simulator) — register its official in-memory mock so any module
// that imports AsyncStorage at load time (encryption.ts, supabase.ts, the
// app's contexts) doesn't crash trying to reach the native bridge.
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
