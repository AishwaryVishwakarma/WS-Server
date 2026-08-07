import {Exclude, Expose, Type} from 'class-transformer';
import {Role} from '../enums/role';
import type {AvatarIcon} from '../enums/avatar-icon.enum';
import type {AvatarColor} from '../enums/avatar-color.enum';
import type {ReportReason} from '../enums/report-reason.enum';
import type {Badge} from '../enums/badge.enum';
import type {ContentWarning} from 'src/stories/enums/content-warning.enum';

/**
 * [public]
 */
export class UserPreviewResponseDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() profileImageUrl?: string;
  @Expose() avatarIcon?: AvatarIcon | null;
  @Expose() avatarColor?: AvatarColor | null;
  @Expose() bio?: string;
  @Expose() isVerified: boolean;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  // Populated only on the single-profile fetch (GET /users/:id) — see
  // UsersService.computeBadges. Omitted everywhere else this DTO is reused
  // (admin lists, a comment's `user`, etc.) to avoid the extra aggregate
  // queries on every row of a bulk listing.
  @Expose() badges?: Badge[];

  @Exclude() password: string;

  constructor(partial: Partial<UserPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * [private]
 */
export class UserPrivateResponseDto extends UserPreviewResponseDto {
  @Expose() email: string;
  // Your own role is not sensitive, and the frontend needs it to decide
  // whether to surface the admin area.
  @Expose() role: Role;
  // A private reading preference, not public profile data — never on the
  // preview tier.
  @Expose() mutedContentWarnings: ContentWarning[];
  // Reading-streak stats and the digest opt-out — self-only; the public
  // preview tier only ever sees the derived badges (week-streak/
  // month-streak), not the raw counters.
  @Expose() currentStreak: number;
  @Expose() longestStreak: number;
  @Expose() digestEmailEnabled: boolean;

  constructor(partial: Partial<UserPrivateResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * [admin] — one report against a user: the reporter's own reason/detail. Only
 * populated on the single-user admin fetch (see UsersService.findOneWithReports),
 * never the paginated register list.
 */
export class UserReportResponseDto {
  @Expose() id: string;
  @Expose() reason: ReportReason;
  @Expose() details?: string;
  @Expose() createdAt: Date;

  @Expose()
  @Type(() => UserPreviewResponseDto)
  reporter: UserPreviewResponseDto;

  constructor(partial: Partial<UserReportResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * [admin]
 */
export class UserResponseDto extends UserPrivateResponseDto {
  @Expose() isBlocked: boolean;
  @Expose() deletedAt?: Date;
  /** Member reports; drives the ?reported=true queue ordering. */
  @Expose() reportCount: number;

  /** The individual reports against this user — see UserReportResponseDto. */
  @Expose()
  @Type(() => UserReportResponseDto)
  reports?: UserReportResponseDto[];

  constructor(partial: Partial<UserResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
