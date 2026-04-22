import axios from 'axios';
import * as crypto from 'node:crypto';

type WebhookEvent = 'extraction.completed' | 'extraction.failed';

interface DeliverWebhookOptions {
  url: string;
  event: WebhookEvent;
  payload: object;
}

function signWebhookPayload(body: string): string {
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    throw new Error('WEBHOOK_SECRET is not configured');
  }

  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
}

export async function deliverWebhook({
  url,
  event,
  payload,
}: DeliverWebhookOptions): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signWebhookPayload(body);

  await axios.post(url, body, {
    timeout: Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5000),
    headers: {
      'Content-Type': 'application/json',
      'X-Maritime-Event': event,
      'X-Maritime-Signature': `sha256=${signature}`,
    },
    transformRequest: [(data) => data],
  });
}

export async function safeDeliverWebhook(
  options: DeliverWebhookOptions & { jobId: string },
): Promise<void> {
  try {
    await deliverWebhook(options);
    console.log('[Webhook] Delivery succeeded', {
      jobId: options.jobId,
      event: options.event,
      url: options.url,
    });
  } catch (err: any) {
    console.error('[Webhook] Delivery failed', {
      jobId: options.jobId,
      event: options.event,
      url: options.url,
      message: err?.message,
      status: err?.response?.status,
    });
  }
}
