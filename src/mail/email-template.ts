// Minimal, inline-styled HTML shell shared by every outgoing email. Tables
// instead of flexbox/grid, no external CSS/fonts/images: mail clients strip
// <style> blocks inconsistently and block remote assets by default, so
// anything that isn't inline-styled or self-contained renders unreliably.
// Every dynamic value passed through here — or embedded in a caller's
// `bodyHtml` — must go through escapeHtml first; digest emails in particular
// interpolate user-authored story titles and names.
const EMBER = '#ff7a3d';

const BRAND = {
  bg: '#101013',
  surface: '#1c1c22',
  border: '#2e2e35',
  text: '#ededf0',
  textSecondary: '#a6a5af',
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
    <span style="display:none; visibility:hidden; opacity:0; overflow:hidden; height:0; width:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:${BRAND.surface}; border:1px solid ${BRAND.border}; border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 4px; text-align:center;">
                <span style="font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:${BRAND.ember}; font-weight:600;">Whispering Shadows</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;">
                <h1 style="margin:0 0 16px; font-size:20px; line-height:1.3; color:${BRAND.text};">${escapeHtml(heading)}</h1>
                <div style="font-size:15px; line-height:1.65; color:${BRAND.textSecondary};">${bodyHtml}</div>
              </td>
            </tr>${
              cta
                ? `
            <tr>
              <td style="padding:8px 32px 28px;" align="center">
                <a href="${escapeHtml(cta.url)}" style="display:inline-block; background:${BRAND.ember}; color:${BRAND.emberContrast}; text-decoration:none; font-weight:600; font-size:15px; padding:12px 28px; border-radius:8px;">${escapeHtml(cta.label)}</a>
              </td>
            </tr>`
                : ''
            }${
              footnote
                ? `
            <tr>
              <td style="padding:16px 32px 28px; border-top:1px solid ${BRAND.border};">
                <p style="margin:0; font-size:13px; line-height:1.5; color:${BRAND.textSecondary};">${escapeHtml(footnote)}</p>
              </td>
            </tr>`
                : ''
            }
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Exported for callers that need the accent color inline in their own
// bodyHtml (e.g. a prominently displayed OTP code) rather than as a CTA.
export const EMAIL_ACCENT_COLOR = EMBER;
