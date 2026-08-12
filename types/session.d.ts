import 'express-session';
import {Role} from 'src/users/enums/role';
import type {SessionMetadata} from 'src/session/session-metadata';

declare module 'express-session' {
  interface SessionData {
    // Absent on anonymous sessions — public read routes allow those
    userId?: string;
    role?: Role;
    metadata?: SessionMetadata;
    // Story ids this session has already been counted as viewing, so
    // StoriesService.recordView dedupes reads per browser session (works for
    // anonymous sessions too — writing this persists the session). Capped.
    viewedStoryIds?: string[];
  }
}
