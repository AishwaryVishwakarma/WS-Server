import 'express-session';
import {Role} from 'src/users/enums/role';

declare module 'express-session' {
  interface SessionData {
    // Absent on anonymous sessions — public read routes allow those
    userId?: string;
    role?: Role;
    // Story ids this session has already been counted as viewing, so
    // StoriesService.recordView dedupes reads per browser session (works for
    // anonymous sessions too — writing this persists the session). Capped.
    viewedStoryIds?: string[];
  }
}
