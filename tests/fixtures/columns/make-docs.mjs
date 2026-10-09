/**
 * The 8 documents of the two-column regression (tests/columns.test.ts), as the
 * prototype made them (2026-10-09, /tmp/cols-proto/docs.mjs, REBUILD §3b
 * decision 1): a long block, unequal columns, a short block near the bottom,
 * three and custom-width columns, columns in a section, an exam with
 * two-column questions, edge cases (a tall image, code, a 40-sentence
 * paragraph), an over-tall item. Deterministic; the .md files next to this
 * script are its output (`node make-docs.mjs` rewrites them).
 */
import { writeFileSync } from 'node:fs';
const DIR = new URL('./', import.meta.url).pathname;
const POOL = [
  'The measured response follows the predicted curve closely across the full range of inputs.',
  'Small deviations appear near the boundary, where the approximation is known to weaken.',
  'We therefore repeat the experiment with a finer grid and a longer settling time.',
  'Each sample is weighed twice, and the mean of the two readings is recorded.',
  'Reviewers asked for a clearer statement of the assumptions behind the model.',
  'In practice the correction is small, but it matters for the final uncertainty budget.',
  'The second column of the table lists the standard error for each estimate.',
  'This section explains why the simple linear fit is adequate for the present purpose.',
];
let k = 0;
const sent = () => POOL[(k++) % POOL.length];
// tag = marker so the integrity check can verify order per column
const para = (tag, n = 4) => `**[${tag}]** ` + Array.from({ length: n }, sent).join(' ');
const paras = (pfx, count, n) => Array.from({ length: count }, (_, i) => para(`${pfx}${i + 1}`, n)).join('\n\n');
const list = (pfx, items, ordered = false) => Array.from({ length: items }, (_, i) => `${ordered ? (i + 1) + '.' : '-'} [${pfx}${i + 1}] ${sent()}${i % 3 === 0 ? ' ' + sent() : ''}`).join('\n');
const img = '![figure](fig.svg =240x135)';
const math = '$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}, \\qquad \\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}\n$$';
const head = (extra = '') => `{{nyml\nkind: document\n${extra}}}\n\n`;

const docs = {
  a_long: head('page_size: A4\n') + `# Two-column report\n\n${para('INTRO', 3)}\n\n::::: cols\n:::: col\n${paras('L', 7, 5)}\n\n${list('Lli', 7)}\n\n${img}\n\n${para('Lm', 2)} Inline math $E = mc^2$ sits in the text.\n\n${math}\n\n${para('LLONG', 22)}\n\n${paras('Lz', 3, 4)}\n::::\n:::: col\n${paras('R', 6, 5)}\n\n::: info\n**[RINFO]** A boxed aside inside a column (break-inside: avoid). ${sent()} ${sent()}\n:::\n\n${list('Rol', 9, true)}\n\n${math}\n\n${paras('Rz', 8, 5)}\n::::\n:::::\n\n${para('AFTER', 3)}\n`,

  b_unequal: head('page_size: Letter\n') + `# Unequal columns\n\n${para('INTRO', 4)}\n\n::::: cols\n:::: col\n${paras('L', 2, 3)}\n::::\n:::: col\n${paras('R', 16, 5)}\n\n${list('Rli', 6)}\n\n${paras('Rz', 6, 5)}\n::::\n:::::\n\n${para('AFTER', 3)}\n`,

  c_short_bottom: head('page_size: A4\n') + `# Short block near the bottom\n\n${paras('F', 5, 6)}\n\n${para('F6', 1)}\n\n::::: cols\n:::: col\n${paras('L', 2, 3)}\n::::\n:::: col\n${paras('R', 2, 3)}\n::::\n:::::\n\n${paras('AFTER', 3, 4)}\n`,

  d_three_custom: head('page_size: Letter\n') + `# Three columns and custom widths\n\n${para('INTRO', 3)}\n\n::::: cols\n:::: col\n${paras('A', 8, 4)}\n::::\n:::: col\n${paras('B', 6, 4)}\n\n${list('Bli', 5)}\n::::\n:::: col\n${paras('C', 9, 4)}\n::::\n:::::\n\n## Custom widths (1 : 2)\n\n::::: cols 1 2\n:::: col\n${paras('N', 6, 3)}\n::::\n:::: col\n${paras('W', 9, 5)}\n\n${img}\n\n${paras('Wz', 3, 4)}\n::::\n:::::\n\n${para('AFTER', 3)}\n`,

  e_section: head('page_size: A4\n') + `# Report\n\n## 1. Background\n\n${paras('BG', 6, 6)}\n\n## 2. Comparison\n\n${para('CMP', 3)}\n\n::::: cols\n:::: col\n### Method A\n\n${paras('L', 4, 5)}\n\n${list('Lli', 4)}\n::::\n:::: col\n### Method B\n\n${paras('R', 5, 5)}\n\n${math}\n::::\n:::::\n\n## 3. Discussion\n\n${paras('DIS', 4, 5)}\n`,
};

