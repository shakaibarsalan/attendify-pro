import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Unit suites only. tests/auth-attendance.test.ts is an integration test that
    // needs a live server (port 5000) + DB, so it's intentionally not included in CI.
    include: ['src/tests/**/*.test.ts', 'tests/geofence.test.ts', 'tests/qr-rotation.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-min-32-chars-for-ci',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'attendify_test',
      DB_USER: 'test_user',
      DB_PASSWORD: 'test_pass',
      BIOMETRIC_DB_HOST: 'localhost',
      BIOMETRIC_DB_PORT: '5432',
      BIOMETRIC_DB_NAME: 'attendify_test',
      BIOMETRIC_DB_USER: 'test_user',
      BIOMETRIC_DB_PASSWORD: 'test_pass',
    },
  },
});
