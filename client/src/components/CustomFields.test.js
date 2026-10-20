import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CustomFieldsPanel from './CustomFields.jsx';
import CreateIssueDialog from './CreateIssueDialog.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import { fieldApplies, formatFieldValue, rememberIssueTypes } from '../utils/issueConfig.js';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));
jest.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1', displayName: 'Me', email: 'me@example.com' } }),
}));

const calls = { setValue: [], create: [] };
const incident = { id: 't-incident', teamId: 'team', name: 'Инцидент', baseType: 3, icon: '🔥', color: '#e5493a' };
const fields = [
  { id: 'f-env', name: 'Окружение', fieldType: 'select', options: ['prod', 'stage'], boards: [], issueTypes: [], required: false },
  { id: 'f-contract', name: 'Договор', fieldType: 'text', options: [], boards: [], issueTypes: [], required: false },
  { id: 'f-sev', name: 'Критичность', fieldType: 'select', options: ['S1', 'S2'], boards: [], issueTypes: ['t-incident'], required: true },
];

jest.mock('../api.js', () => ({
  issueConfig: {
    setValue: (questId, fieldId, value) => {
      calls.setValue.push({ questId, fieldId, value });
      return Promise.resolve({ [fieldId]: value });
    },
    forBoard: () => Promise.resolve({ types: [incident], fields }),
    catalog: () => Promise.resolve({ teams: [], boards: [], types: [], fields: [] }),
  },
  boards: { getById: () => Promise.resolve({ columns: [{ id: 'c1', kind: 0, order: 0 }] }) },
  quests: {
    create: (payload) => {
      calls.create.push(payload);
      return Promise.resolve({ id: 'q-new', issueKey: 'KAN-9' });
    },
  },
  people: { workWith: () => Promise.resolve([]) },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  calls.setValue = [];
  calls.create = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function render(element) {
  await act(async () => { root.render(<MemoryRouter>{element}</MemoryRouter>); });
  await flush();
}

async function change(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush();
}

test('fields follow their issue type scope and format their values', () => {
  expect(fieldApplies(fields[2], 3, null)).toBe(false);
  expect(fieldApplies(fields[2], 3, 't-incident')).toBe(true);
  expect(fieldApplies(fields[0], 0, null)).toBe(true);
  expect(formatFieldValue({ fieldType: 'multiselect' }, ['iOS', 'Web'])).toBe('iOS, Web');
  expect(formatFieldValue({ fieldType: 'checkbox' }, true)).toBe('Да');
  expect(formatFieldValue({ fieldType: 'user' }, 'u2', [{ userId: 'u2', displayName: 'Аня' }])).toBe('Аня');
  expect(formatFieldValue({ fieldType: 'text' }, '')).toBe('');
});

test('issue panel shows applicable fields and saves each one', async () => {
  const saved = [];
  const quest = { id: 'q1', issueType: 2, issueTypeId: null, customFields: { 'f-contract': 'Д-17' } };
  await render(<CustomFieldsPanel quest={quest} fields={fields} onSaved={(values) => saved.push(values)} />);

  expect(container.textContent).toContain('Окружение');
  expect(container.textContent).not.toContain('Критичность');
  const contract = container.querySelector('#custom-field-f-contract');
  expect(contract.value).toBe('Д-17');

  await change(container.querySelector('#custom-field-f-env'), 'prod');
  expect(calls.setValue).toEqual([{ questId: 'q1', fieldId: 'f-env', value: 'prod' }]);
  expect(saved).toEqual([{ 'f-env': 'prod' }]);

  await change(contract, 'Д-18');
  expect(calls.setValue).toHaveLength(1);
  await act(async () => { contract.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await flush();
  expect(calls.setValue[1]).toEqual({ questId: 'q1', fieldId: 'f-contract', value: 'Д-18' });
});

test('custom issue types render their own icon', async () => {
  rememberIssueTypes([incident]);
  await render(<IssueTypeIcon issueType={3} typeId="t-incident" size={16} />);
  const icon = container.querySelector('.issue-type-icon-custom');
  expect(icon.textContent).toBe('🔥');
  expect(icon.getAttribute('title')).toBe('Инцидент');
});

test('create dialog offers custom types and requires their fields', async () => {
  await render(<CreateIssueDialog open onClose={() => {}} boards={[{ id: 'b1', name: 'Разработка' }]} defaultBoardId="b1" />);
  const typeSelect = container.querySelector('select[aria-label="Тип задачи"]');
  expect([...typeSelect.options].map((o) => o.textContent)).toContain('🔥 Инцидент');
  expect(container.textContent).not.toContain('Критичность');

  await change(typeSelect, 't-incident');
  expect(container.textContent).toContain('Критичность');
  await change(container.querySelector('input[maxlength="500"]'), 'Падает оплата');
  const submit = container.querySelector('button[type="submit"]');
  expect(submit.disabled).toBe(true);

  await change(container.querySelector('select[aria-label="Критичность"]'), 'S1');
  expect(submit.disabled).toBe(false);
  await act(async () => { submit.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
  expect(calls.create).toHaveLength(1);
  expect(calls.create[0]).toMatchObject({ issueType: 3, issueTypeId: 't-incident', customFields: { 'f-sev': 'S1' } });
});
