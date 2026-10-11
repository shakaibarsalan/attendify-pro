import crypto from 'crypto';
import { query } from '../config/database.js';

// Sign + POST a JSON body to a single webhook (best-effort, 8s timeout). Records
// the last delivery status. Never throws.
async function deliver(id: string, url: string, secret: string, body: string): Promise<{ status: number }> {
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  let status = 0;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Attendify-Signature': `sha256=${signature}`,
        'User-Agent': 'Attendify-Webhooks/1.0',
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    status = resp.status;
  } catch (e: any) {
    console.error('[webhooks] delivery failed:', url, e?.message);
  }
  query('UPDATE webhooks SET last_status = $1, last_delivered_at = NOW() WHERE id = $2', [status || null, id]).catch(() => {});
  return { status };
}

// Fire `event` to every active webhook of an institution that subscribes to it.
// Fire-and-forget — call without awaiting from request handlers.
export async function dispatchWebhook(institutionId: string, event: string, data: any): Promise<void> {
  try {
    const hooks = await query(
      `SELECT id, url, secret FROM webhooks
        WHERE institution_id = $1 AND is_active = true AND events @> $2::jsonb`,
      [institutionId, JSON.stringify([event])],
    );
    if (hooks.rows.length === 0) return;
    const body = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    await Promise.allSettled(hooks.rows.map((h) => deliver(h.id, h.url, h.secret, body)));
  } catch (e) {
    console.error('[webhooks] dispatch error:', e);
  }
}

// Send a one-off test event to a specific webhook (for the "Test" button).
export async function sendTestEvent(webhookId: string): Promise<{ delivered: boolean; status: number }> {
  const r = await query('SELECT id, url, secret FROM webhooks WHERE id = $1', [webhookId]);
  if (r.rows.length === 0) return { delivered: false, status: 0 };
  const body = JSON.stringify({
    event: 'webhook.test',
    data: { message: 'This is a test event from Attendify.' },
    timestamp: new Date().toISOString(),
  });
  const { status } = await deliver(r.rows[0].id, r.rows[0].url, r.rows[0].secret, body);
  return { delivered: status >= 200 && status < 300, status };
}
