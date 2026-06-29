import { describe, it, expect } from 'vitest';
import { renderElement } from '../src/doc/elements.js';
import type { DocSettings, ElementCtx, ElementSpec } from '../src/types.js';

/* A full, realistic DocSettings literal (every field resolved). */
const settings: DocSettings = {
  pageSize: 'Letter',
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 20,
  marginRight: 20,
  fontPreset: 'noto-serif',
  fontSize: 12,
  lineHeight: 1.5,
  decorationColor: '#2962a4',
  pageNumberPosition: 'footer-center',
  pageNumberStyle: 'simple',
  pageNumberStartPage: 1,
  firstPageSkipNumber: false,
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  headerRule: true,
  headerFontSize: 9,
  footerLeft: '',
  footerCenter: '',
  footerRight: '',
  footerRule: true,
  footerFontSize: 9,
  firstPageHideHeader: false,
  firstPageHideFooter: false,
  limitImageToPage: true,
  keepImageTogether: true,
  repeatTableHeader: true,
  avoidTableRowBreaks: true,
  theme: 'none',
};

/* Fake ctx: identity inline, naive block wrapper. */
const ctx: ElementCtx = {
  renderInline: (s) => s,
  renderBlock: (s) => '<p>' + s + '</p>',
  settings,
};

function spec(kind: ElementSpec['kind'], fields: Record<string, string>, extra?: Partial<ElementSpec>): ElementSpec {
  return { kind, fields, ...extra };
}

