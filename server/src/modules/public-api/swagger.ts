import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { config } from '../../config/index.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Attendify API',
      version: '2.0.0',
      description: 'Smart Attendance System API - Public endpoints for third-party integration',
      contact: { name: 'Attendify Team' },
    },
    servers: [
      { url: 'https://attendify.pro/api', description: 'Production' },
      { url: 'http://localhost:5000/api', description: 'Development' },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication — login, register, password reset' },
      { name: 'Users', description: 'User management — CRUD for all user roles' },
      { name: 'Institutions', description: 'Institution management and stats' },
      { name: 'Courses', description: 'Course management and enrollments' },
      { name: 'Departments', description: 'Department management within an institution' },
      { name: 'Sessions', description: 'Attendance sessions — create, QR rotation, status' },
      { name: 'Attendance', description: 'Attendance records — mark, list, verify' },
      { name: 'Fraud', description: 'Fraud alerts — list, analytics, resolve' },
      { name: 'Biometric', description: 'Face registration, status, liveness challenges' },
      { name: 'Notifications', description: 'In-app notifications — list, mark read' },
      { name: 'Reports', description: 'Analytics & reports — stats, summaries' },
      { name: 'Enrollments', description: 'Course enrollment management' },
      { name: 'Audit', description: 'Audit log queries' },
      { name: 'Public API', description: 'Third-party integration (API key auth)' },
      { name: 'API Keys', description: 'API key management for third-party integration' },
      { name: 'Webhooks', description: 'Outbound event callbacks (signed) for ERP integration' },
      { name: 'Org Requests', description: 'Organization join requests — submit, list, approve, reject' },
      { name: 'Plans', description: 'Subscription plans — list, current, select' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', description: 'Human-readable error message' },
            details: { type: 'array', items: { type: 'object' }, description: 'Validation error details (Zod)' },
          },
        },
      },
    },
  },
  apis: ['./src/modules/**/routes.ts'],
};

// Only these tags are exposed to third-party integrators. Everything else
// (Auth, Users, Institutions, internal admin endpoints, etc.) stays private.
const PUBLIC_TAGS = new Set(['Public API', 'Webhooks']);
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

/**
 * Build a curated spec containing ONLY the integration-facing endpoints
 * (Public API + Webhooks). This is what we publish to customers — it never
 * reveals the internal backend surface.
 */
function buildIntegrationSpec(full: any) {
  const paths: Record<string, any> = {};
  for (const [path, ops] of Object.entries<any>(full.paths || {})) {
    const kept: Record<string, any> = {};
    for (const method of HTTP_METHODS) {
      const op = ops[method];
      if (op && Array.isArray(op.tags) && op.tags.some((t: string) => PUBLIC_TAGS.has(t))) {
        kept[method] = op;
      }
    }
    if (Object.keys(kept).length > 0) {
      if (ops.parameters) kept.parameters = ops.parameters;
      paths[path] = kept;
    }
  }
  return {
    ...full,
    info: {
      title: 'Attendify Integration API',
      version: full.info?.version || '2.0.0',
      description:
        'Public endpoints for integrating Attendify with your own system (ERP, student portal, or app). ' +
        'Authenticate with your API key via the `X-API-Key` header. Only the endpoints listed here are ' +
        'available to third-party integrations.',
      contact: full.info?.contact,
    },
    tags: (full.tags || []).filter((t: any) => PUBLIC_TAGS.has(t.name)),
    paths,
  };
}

export function setupSwagger(app: Express) {
  const fullSpecs: any = swaggerJsdoc(options);
  const integrationSpecs = buildIntegrationSpec(fullSpecs);

  // ── Curated integration reference — ALWAYS public, only the shared endpoints.
  //    Mounted under /api/* so it rides the existing nginx /api/ proxy (no nginx
  //    change needed). This is the URL we hand to integrators.
  app.use(
    '/api/integration-docs',
    swaggerUi.serveFiles(integrationSpecs, {}),
    swaggerUi.setup(integrationSpecs, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Attendify Integration API',
    }),
  );
  app.get('/api/integration-docs.json', (_req, res) => res.json(integrationSpecs));

  // ── Full internal docs — the ENTIRE API surface. Hidden from the public in
  //    production; served only in dev or when ENABLE_API_DOCS=true.
  if (config.server.isDev || config.docs.enableFullDocs) {
    app.use(
      '/api-docs',
      swaggerUi.serveFiles(fullSpecs, {}),
      swaggerUi.setup(fullSpecs, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Attendify API Docs (internal)',
      }),
    );
    app.get('/api-docs.json', (_req, res) => res.json(fullSpecs));
  }
}
