// jest-expo (already a devDependency, previously unused) supplies the
// react-native/Expo test environment this project's source actually needs:
// platform-extension module resolution (Platform.ios.js etc.), transforms
// for the untranspiled ESM react-native/Expo packages ship under
// node_modules, and the native-module setup those packages expect at
// import time. Hand-rolling this in a plain node + ts-jest config (see git
// history on this file) chased one missing piece after another — this is
// the config the framework itself is built to need.
module.exports = {
    preset: 'jest-expo',
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
    },
    // jest-expo's preset already needs its own two setupFiles (native module
    // shims, __DEV__, etc.) — Jest does NOT merge a project's `setupFiles`
    // with a preset's, it replaces the array outright, so our addition has
    // to explicitly re-list them alongside jest.setup.js instead of relying
    // on the preset to still run them.
    setupFiles: [
        'react-native/jest/setup.js',
        'jest-expo/src/preset/setup.js',
        '<rootDir>/jest.setup.js',
    ],
    // otplib and its default plugins (@otplib/*, @noble/*, @scure/*) ship
    // ESM-only under node_modules with no CJS build, so jest-expo's default
    // ignore pattern (which only carves out RN/Expo packages) leaves them
    // untranspiled and Node's CJS loader chokes on their `export` syntax.
    transformIgnorePatterns: [
        '/node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|otplib|@otplib/.*|@noble/.*|@scure/.*)',
        '/node_modules/react-native-reanimated/plugin/',
    ],
};
