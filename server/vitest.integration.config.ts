import { defineConfig } from 'vitest/config';

// Integration tests run the real app against a real Postgres (seeded with the
// demo migrations). They are kept separate from the unit suite so the default
// `npm test` stays DB-free; the `test-integration` CI job provides the database.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Serial — these tests mutate shared institution/api-key/webhook rows.
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 30_000,
    testTimeout: 30_000,
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
