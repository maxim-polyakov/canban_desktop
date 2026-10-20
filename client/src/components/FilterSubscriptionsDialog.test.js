import { describeSchedule, emptySubscription, toRequest } from './FilterSubscriptionsDialog.jsx';

const t = (text, values = {}) => text.replace(/\$\{(\w+)\}/g, (_, key) => values[key]);

test('builds the request from the form', () => {
  const form = { ...emptySubscription(), frequency: 'weekly', time: '08:30', daysOfWeek: [1, 5], groupId: '' };
  expect(toRequest(form)).toMatchObject({ groupId: null, frequency: 'weekly', hour: 8, minute: 30, daysOfWeek: [1, 5] });
});

test('describes schedules like Jira', () => {
  expect(describeSchedule({ frequency: 'daily', hour: 9, minute: 0 }, t)).toBe('Ежедневно в 09:00');
  expect(describeSchedule({ frequency: 'weekly', hour: 8, minute: 5, daysOfWeek: [1, 5] }, t)).toBe('Пн, Пт в 08:05');
  expect(describeSchedule({ frequency: 'monthly', hour: 10, minute: 0, dayOfMonth: 31 }, t)).toBe('31-го числа каждого месяца в 10:00');
  expect(describeSchedule({ frequency: 'hourly', hour: 0, minute: 0, intervalHours: 3 }, t)).toBe('Каждые 3 ч');
});
