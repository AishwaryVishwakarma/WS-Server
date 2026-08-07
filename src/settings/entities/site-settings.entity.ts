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

  @UpdateDateColumn()
  updatedAt: Date;
}