// (f) exam: several MC questions, one landing near the page break; one with 8 options
const mc = (n, opts = 4, long = false) => `{{nyml\nkind: question-mc\nn: ${n}\npts: 5 pts\nbody: [Q${n}] ${sent()} ${long ? sent() + ' ' + sent() : ''}\noptions: |\n${Array.from({ length: opts }, (_, i) => `  ${String.fromCharCode(65 + i)}. [Q${n}${String.fromCharCode(65 + i)}] answer choice ${i + 1}`).join('\n')}\nanswer: B\n}}\n`;
docs.f_exam = head('template: exam-section\npage_size: Letter\ndynamic_choices: |\n  answer-key: hide\n') +
  `{{nyml\nkind: exam-title\ntitle: Midterm Exam\nsubtitle: Columns test\nauthor: Instructor\nstudent_fields: |\n  Name | Student ID | Score / 100\nplacement: section\n}}\n\n**Instructions.** ${sent()} ${sent()}\n\n` +
  Array.from({ length: 5 }, (_, i) => mc(i + 1, i === 3 ? 12 : 4, i % 2 === 0)).join('\n') +
  `\n## Part B — two-column questions\n\n${para('MID', 2)}\n\n::::: cols\n:::: col\n` + Array.from({ length: 5 }, (_, i) => mc(i + 10, 4, i % 2 === 0)).join('\n') +
  `\n::::\n:::: col\n` + Array.from({ length: 5 }, (_, i) => mc(i + 20, 4, i % 2 === 1)).join('\n') + `\n::::\n:::::\n\n${para('END', 2)}\n`;

for (const [name, src] of Object.entries(docs)) writeFileSync(`${DIR}${name}.md`, src);
console.log(Object.keys(docs).join(' '));
const tall = '![tall](fig.svg =600x1400)';
writeFileSync(`${DIR}g_edge.md`, head('page_size: Letter\n') + `# Edge cases\n\n${para('INTRO', 2)}\n\n::::: cols\n:::: col\n${paras('L', 2, 3)}\n\n${tall}\n\n${paras('Lz', 2, 3)}\n::::\n:::: col\n${paras('R', 3, 4)}\n\n\`\`\`\ncode line 1\ncode line 2\ncode line 3\n\`\`\`\n\n${para('RLONG', 40)}\n::::\n:::::\n\n${para('AFTER', 2)}\n`);
writeFileSync(`${DIR}h_overtall.md`, head('page_size: A4\n') + `# Over-tall item\n\n${para('INTRO', 2)}\n\n::::: cols\n:::: col\n${para('L1', 3)}\n\n<img src="fig.svg" style="width:100%;height:1250px;object-fit:fill">\n\n${para('L2', 3)}\n::::\n:::: col\n${paras('R', 6, 5)}\n::::\n:::::\n\n${para('AFTER', 2)}\n`);
