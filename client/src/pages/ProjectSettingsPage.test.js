import { parseRepository } from './ProjectSettingsPage.jsx';
import { resolveQuestIds } from './OperationsPage.jsx';

test('parses GitHub repository input', () => {
  expect(parseRepository('maxim-polyakov/canban_desktop')).toEqual({ repositoryOwner: 'maxim-polyakov', repositoryName: 'canban_desktop' });
  expect(parseRepository('https://github.com/o/r.git')).toEqual({ repositoryOwner: 'o', repositoryName: 'r' });
  expect(parseRepository('just-owner')).toBeNull();
});

test('resolves issue keys to quest ids', () => {
  const issues = [{ id: 'id-1', issueKey: 'KAN-1' }, { id: 'id-2', issueKey: 'KAN-2' }];
  expect(resolveQuestIds('kan-1, id-2 KAN-9', issues)).toEqual({ ids: ['id-1', 'id-2'], unknown: ['KAN-9'] });
});
