import { activeMention, insertMention, mentionCandidates, mentionsToPlainText, splitMentions } from './mentions.js';

const anna = { userId: '11111111-1111-1111-1111-111111111111', displayName: 'Анна Петрова', email: 'anna@example.com' };
const boris = { userId: '22222222-2222-2222-2222-222222222222', displayName: 'Борис', email: 'b@example.com' };

test('finds the @query before the caret', () => {
  expect(activeMention('Привет @Ан', 10)).toEqual({ start: 7, query: 'Ан' });
  expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
  expect(activeMention('почта a@b', 9)).toBeNull();
  expect(activeMention('Привет @Анна ', 13)).toBeNull();
});

test('suggests members by any name word or email', () => {
  expect(mentionCandidates([anna, boris], 'пет')).toEqual([anna]);
  expect(mentionCandidates([anna, boris], 'b')).toEqual([boris]);
  expect(mentionCandidates([anna, boris], '')).toHaveLength(2);
});

test('inserts a mention token and round-trips it', () => {
  const { text, caret } = insertMention('Привет @Ан!', 7, 10, anna);
  expect(text).toBe(`Привет @[Анна Петрова](${anna.userId}) !`);
  expect(caret).toBe(text.length - 1);
  expect(splitMentions(text)).toEqual(['Привет ', { name: 'Анна Петрова', id: anna.userId }, ' !']);
  expect(mentionsToPlainText(text)).toBe('Привет @Анна Петрова !');
});
