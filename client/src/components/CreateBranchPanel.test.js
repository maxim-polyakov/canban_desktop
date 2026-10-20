import { sanitizeBranchName, suggestBranchName } from './CreateBranchPanel.jsx';

test('branch name starts with the issue key and transliterates the title', () => {
  expect(suggestBranchName('LOTU-1', 'Экран меню: кнопки!')).toBe('LOTU-1-ekran-menyu-knopki');
  expect(suggestBranchName('KAN-7', 'Fix login')).toBe('KAN-7-fix-login');
  expect(suggestBranchName('KAN-7', '!!!')).toBe('KAN-7');
});

test('branch name is cut to a short slug without a trailing dash', () => {
  const name = suggestBranchName('KAN-1', 'a'.repeat(39) + ' bbbbb');
  expect(name).toBe(`KAN-1-${'a'.repeat(39)}`);
});

test('user-edited names drop characters git rejects', () => {
  expect(sanitizeBranchName(' LOTU-1 my branch?* ')).toBe('LOTU-1-my-branch');
  expect(sanitizeBranchName('a..b')).toBe('a.b');
});
