import {escapeHtml, renderEmailHtml} from './email-template';

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<script>&"'</script>`)).toBe(
      '&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;'
    );
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('The Attic, by Mara')).toBe('The Attic, by Mara');
  });
});

describe('renderEmailHtml', () => {
  it('escapes the heading and preheader', () => {
    const html = renderEmailHtml({
      preheader: '<img src=x>',
      heading: 'A & B <script>',
      bodyHtml: '<p>hi</p>',
    });

    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('A &amp; B &lt;script&gt;');
  });

  it('includes the body HTML verbatim (caller owns its escaping)', () => {
    const html = renderEmailHtml({
      preheader: 'preview',
      heading: 'Heading',
      bodyHtml: '<p>Custom body content</p>',
    });

    expect(html).toContain('<p>Custom body content</p>');
  });

  it('omits the CTA block when no cta is given, includes it when one is', () => {
    const withoutCta = renderEmailHtml({
      preheader: 'p',
      heading: 'h',
      bodyHtml: '<p>b</p>',
    });
    expect(withoutCta).not.toContain('<a href=');

    const withCta = renderEmailHtml({
      preheader: 'p',
      heading: 'h',
      bodyHtml: '<p>b</p>',
      cta: {label: 'Click me', url: 'https://example.test/go?a=1&b=2'},
    });
    expect(withCta).toContain('Click me');
    expect(withCta).toContain('https://example.test/go?a=1&amp;b=2');
    expect(withCta).toContain('Button not working?');
  });

  it('uses a self-contained table layout with no remote assets', () => {
    const html = renderEmailHtml({
      preheader: 'preview',
      heading: 'Heading',
      bodyHtml: '<p>Body</p>',
    });

    expect(html).toContain('role="presentation"');
    expect(html).toContain('Whispering<span');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<link');
  });

  it('omits the footnote block when none is given, includes it when one is', () => {
    const withoutFootnote = renderEmailHtml({
      preheader: 'p',
      heading: 'h',
      bodyHtml: '<p>b</p>',
    });
    const withFootnote = renderEmailHtml({
      preheader: 'p',
      heading: 'h',
      bodyHtml: '<p>b</p>',
      footnote: 'Ignore this if it was not you.',
    });

    expect(withFootnote).toContain('Ignore this if it was not you.');
    expect(withFootnote.length).toBeGreaterThan(withoutFootnote.length);
  });
});
