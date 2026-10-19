import { isValidSpaceKey, suggestSpaceKey } from './spaceKey.js';

test('suggests keys like Jira', () => {
  expect(suggestSpaceKey('Marketing')).toBe('MARK');
  expect(suggestSpaceKey('Mobile app backend')).toBe('MAB');
  expect(suggestSpaceKey('Разработка сайта')).toBe('RS');
  expect(suggestSpaceKey('Канбан')).toBe('KANB');
  expect(suggestSpaceKey('2024 plan')).toBe('K2P');
  expect(suggestSpaceKey('')).toBe('');
});

test('validates keys', () => {
  expect(isValidSpaceKey('KAN')).toBe(true);
  expect(isValidSpaceKey('K')).toBe(false);
  expect(isValidSpaceKey('1AB')).toBe(false);
  expect(isValidSpaceKey('ABCDEFGHIJK')).toBe(false);
});
