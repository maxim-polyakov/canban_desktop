import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WorkflowDesigner, { NODE_H, NODE_W, boxEdge } from './WorkflowDesigner.jsx';
import TransitionScreenDialog from '../../components/TransitionScreenDialog.jsx';
import { needsTransitionDialog, reachableColumns, transitionsTo } from '../../utils/workflow.js';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));

const initial = () => ({
  initial: 's1',
  statuses: [
    { key: 's1', name: 'Новая', kind: 0, x: 40, y: 40 },
    { key: 's2', name: 'В работе', kind: 1, x: 300, y: 40 },
  ],
  transitions: [{ key: 't1', name: 'Начать', from: ['s1'], to: 's2', conditions: {}, validators: {}, post: {} }],
});

let container;
let root;
let latest;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.confirm = () => true;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Harness({ start }) {
  const [data, setData] = useState(start);
  latest = data;
  return <WorkflowDesigner value={data} onChange={setData} fields={[{ key: 'duedate', label: 'Срок', system: true }]} screens={[{ id: 'scr', name: 'Решение' }]} groups={[]} />;
}

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const render = async (start = initial()) => { await act(async () => { root.render(<Harness start={start} />); }); await flush(); };
const pointer = async (el, type, x, y) => { await act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })); }); };
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
async function change(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}

test('dragging a status moves it on a snapped grid; a click without moving selects it', async () => {
  await render();
  const svg = container.querySelector('svg.wf-canvas');
  const node = container.querySelector('g[aria-label="Статус Новая"]');
  await pointer(node, 'pointerdown', 50, 50);
  await pointer(svg, 'pointermove', 133, 177);
  await pointer(svg, 'pointerup', 133, 177);
  expect(latest.statuses[0]).toMatchObject({ x: 120, y: 170 });
  expect(container.querySelector('.wf-designer-panel')).toBeNull();

  await pointer(node, 'pointerdown', 130, 180);
  await pointer(svg, 'pointerup', 130, 180);
  expect(container.querySelector('input[aria-label="Название статуса"]').value).toBe('Новая');
});

test('dragging from a status handle to another status creates a transition and opens it', async () => {
  await render();
  const svg = container.querySelector('svg.wf-canvas');
  const handle = container.querySelector('g[aria-label="Статус В работе"] .wf-handle');
  await pointer(handle, 'pointerdown', 300 + NODE_W, 40 + NODE_H / 2);
  await pointer(svg, 'pointermove', 80, 60);
  await pointer(svg, 'pointerup', 80, 60);
  expect(latest.transitions).toHaveLength(2);
  expect(latest.transitions[1]).toMatchObject({ from: ['s2'], to: 's1', name: 'Новая' });
  await change(container.querySelector('input[aria-label="Название перехода"]'), 'Вернуть');
  await change(container.querySelector('select[aria-label="Экран перехода"]'), 'scr');
  await act(async () => { [...container.querySelectorAll('.wf-check')].find((l) => l.textContent === 'Срок').querySelector('input').click(); });
  await act(async () => { button('Добавить проверку').click(); });
  await change(container.querySelector('input[aria-label="Регулярное выражение"]'), '^\\w+');
  expect(latest.transitions[1]).toMatchObject({
    name: 'Вернуть', screenId: 'scr',
    validators: { requiredFields: ['duedate'], patterns: [{ field: 'summary', pattern: '^\\w+' }] },
  });
  expect(container.querySelectorAll('text[aria-label="Переход Вернуть"]')).toHaveLength(1);
});

test('statuses can be added, made initial and deleted together with their transitions', async () => {
  await render();
  await act(async () => { button('Добавить статус').click(); });
  expect(latest.statuses).toHaveLength(3);
  await change(container.querySelector('input[aria-label="Название статуса"]'), 'Готово');
  await act(async () => { button('Сделать начальным статусом').click(); });
  expect(latest.initial).toBe('s3');
  await act(async () => { container.querySelector('g[aria-label="Статус В работе"]').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 310, clientY: 50 })); });
  await pointer(container.querySelector('svg.wf-canvas'), 'pointerup', 310, 50);
  await act(async () => { button('Удалить статус').click(); });
  expect(latest.statuses.map((s) => s.key)).toEqual(['s1', 's3']);
  expect(latest.transitions).toEqual([]);
});

test('keyboard arrows move the focused status', async () => {
  await render();
  const node = container.querySelector('g[aria-label="Статус Новая"]');
  await act(async () => { node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  await act(async () => { node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })); });
  expect(latest.statuses[0]).toMatchObject({ x: 50, y: 90 });
});

test('edges leave status boxes at their border', () => {
  const s = { x: 0, y: 0 };
  expect(boxEdge(s, { x: 1000, y: NODE_H / 2 })).toEqual({ x: NODE_W, y: NODE_H / 2 });
  expect(boxEdge(s, { x: NODE_W / 2, y: -500 })).toEqual({ x: NODE_W / 2, y: 0 });
});

test('workflow helpers resolve transitions for an issue', () => {
  const workflow = {
    types: {
      default: { initial: 'c1', statuses: ['c1', 'c2'], transitions: [{ key: 't1', from: ['c1'], to: 'c2', any: false, screen: null }, { key: 't2', from: [], to: 'c1', any: true, screen: [{ name: 'A', fields: ['cf:x'] }] }] },
      3: { initial: 'c1', statuses: ['c1'], transitions: [] },
    },
  };
  const task = { issueType: 2, columnId: 'c1' };
  expect(transitionsTo(workflow, task, 'c2').map((t) => t.key)).toEqual(['t1']);
  expect([...reachableColumns(workflow, { ...task, columnId: 'c2' })]).toEqual(['c1']);
  expect(reachableColumns(null, task)).toBeNull();
  expect([...reachableColumns(workflow, { issueType: 3, columnId: 'c9' })]).toEqual(['c1']);
  expect(needsTransitionDialog(transitionsTo(workflow, { ...task, columnId: 'c2' }, 'c1'))).toBe(true);
  expect(needsTransitionDialog(transitionsTo(workflow, task, 'c2'))).toBe(false);
});

test('transition screen dialog sends only the changed screen fields and the comment', async () => {
  const submitted = [];
  const issue = { id: 'q1', issueKey: 'WEB-1', title: 'Старт', priority: 2, customFields: { f1: 'stage' } };
  const transitions = [
    { key: 't1', name: 'Решить', screen: [{ name: 'Main', fields: ['priority', 'duedate', 'cf:f1', 'components'] }] },
    { key: 't2', name: 'Отклонить', screen: null },
  ];
  const config = { fields: [{ id: 'f1', name: 'Окружение', fieldType: 'text' }], versions: [], groups: [] };
  await act(async () => {
    root.render(<TransitionScreenDialog issue={issue} transitions={transitions} config={config} targetName="Готово" onCancel={() => {}} onSubmit={(c) => { submitted.push(c); return Promise.resolve(); }} />);
  });
  expect(container.querySelector('#tr-components')).toBeNull();
  expect(container.querySelector('#tr-cf\\:f1').value).toBe('stage');
  await change(container.querySelector('#tr-priority'), '4');
  await change(container.querySelector('#tr-duedate'), '2026-12-31');
  const comment = container.querySelector('textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(comment, ' Готово ');
  await act(async () => { comment.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(submitted).toEqual([{ transition: 't1', fields: { priority: 4, duedate: '2026-12-31' }, comment: 'Готово' }]);
});
