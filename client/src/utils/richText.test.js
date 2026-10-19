import { parseRichText, richTextToPlainText, serializeRichText } from './richText.js';

test('falls back to safe plain-text blocks', () => {
  expect(parseRichText('<img src=x onerror=alert(1)>')[0].text).toBe('<img src=x onerror=alert(1)>');
});

test('round trips structured text without HTML rendering', () => {
  const value = serializeRichText('# Heading\n\n- Item');
  expect(parseRichText(value)).toEqual([
    { type: 'heading', text: 'Heading' },
    { type: 'listItem', text: 'Item' },
  ]);
  expect(richTextToPlainText(value)).toBe('Heading\n\nItem');
});

test('invalid structured input remains plain text', () => {
  expect(richTextToPlainText('{invalid')).toBe('{invalid');
});
