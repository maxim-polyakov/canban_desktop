import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AssigneeAvatar from './AssigneeAvatar.jsx';

describe('AssigneeAvatar', () => {
  test('uses two initials for a full display name', () => {
    const markup = renderToStaticMarkup(
      <AssigneeAvatar displayName="Ada Lovelace" size={32} />
    );

    expect(markup).toContain('AL');
    expect(markup).toContain('title="Ada Lovelace"');
    expect(markup).toContain('width:32px');
  });

  test('renders an image instead of initials when an avatar exists', () => {
    const markup = renderToStaticMarkup(
      <AssigneeAvatar displayName="Ada Lovelace" avatarUrl="/avatars/ada.png" />
    );

    expect(markup).toContain('<img');
    expect(markup).toContain('src="/avatars/ada.png"');
    expect(markup).not.toContain('AL');
  });

  test('uses a stable fallback for a blank name', () => {
    const markup = renderToStaticMarkup(<AssigneeAvatar displayName="  " />);

    expect(markup).toContain('>?<');
  });
});
