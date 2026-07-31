export interface DigestNewStory {
  title: string;
  id: string;
  authorName: string;
}

export interface DigestInput {
  siteUrl: string;
  currentStreak: number;
  newStories: DigestNewStory[];
  unreadCount: number;
}

// Builds the weekly digest email body from whatever's genuinely new for
// this reader. Returns null when there's nothing to report — the caller
// skips sending entirely rather than mailing a "nothing happened this
// week" message.
export function buildDigestText(input: DigestInput): string | null {
  const lines: string[] = [];

  if (input.newStories.length > 0) {
    lines.push('New from authors you follow:');
    input.newStories.forEach((story) =>
      lines.push(
        `- "${story.title}" by ${story.authorName} — ${input.siteUrl}/stories/${story.id}`
      )
    );
  }

  if (input.currentStreak > 0) {
    lines.push(
      `You're on a ${input.currentStreak}-day reading streak. Keep it going.`
    );
  }

  if (input.unreadCount > 0) {
    lines.push(
      `You have ${input.unreadCount} unread notification${
        input.unreadCount === 1 ? '' : 's'
      }.`
    );
  }

  return lines.length > 0 ? lines.join('\n') : null;
}
