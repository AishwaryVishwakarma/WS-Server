// Content-report reasons for a story (POST /stories/:id/report) — distinct
// from ReportReason (user-conduct reasons). A single reason per report; the
// reporter's own free-text `details` covers anything more specific.
export enum StoryReportReason {
  Plagiarism = 'plagiarism',
  Spam = 'spam',
  GraphicContent = 'graphic_content',
  Copyright = 'copyright',
  Harassment = 'harassment',
  Other = 'other',
}
