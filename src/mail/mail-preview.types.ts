export type MailPreviewCategory = 'Account' | 'Retention' | 'Notifications';

export interface MailPreviewSummary {
  name: string;
  category: MailPreviewCategory;
  subject: string;
  preheader: string;
  trigger: string;
  recipient: string;
  note: string;
}
