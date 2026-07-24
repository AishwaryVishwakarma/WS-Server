import {Exclude, Expose, Type} from 'class-transformer';
import {Role} from '../enums/role';
import type {ReportReason} from '../enums/report-reason.enum';

/**
 * [public]
 */
export class UserPreviewResponseDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() profileImageUrl?: string;
  @Expose() bio?: string;
  @Expose() isVerified: boolean;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

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
