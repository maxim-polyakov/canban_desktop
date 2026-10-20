import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownView, markdownExcerpt, parseMarkdown } from './markdown.jsx';

test('parses headings, lists, task lists, quotes and code fences', () => {
  const blocks = parseMarkdown('# Title\n\n- a\n- b\n\n- [x] done\n- [ ] todo\n\n> note\n\n```\nx = 1\n```\n\ntext');
  expect(blocks.map((b) => b.type)).toEqual(['heading', 'ul', 'tasks', 'quote', 'code', 'paragraph']);
  expect(blocks[2].items).toEqual([{ text: 'done', checked: true }, { text: 'todo', checked: false }]);
});

test('renders inline formatting and drops unsafe links', () => {
  const markup = renderToStaticMarkup(<MarkdownView source={'**bold** *it* `code` [ok](https://x.dev) [bad](javascript:alert(1))'} />);
  expect(markup).toContain('<strong>bold</strong>');
  expect(markup).toContain('<em>it</em>');
  expect(markup).toContain('<code>code</code>');
  expect(markup).toContain('href="https://x.dev"');
  expect(markup).not.toContain('javascript:');
  expect(markup).toContain('bad');
});

test('excerpt strips markup', () => {
  expect(markdownExcerpt('# Hi\n**there**')).toBe('Hi there');
});
