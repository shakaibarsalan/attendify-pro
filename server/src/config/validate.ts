import { z } from 'zod';

const envSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  SERVER_PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Values that must never be used as a real secret. Matches the config.ts fallback
// ('default-secret-change-in-production') plus common placeholders.
const INSECURE_SECRETS = new Set([
  'default-secret-change-in-production', 'change_me', 'changeme', 'change-me',
  'default', 'secret', 'changeit', 'your-secret-key', 'jwt-secret', 'password',
]);

export function validateConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formatted = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${msgs?.join(', ')}`)
      .join('\n');
    throw new Error(`Missing or invalid environment variables:\n${formatted}`);
  }

  const config = result.data;

  if (config.NODE_ENV === 'production') {
    const insecure: string[] = [];
    const warn: string[] = [];

    const jwt = config.JWT_SECRET;
    // refreshSecret mirrors config/index.ts (falls back to JWT_SECRET).
    const refresh = process.env.JWT_REFRESH_SECRET || jwt;

    if (INSECURE_SECRETS.has(jwt.toLowerCase())) insecure.push('JWT_SECRET');
    if (INSECURE_SECRETS.has(refresh.toLowerCase())) insecure.push('JWT_REFRESH_SECRET');

    if (jwt.length < 32) warn.push(`JWT_SECRET should be at least 32 characters (currently ${jwt.length})`);
    if (!process.env.AI_SERVICE_API_KEY) warn.push('AI_SERVICE_API_KEY is empty — the AI service will accept unauthenticated calls');
    if (!process.env.BIOMETRIC_DB_PASSWORD) warn.push('BIOMETRIC_DB_PASSWORD is empty');
    if (!process.env.LIVENESS_HMAC_SECRET) warn.push('LIVENESS_HMAC_SECRET is empty — liveness challenge signing falls back to a default');

    // A known placeholder secret is critical. Default = loud error (so it can't
    // silently crash-loop a live deploy if prod is misread); set STRICT_SECRETS=true
    // to make it a hard startup failure once you've confirmed strong secrets.
    if (insecure.length > 0) {
      const msg = `insecure/placeholder value(s) in ${insecure.join(', ')} — set strong random secrets`;
      if (process.env.STRICT_SECRETS === 'true') {
        throw new Error(`Insecure production configuration: ${msg}`);
      }
      console.error(`[config] CRITICAL: ${msg}. (Set STRICT_SECRETS=true to make this a hard failure.)`);
    }
    for (const w of warn) console.warn(`[config] Warning: ${w}`);
  }

  return config;
}
