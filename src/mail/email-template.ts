// Minimal, inline-styled HTML shell shared by every outgoing email. Tables
// instead of flexbox/grid, no external CSS/fonts/images: mail clients strip
// <style> blocks inconsistently and block remote assets by default, so
// anything that isn't inline-styled or self-contained renders unreliably.
// Every dynamic value passed through here — or embedded in a caller's
// `bodyHtml` — must go through escapeHtml first; digest emails in particular
// interpolate user-authored story titles and names.
const EMBER = '#ff7a3d';

const BRAND = {
  bg: '#0f0f12',
  surface: '#19191f',
  surfaceRaised: '#222229',
  border: '#34343d',
  text: '#ededf0',
  textSecondary: '#a6a5af',
  textFaint: '#777681',
  ember: EMBER,
  emberContrast: '#101013',
};

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmailTemplateOptions {
  // Hidden preview text an inbox list shows next to the subject, before the
  // email is opened.
  preheader: string;
  heading: string;
  // Pre-built HTML for the body (paragraphs/lists/etc) — the caller is
  // responsible for escaping any dynamic values it interpolates in.
  bodyHtml: string;
  cta?: {label: string; url: string};
  // Small print below a divider, e.g. "if you didn't request this...".
  footnote?: string;
}

export function renderEmailHtml({
  preheader,
  heading,
  bodyHtml,
  cta,
  footnote,
}: EmailTemplateOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0; padding:0; background:${BRAND.bg}; font-family:${FONT_STACK};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background:${BRAND.bg};">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:520px; background:${BRAND.surface}; border:1px solid ${BRAND.border}; border-radius:14px;">
            <tr>
              <td style="padding:30px 32px 22px; text-align:left; border-bottom:1px solid ${BRAND.border};">
                <span style="font-family:Georgia,'Times New Roman',serif; font-size:20px; line-height:1; color:${BRAND.text}; font-weight:700;">Whispering<span style="color:${BRAND.ember};">Shadows</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 12px;">
                <h1 style="margin:0 0 18px; font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:1.25; color:${BRAND.text}; font-weight:700;">${escapeHtml(heading)}</h1>
                <div style="font-size:15px; line-height:1.65; color:${BRAND.textSecondary};">${bodyHtml}</div>
              </td>
            </tr>${
              cta
                ? `
            <tr>
              <td style="padding:10px 32px 30px;">
                <a href="${escapeHtml(cta.url)}" style="display:inline-block; background:${BRAND.ember}; color:${BRAND.emberContrast}; text-decoration:none; font-weight:700; font-size:15px; line-height:1; padding:14px 22px; border-radius:8px;">${escapeHtml(cta.label)}</a>
                <p style="margin:18px 0 0; font-size:12px; line-height:1.5; color:${BRAND.textFaint};">Button not working? Copy and paste this link:<br /><a href="${escapeHtml(cta.url)}" style="color:${BRAND.textSecondary}; text-decoration:underline; overflow-wrap:anywhere; word-break:break-all;">${escapeHtml(cta.url)}</a></p>
              </td>
            </tr>`
                : ''
            }${
              footnote
                ? `
            <tr>
              <td style="padding:20px 32px; border-top:1px solid ${BRAND.border}; background:${BRAND.surfaceRaised}; border-radius:0 0 14px 14px;">
                <p style="margin:0; font-size:12px; line-height:1.55; color:${BRAND.textSecondary};">${escapeHtml(footnote)}</p>
              </td>
            </tr>`
                : ''
            }
          </table>
          <p style="margin:20px 0 0; font-size:11px; line-height:1.5; color:${BRAND.textFaint};">Whispering Shadows · Stories that stay with you</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Exported for callers that need the accent color inline in their own
// bodyHtml (e.g. a prominently displayed OTP code) rather than as a CTA.
export const EMAIL_ACCENT_COLOR = EMBER;
