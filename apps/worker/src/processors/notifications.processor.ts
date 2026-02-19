import { Job } from 'bullmq';

export interface NotificationJobData {
  type: 'in_app' | 'email';
  userId: string;
  tenantId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { type, userId, title } = job.data;
  console.log(`[notifications] Sending ${type} notification to user ${userId}: ${title}`);
  // Future: in-app DB insert, email via SMTP/SES
}
