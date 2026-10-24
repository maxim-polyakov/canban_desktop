import { buildPeopleDirectory } from './TeamsPages.jsx';
import { TEAM_ROLE_OPTIONS } from './TeamsDialogs.jsx';

test('people directory contains only the current user and their colleagues', () => {
  const me = { id: 'me', displayName: 'Max', email: 'max@example.com', avatarUrl: '/me.png' };
  const colleagues = [
    { id: 'colleague', displayName: 'Teammate', sharedTeams: 1 },
    { id: 'me', displayName: 'Duplicate Max', sharedTeams: 1 },
  ];

  expect(buildPeopleDirectory(me, colleagues)).toEqual([
    { ...me, sharedTeams: 0 },
    colleagues[0],
  ]);
});

test('people directory is empty for an anonymous user without colleagues', () => {
  expect(buildPeopleDirectory(null, null)).toEqual([]);
});

test('add people dialog offers every supported team role', () => {
  expect(TEAM_ROLE_OPTIONS.map(([value]) => value)).toEqual(['Admin', 'Lead', 'Member', 'Viewer']);
});
