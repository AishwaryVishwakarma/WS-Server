import {NotFoundException} from '@nestjs/common';
import {MailPreviewService} from './mail-preview.service';

describe('MailPreviewService', () => {
  const service = new MailPreviewService();

  describe('list', () => {
    it('summarizes every template without leaking the render function', () => {
      const summaries = service.list();

      expect(summaries.length).toBeGreaterThanOrEqual(9);
      expect(summaries.map((s) => s.name)).toEqual(
        expect.arrayContaining([
          'password-reset',
          'registration-otp',
          'weekly-digest',
          'winback',
          'notification-reply',
          'notification-comment',
          'notification-follow',
          'notification-like',
          'notification-series',
        ])
      );
      for (const summary of summaries) {
        expect(summary).not.toHaveProperty('render');
      }
    });

    it('groups every entry under one of the three known categories', () => {
      const categories = new Set(service.list().map((s) => s.category));
      for (const category of categories) {
        expect(['Account', 'Retention', 'Notifications']).toContain(category);
      }
    });
  });

  describe('render', () => {
    it('renders the password-reset email as a full HTML document with a CTA link', () => {
      const html = service.render('password-reset');

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Reset your password');
      expect(html).toContain('/reset-password?token=');
    });

    it('renders the weekly digest with its sample stories', () => {
      const html = service.render('weekly-digest');

      expect(html).toContain('The Attic Door');
      expect(html).toContain('Mara Vane');
    });

    it('renders a notification email using the actor/action sentence', () => {
      const html = service.render('notification-follow');

      expect(html).toContain('Wren Oswin started following you');
    });

    it('throws NotFoundException for an unknown template name', () => {
      expect(() => service.render('does-not-exist')).toThrow(NotFoundException);
    });
  });
});
