import { manageableSpaceTeams } from './CreateSpaceDialog.jsx';

test('only administrators can create a space in an existing team', () => {
  const teams = [
    { team: { id: 'member', name: 'Python51', canManage: false }, boards: [] },
    { team: { id: 'admin', name: 'Own team', canManage: true }, boards: [] },
  ];
  expect(manageableSpaceTeams(teams).map(({ team }) => team.id)).toEqual(['admin']);
  expect(manageableSpaceTeams([{ team: { id: 'member', canManage: false } }])).toEqual([]);
});