describe('renderElement — wrappers & basics', () => {
  it('wraps every styled kind in orz-el-<kind> with non-empty css', () => {
    const kinds: ElementSpec['kind'][] = [
      'article-title',
      'report-title',
      'exam-title',
      'abstract',
      'letterhead',
      'letter-inside-address',
      'letter-signature',
      'toc',
      'cv-header',
      'question-mc',
      'question-open',
      'timestamp',
    ];
    for (const kind of kinds) {
      const r = renderElement(spec(kind, { title: 'X', body: 'B', text: 'T', full_name: 'N' }), ctx);
      expect(r.html).toContain(`orz-el-${kind}`);
      expect(r.html).toContain('orz-element');
      expect(r.css && r.css.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns empty result for an unknown kind', () => {
    // Cast: deliberately exercise the default branch.
    const r = renderElement(spec('not-a-kind' as ElementSpec['kind'], {}), ctx);
    expect(r).toEqual({ html: '', css: '', placement: 'section' });
  });
});

describe('article-title', () => {
  it('renders title/subtitle/author and defaults to section placement', () => {
    const r = renderElement(
      spec('article-title', {
        title: 'On Widgets',
        subtitle: 'A Study',
        author: 'Ada Lovelace',
        date: 'March 2026',
      }),
      ctx,
    );
    expect(r.placement).toBe('section');
    expect(r.html).toContain('On Widgets');
    expect(r.html).toContain('A Study');
    expect(r.html).toContain('Ada Lovelace');
    expect(r.html).toContain('March 2026');
    expect(r.html).not.toContain('orz-place-page');
  });

  it('placement: page (via spec.placement) signals a page break', () => {
    const r = renderElement(
      spec('article-title', { title: 'Cover' }, { placement: 'page' }),
      ctx,
    );
    expect(r.placement).toBe('page');
    expect(r.html).toContain('orz-place-page');
    expect(r.css).toContain('break-after: page');
  });

  it('placement: page (via fields) is also honored', () => {
    const r = renderElement(
      spec('article-title', { title: 'Cover', placement: 'page' }),
      ctx,
    );
    expect(r.placement).toBe('page');
    expect(r.css).toContain('break-after: page');
  });

  it('rich authors: multiple authors with marks, email, orcid + affiliations/notes', () => {
    const r = renderElement(
      spec('article-title', {
        title: 'Multi-author',
        authors: [
          'Jane Doe | 1,* | jane@uni.edu | 0000-0002-1825-0097',
          'John Smith | 2',
        ].join('\n'),
        affiliations: ['1: Dept of Chemistry, Uni', '2: Example Lab'].join('\n'),
        notes: '*: Corresponding author',
      }),
      ctx,
    );
    // two authors
    expect(r.html).toContain('Jane Doe');
    expect(r.html).toContain('John Smith');
    expect((r.html.match(/orz-author-name/g) || []).length).toBe(2);
    // affiliation marks as superscript
    expect(r.html).toContain('<sup class="orz-author-mark">1,*</sup>');
    // email → mailto link
    expect(r.html).toContain('href="mailto:jane@uni.edu"');
    // orcid → orcid.org link
    expect(r.html).toContain('href="https://orcid.org/0000-0002-1825-0097"');
    // affiliations + notes blocks, keyed by superscripts
    expect(r.html).toContain('orz-affiliations');
    expect(r.html).toContain('<sup>1</sup> Dept of Chemistry, Uni');
    expect(r.html).toContain('orz-notes');
    expect(r.html).toContain('<sup>*</sup> Corresponding author');
  });

  it('falls back to the legacy single `author` field', () => {
    const r = renderElement(spec('article-title', { title: 'X', author: 'Ada Lovelace' }), ctx);
    expect(r.html).toContain('orz-author');
    expect(r.html).toContain('Ada Lovelace');
  });
});

describe('exam-title', () => {
  it('includes course / duration / total points', () => {
    const r = renderElement(
      spec('exam-title', {
        title: 'Final Exam',
        course: 'CS 101',
        duration: '90 minutes',
        total_points: '100 pts',
      }),
      ctx,
    );
    expect(r.html).toContain('Final Exam');
    expect(r.html).toContain('CS 101');
    expect(r.html).toContain('90 minutes');
    expect(r.html).toContain('100 pts');
  });

  it('puts several student fields on one row (| separator) with a score suffix', () => {
    const r = renderElement(
      spec('exam-title', {
        title: 'Final',
        student_fields: 'Name | Student ID | Score / 100',
        instructions: '- Answer all questions.\n- No calculators.',
      }),
      ctx,
    );
    expect((r.html.match(/orz-exam-row/g) || []).length).toBe(1); // one row
    expect((r.html.match(/orz-exam-field"/g) || []).length).toBe(3); // three fields on it
    expect(r.html).toContain('orz-field-label">Name');
    expect(r.html).toContain('orz-field-label">Student ID');
    expect(r.html).toContain('orz-field-label">Score');
    expect(r.html).toContain('orz-field-suffix">/ 100'); // trailing "/ N" → suffix after the blank
    expect(r.html).toContain('orz-exam-instructions');
    expect(r.css).toContain('.orz-el-exam-title .orz-field-blank');
  });

  it('stacks student fields when on separate lines', () => {
    const r = renderElement(
      spec('exam-title', { title: 'X', student_fields: 'Name\nStudent ID' }),
      ctx,
    );
    expect((r.html.match(/orz-exam-row/g) || []).length).toBe(2); // two rows
    expect((r.html.match(/orz-exam-field"/g) || []).length).toBe(2);
  });

  it('student fields / instructions are exam-only (absent on article-title)', () => {
    const r = renderElement(
      spec('article-title', { title: 'X', student_fields: 'Name', instructions: 'Do this' }),
      ctx,
    );
    expect(r.html).not.toContain('orz-exam-field');
    expect(r.html).not.toContain('orz-exam-instructions');
  });
});

describe('question answer reveal (dynamic switch)', () => {
  it('question-mc marks the correct option with a show-when ✓', () => {
    const r = renderElement(
      spec('question-mc', { n: '1', body: 'Q?', options: 'A. one\nB. two', answer: 'B' }),
      ctx,
    );
    expect(r.html).toContain('data-answer="true"');
    expect(r.html).toContain('orz-answer-mark');
    expect(r.html).toContain('data-show-when="answer-key=show"');
  });
  it('question-mc supports multiple correct answers (select all that apply)', () => {
    const opts = 'A. one\nB. two\nC. three\nD. four';
    for (const ans of ['B, D', 'B D', 'BD', 'B and D']) {
      const r = renderElement(spec('question-mc', { n: '1', body: 'Q?', options: opts, answer: ans }), ctx);
      expect((r.html.match(/data-answer="true"/g) || []).length, ans).toBe(2);
      expect((r.html.match(/orz-answer-mark/g) || []).length, ans).toBe(2);
    }
  });

  it('question-open wraps the model answer in a show-when block', () => {
    const r = renderElement(
      spec('question-open', { n: '2', body: 'Explain.', answer: 'Because reasons.' }),
      ctx,
    );
    expect(r.html).toContain('orz-answer-key');
    expect(r.html).toContain('data-show-when="answer-key=show"');
    expect(r.html).toContain('Because reasons.');
  });
  it('question-open without an answer emits no reveal block', () => {
    const r = renderElement(spec('question-open', { n: '3', body: 'Q' }), ctx);
    expect(r.html).not.toContain('orz-answer-key');
  });
});

describe('abstract', () => {
  it('renders text via block ctx and shows keywords', () => {
    const r = renderElement(
      spec('abstract', { text: 'This is the abstract.', keywords: 'a, b, c' }),
      ctx,
    );
    expect(r.html).toContain('<p>This is the abstract.</p>');
    expect(r.html).toContain('Keywords');
    expect(r.html).toContain('a, b, c');
  });
});

describe('letterhead', () => {
  it('splits a pipe-separated address into multiple lines', () => {
    const r = renderElement(
      spec('letterhead', {
        organization: 'Acme Corp',
        address: '123 Main St | Suite 4 | Springfield, IL',
        phone: '555-1234',
        email: 'hi@acme.test',
      }),
      ctx,
    );
    expect(r.html).toContain('Acme Corp');
    expect(r.html).toContain('123 Main St');
    expect(r.html).toContain('Suite 4');
    expect(r.html).toContain('Springfield, IL');
    // Three distinct address-line spans.
    const count = (r.html.match(/orz-address-line/g) || []).length;
    expect(count).toBe(3);
    expect(r.html).toContain('555-1234');
    expect(r.html).toContain('hi@acme.test');
  });
});

describe('letter-inside-address', () => {
  it('splits pipe fields and uses an <address> element', () => {
    const r = renderElement(
      spec('letter-inside-address', {
        to: 'Dr. Smith',
        organization: 'Dept of Physics | University X',
      }),
      ctx,
    );
    expect(r.html).toContain('Dr. Smith');
    expect(r.html).toContain('Dept of Physics');
    expect(r.html).toContain('University X');
    expect(r.html).toContain('<address');
  });
});

describe('letter-signature', () => {
  it('defaults closing to "Sincerely" and renders from', () => {
    const r = renderElement(spec('letter-signature', { from: 'Jane Doe' }), ctx);
    expect(r.html).toContain('Sincerely');
    expect(r.html).toContain('Jane Doe');
  });

  it('honors an explicit closing', () => {
    const r = renderElement(
      spec('letter-signature', { from: 'Jane', closing: 'Best regards' }),
      ctx,
    );
    expect(r.html).toContain('Best regards');
    expect(r.html).not.toContain('Sincerely');
  });
});

describe('toc', () => {
  it('emits a heading and an empty nav placeholder with data-max-level', () => {
    const r = renderElement(spec('toc', { title: 'Contents', max_level: '2' }), ctx);
    expect(r.html).toContain('Contents');
    expect(r.html).toContain('data-max-level="2"');
    expect(r.html).toMatch(/<nav class="orz-toc"[^>]*><\/nav>/);
  });

  it('defaults title and max-level', () => {
    const r = renderElement(spec('toc', {}), ctx);
    expect(r.html).toContain('Table of Contents');
    expect(r.html).toContain('data-max-level="3"');
  });
});

describe('cv-header', () => {
  it('renders name, title and pipe-separated contacts', () => {
    const r = renderElement(
      spec('cv-header', {
        full_name: 'Sam Rivers',
        title: 'Engineer',
        contacts: 'sam@x.test | 555-9999 | github.com/sam',
      }),
      ctx,
    );
    expect(r.html).toContain('Sam Rivers');
    expect(r.html).toContain('Engineer');
    expect(r.html).toContain('sam@x.test');
    const count = (r.html.match(/orz-cv-contact/g) || []).length;
    // 3 contact spans plus the container class once.
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

describe('question-mc', () => {
  it('renders each option and marks the answer with data-answer', () => {
    const r = renderElement(
      spec('question-mc', {
        n: '1',
        pts: '5 pts',
        body: 'What is 2+2?',
        options: 'A. 3\nB. 4\nC. 5\nD. 6',
        answer: 'B',
      }),
      ctx,
    );
    expect(r.html).toContain('What is 2+2?');
    // four options present
    const optCount = (r.html.match(/class="orz-option"/g) || []).length;
    expect(optCount).toBe(4);
    // the answer is marked
    expect(r.html).toContain('data-answer="true"');
    // only one answer marked
    const ansCount = (r.html.match(/data-answer="true"/g) || []).length;
    expect(ansCount).toBe(1);
    // header shows number and points
    expect(r.html).toContain('1.');
    expect(r.html).toContain('5 pts');
  });

  it('auto-letters options without explicit labels', () => {
    const r = renderElement(
      spec('question-mc', {
        n: '2',
        body: 'Pick one',
        options: 'red\ngreen\nblue',
        answer: 'C',
      }),
      ctx,
    );
    expect(r.html).toContain('A.');
    expect(r.html).toContain('B.');
    expect(r.html).toContain('C.');
    // C (blue) is the answer
    expect(r.html).toContain('data-answer="true"');
  });
});

describe('question-open', () => {
  it('renders body and a blank writing space with default height', () => {
    const r = renderElement(
      spec('question-open', { n: '3', pts: '10', body: 'Explain.' }),
      ctx,
    );
    expect(r.html).toContain('Explain.');
    expect(r.html).toContain('orz-q-space');
    expect(r.html).toContain('height:3cm');
  });

  it('honors a custom space height', () => {
    const r = renderElement(
      spec('question-open', { n: '4', body: 'Q', space: '5cm' }),
      ctx,
    );
    expect(r.html).toContain('height:5cm');
  });
});

describe('timestamp', () => {
  it('defaults label to "Last updated" and renders a date', () => {
    const r = renderElement(spec('timestamp', { date: '2026-01-01' }), ctx);
    expect(r.html).toContain('Last updated');
    expect(r.html).toContain('2026-01-01');
    expect(r.html).toContain('<time');
  });
});

describe('escaping', () => {
  it('escapes user text that lands in attributes/plain fields', () => {
    const r = renderElement(
      spec('question-open', { n: '1', body: 'Q', space: '"><script>' }),
      ctx,
    );
    expect(r.html).not.toContain('"><script>');
    expect(r.html).toContain('&quot;&gt;&lt;script&gt;');
  });
});
