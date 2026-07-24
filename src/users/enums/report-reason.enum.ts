// Predefined categories for a user report (POST /users/:id/report). A single
// reason per report — the reporter's own free-text `details` (see the DTO)
// covers anything more specific. Reused if story/comment reports later grow a
// reason too.
export enum ReportReason {
  Spam = 'spam',
  Harassment = 'harassment',
  InappropriateImage = 'inappropriate_image',
  Impersonation = 'impersonation',
  Other = 'other',
}
