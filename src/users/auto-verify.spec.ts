import {AUTO_VERIFY_MIN_ACCOUNT_AGE_MS, shouldAutoVerify} from './auto-verify';

describe('shouldAutoVerify', () => {
  const oldEnough = new Date(
    Date.now() - AUTO_VERIFY_MIN_ACCOUNT_AGE_MS - 1000
  );
  const tooYoung = new Date(Date.now() - AUTO_VERIFY_MIN_ACCOUNT_AGE_MS + 1000);

  const base = {
    isVerified: false,
    verificationLocked: false,
    hasPublishedStory: true,
    createdAt: oldEnough,
  };

  it('is true for an old-enough, published, unverified, unlocked account', () => {
    expect(shouldAutoVerify(base)).toBe(true);
  });

  it('is false when already verified', () => {
    expect(shouldAutoVerify({...base, isVerified: true})).toBe(false);
  });

  it('is false when verification is locked (an admin has already decided)', () => {
    expect(shouldAutoVerify({...base, verificationLocked: true})).toBe(false);
  });

  it('is false when the author has never had a story approved', () => {
    expect(shouldAutoVerify({...base, hasPublishedStory: false})).toBe(false);
  });

  it('is false when the account is younger than the threshold', () => {
    expect(shouldAutoVerify({...base, createdAt: tooYoung})).toBe(false);
  });

  it('is true exactly at the threshold', () => {
    const exact = new Date(Date.now() - AUTO_VERIFY_MIN_ACCOUNT_AGE_MS);
    expect(shouldAutoVerify({...base, createdAt: exact})).toBe(true);
  });
});
