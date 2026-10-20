import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StartSprintDialog, { addWeeks, fromLocalParts, initialDuration, issueCountText, toLocalParts } from './StartSprintDialog.jsx';

const t = (text, params) => String(text).replace(/\$\{(\w+)\}/g, (_, key) => String(params?.[key] ?? ''));

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (text, params) => String(text).replace(/\$\{(\w+)\}/g, (_, key) => String(params?.[key] ?? '')) }),
}));
jest.mock('./NavIcons.jsx', () => () => null);

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const render = async (props) => { await act(async () => { root.render(<StartSprintDialog onClose={() => {}} {...props} />); }); };
const byLabel = (label) => container.querySelector(`[aria-label="${label}"]`);
const setValue = async (el, value) => {
  await act(async () => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const submit = () => click([...container.querySelectorAll('button[type="submit"]')].find((b) => b.textContent === 'Начать'));

test('pluralizes the included issue count like Jira', () => {
  expect(issueCountText(1, t)).toBe('1 задача будет включена в спринт.');
  expect(issueCountText(3, t)).toBe('3 задачи будут включены в спринт.');
  expect(issueCountText(11, t)).toBe('11 задач будут включены в спринт.');
  expect(issueCountText(22, t)).toBe('22 задачи будут включены в спринт.');
  expect(issueCountText(0, t)).toBe('0 задач будут включены в спринт.');
});

test('round-trips local date and time parts', () => {
  const date = new Date(2026, 9, 21, 0, 51);
  expect(toLocalParts(date)).toEqual({ date: '2026-10-21', time: '00:51' });
  expect(fromLocalParts('2026-10-21', '00:51').getTime()).toBe(date.getTime());
  expect(fromLocalParts('', '00:51')).toBeNull();
  expect(toLocalParts(addWeeks(date, 2))).toEqual({ date: '2026-11-04', time: '00:51' });
});

test('detects the planned duration', () => {
  expect(initialDuration({})).toBe('2');
  expect(initialDuration({ startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-22T00:00:00Z' })).toBe('3');
  expect(initialDuration({ startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-05T00:00:00Z' })).toBe('custom');
});

test('starts the sprint with the computed end date', async () => {
  const onStart = jest.fn().mockResolvedValue();
  await render({ sprint: { id: 's1', name: 'EEE Спринт 2', goal: '' }, issueCount: 1, anotherActive: true, onStart });
  expect(container.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe('Запустить другой спринт');
  expect(container.textContent).toContain('1 задача будет включена в спринт.');
  expect(byLabel('Дата окончания').disabled).toBe(true);

  await setValue(byLabel('Дата начала'), '2026-10-21');
  await setValue(byLabel('Время начала'), '00:51');
  expect(byLabel('Дата окончания').value).toBe('2026-11-04');
  await click(container.querySelector('[role="switch"]'));
  await setValue(container.querySelector('textarea'), ' Выпустить релиз ');
  await submit();

  expect(onStart).toHaveBeenCalledWith({
    name: 'EEE Спринт 2',
    goal: 'Выпустить релиз',
    startDate: new Date(2026, 9, 21, 0, 51).toISOString(),
    endDate: new Date(2026, 10, 4, 0, 51).toISOString(),
    autoComplete: true,
  });
});

test('custom duration unlocks the end date and validates it', async () => {
  const onStart = jest.fn().mockResolvedValue();
  await render({ sprint: { id: 's1', name: 'S' }, onStart });
  expect(container.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe('Начать спринт');
  await setValue(container.querySelector('select'), 'custom');
  expect(byLabel('Дата окончания').disabled).toBe(false);
  await setValue(byLabel('Дата начала'), '2026-10-21');
  await setValue(byLabel('Дата окончания'), '2026-10-20');
  await submit();
  expect(container.querySelector('[role="alert"]').textContent).toBe('Дата окончания должна быть позже даты начала.');
  expect(onStart).not.toHaveBeenCalled();
});

test('shows the server error and keeps the dialog open', async () => {
  const onStart = jest.fn().mockRejectedValue(new Error('Спринт уже начат.'));
  await render({ sprint: { id: 's1', name: 'S' }, onStart });
  await submit();
  expect(container.querySelector('[role="alert"]').textContent).toBe('Спринт уже начат.');
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});
