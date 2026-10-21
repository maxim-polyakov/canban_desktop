import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SlaBadges } from './PortalPages.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (value) => value }),
}));

beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });

test('SLA badge marks breached and warning clocks', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <SlaBadges clocks={[
        { id: '1', metric: 'first_response', status: 'breached', remainingMinutes: 0 },
        { id: '2', metric: 'resolution', status: 'running', remainingMinutes: 20 },
        { id: '3', metric: 'resolution', status: 'paused', remainingMinutes: 100 },
      ]} />,
    );
  });
  expect(container.textContent).toContain('Первый ответ');
  expect(container.textContent).toContain('нарушено');
  expect(container.textContent).toContain('пауза');
  expect(container.querySelectorAll('.sd-lozenge.is-bad').length).toBe(1);
  expect(container.querySelectorAll('.sd-lozenge.is-warn').length).toBe(1);
  act(() => root.unmount());
});
