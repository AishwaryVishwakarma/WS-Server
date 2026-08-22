import {Column, Entity, PrimaryColumn, UpdateDateColumn} from 'typeorm';

// Single-row table — id is always 1. There's exactly one site-wide setting
// today, so a fixed-PK row is simpler than a generic key-value store; the
// migration seeds row 1 so callers never need to handle a missing row.
@Entity()
export class SiteSettings {
  @PrimaryColumn({type: 'int', default: 1})
  id: number;

  @Column({type: 'boolean', default: true})
  requireStoryApproval: boolean;

  // Both default false — arbitrary external image URLs are off at launch
  // until a real upload pipeline exists; an admin can flip either on later.
  @Column({type: 'boolean', default: false})
  allowProfileImageUpload: boolean;

  @Column({type: 'boolean', default: false})
  allowStoryCoverImage: boolean;

  // Off at launch — the weekly digest cron (see DigestService) is gated by
  // this before it does anything at all, regardless of any member's own
  // digestEmailEnabled opt-in/out. POST /admin/digest/send (the manual QA
  // trigger) respects it too, since it calls the same gated method.
  @Column({type: 'boolean', default: false})
  digestEmailGloballyEnabled: boolean;

  // Transactional activity emails (reply/comment/follow/like) are opt-in at
  // both levels: an admin enables the channel, then each member chooses types.
  @Column({type: 'boolean', default: false})
  notificationEmailGloballyEnabled: boolean;

  // Gates perks and new checkouts, but never billing webhooks or stored status.
  @Column({type: 'boolean', default: false})
  membershipFeaturesEnabled: boolean;

  // Off at launch, like digestEmailGloballyEnabled — gates the daily win-back
  // cron (see WinbackService) regardless of any member's own
  // winbackEmailEnabled opt-in/out.
  @Column({type: 'boolean', default: false})
  winbackEmailGloballyEnabled: boolean;

  // Off at launch — gates whether a supplied referral code is even looked up
  // during registration (see RegistrationOtpService.start).
  @Column({type: 'boolean', default: false})
  referralProgramEnabled: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
