import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WatcherBadge, WatcherIcon, IssueTypeIcon, PriorityIcon } from './IssueIcons.jsx';

describe('WatcherBadge', () => {
  test('renders nothing when there are no watchers', () => {
    const markup = renderToStaticMarkup(<WatcherBadge count={0} />);
    expect(markup).toBe('');
  });

  test('renders the count and a pluralized Russian label by default', () => {
    const one = renderToStaticMarkup(<WatcherBadge count={1} />);
    expect(one).toContain('>1<');
    expect(one).toContain('1 наблюдатель');

    const few = renderToStaticMarkup(<WatcherBadge count={3} />);
    expect(few).toContain('3 наблюдателя');

    const many = renderToStaticMarkup(<WatcherBadge count={7} />);
    expect(many).toContain('7 наблюдателей');
  });

  test('accepts a custom title override', () => {
    const markup = renderToStaticMarkup(<WatcherBadge count={2} title="Watchers: 2" />);
    expect(markup).toContain('title="Watchers: 2"');
  });
});

describe('WatcherIcon', () => {
  test('renders an svg sized to the requested dimensions', () => {
    const markup = renderToStaticMarkup(<WatcherIcon size={18} />);
    expect(markup).toContain('width:18px');
    expect(markup).toContain('<svg');
  });
});

describe('IssueTypeIcon / PriorityIcon smoke tests', () => {
  test('issue type icon falls back to Task for an unknown type', () => {
    const markup = renderToStaticMarkup(<IssueTypeIcon issueType={99} />);
    expect(markup).toContain('title="Задача"');
  });

  test('priority icon renders the Highest label for priority 4', () => {
    const markup = renderToStaticMarkup(<PriorityIcon priority={4} />);
    expect(markup).toContain('title="Высший"');
  });
});
