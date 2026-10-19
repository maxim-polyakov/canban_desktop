import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { Link } from '../../i18n/navigation.jsx';
import { IssueTypeIcon, PriorityIcon } from '../../components/IssueIcons.jsx';
import { CATEGORY_COLORS, GOAL_COLORS, PALETTE, PRIORITY_COLORS } from './dashboardWidgets.js';

const colorFor = (item, index) => CATEGORY_COLORS[item.category] || GOAL_COLORS[item.category] || PRIORITY_COLORS[item.key] || PALETTE[index % PALETTE.length];

function Empty() {
  const { t } = useLocalization();
  return (
    <div className="dash-widget-empty">
      <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden="true">
        <rect x="4" y="22" width="8" height="14" rx="1.5" fill="var(--chip-bg, #dfe1e6)" />
        <rect x="18" y="12" width="8" height="24" rx="1.5" fill="var(--chip-bg, #dfe1e6)" />
        <rect x="32" y="18" width="8" height="18" rx="1.5" fill="var(--chip-bg, #dfe1e6)" />
        <rect x="46" y="6" width="8" height="30" rx="1.5" fill="var(--chip-bg, #dfe1e6)" />
      </svg>
      <strong>{t('Нет данных')}</strong>
      <span>{t('Попробуйте изменить настройки дашборда или фильтры виджета.')}</span>
    </div>
  );
}

function useWeekFormatter() {
  const { locale } = useLocalization();
  return (value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };
}

const tooltipStyle = { background: 'var(--surface-overlay, #fff)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 };
const axisTick = { fontSize: 11, fill: 'var(--text-subtle)' };

function Categorical({ data, chart }) {
  const { t } = useLocalization();
  const items = data.items.map((item, i) => ({ ...item, label: t(item.label), color: colorFor(item, i) }));
  if (!items.length || !data.total) return <Empty />;
  if (chart === 'bar' || chart === 'hbar') {
    const horizontal = chart === 'hbar';
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={items} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 8 : -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={axisTick} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={axisTick} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={axisTick} interval={0} />
              <YAxis tick={axisTick} allowDecimals={false} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-hover)' }} />
          <Bar dataKey="value" name={t('Значение')} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]} isAnimationActive={false}>
            {items.map((item) => <Cell key={item.key} fill={item.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <div className="dash-donut">
      <div className="dash-donut-chart">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={1} isAnimationActive={false}>
              {items.map((item) => <Cell key={item.key} fill={item.color} stroke="var(--surface)" />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="dash-donut-total"><strong>{data.total}</strong><span>{t('Всего')}</span></div>
      </div>
      <ul className="dash-legend">
        {items.slice(0, 8).map((item) => (
          <li key={item.key}>
            <span className="dash-legend-swatch" style={{ background: item.color }} />
            <span className="dash-legend-label" title={item.label}>{item.label}</span>
            <span className="dash-legend-value">{item.value}</span>
          </li>
        ))}
        {items.length > 8 && <li className="dash-legend-more">{t('и ещё ${count}', { count: items.length - 8 })}</li>}
      </ul>
    </div>
  );
}

function Series({ data, chart, unit }) {
  const { t } = useLocalization();
  const formatWeek = useWeekFormatter();
  const hasValues = data.series.some((s) => s.values.some((v) => v));
  if (!data.series.length || !hasValues) return <Empty />;
  const rows = data.x.map((x, i) => {
    const row = { x: data.axis === 'week' ? formatWeek(x) : t(x) };
    data.series.forEach((s) => { row[s.key] = s.values[i]; });
    return row;
  });
  const series = data.series.map((s, i) => ({ ...s, label: t(s.label), color: colorFor(s, i) }));
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis dataKey="x" tick={axisTick} minTickGap={8} />
      <YAxis tick={axisTick} allowDecimals={unit === 'days'} width={32} />
      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-hover)' }} />
      {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
    </>
  );
  return (
    <ResponsiveContainer width="100%" height={220}>
      {chart === 'line' ? (
        <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          {common}
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />)}
        </LineChart>
      ) : (
        <BarChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          {common}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId={chart === 'stacked' || series.length > 1 ? 'a' : undefined} fill={s.color}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function IssueTable({ data, sample }) {
  const { t } = useLocalization();
  if (!data.rows.length) return <Empty />;
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead><tr><th>{t('Ключ')}</th><th>{t('Название')}</th><th>{t('Статус')}</th><th>{t('Исполнитель')}</th><th aria-label={t('Приоритет')} /></tr></thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id}>
              <td className="dash-table-key">
                <IssueTypeIcon issueType={row.type} size={14} />
                {sample ? <span>{row.key}</span> : <Link to={`/board/${row.boardId}/issue/${row.id}`}>{row.key}</Link>}
              </td>
              <td className="dash-table-title" title={row.title}>{row.title}</td>
              <td><span className={`dash-status is-${row.statusCategory}`}>{row.status}</span></td>
              <td className="dash-table-muted">{row.assigneeName || t('Не назначено')}</td>
              <td><PriorityIcon priority={row.priority} size={14} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.total > data.rows.length && <p className="dash-table-more">{t('Показано ${shown} из ${total}', { shown: data.rows.length, total: data.total })}</p>}
    </div>
  );
}

function GoalsList({ data, sample }) {
  const { t, locale } = useLocalization();
  if (!data.rows.length) return <Empty />;
  return (
    <ul className="dash-goals">
      {data.rows.map((g) => (
        <li key={g.id}>
          <span className="dash-goal-dot" style={{ background: GOAL_COLORS[g.status] || PALETTE[0] }} />
          {sample ? <span className="dash-goal-name">{g.name}</span> : <Link className="dash-goal-name" to={`/goals/${g.id}`}>{g.name}</Link>}
          <span className="dash-goal-status">{t(g.statusLabel)}</span>
          <span className="dash-table-muted">{g.targetDate ? new Date(g.targetDate).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardWidgetBody({ widget, data, sample = false }) {
  const { t } = useLocalization();
  if (!data) return <div className="dash-widget-loading" aria-label={t('Загрузка...')} />;
  const chart = widget.config?.chart;
  switch (data.kind) {
    case 'categorical': return <Categorical data={data} chart={chart || 'donut'} />;
    case 'series': return <Series data={data} chart={chart || 'bar'} unit={widget.type === 'cycle_time' ? 'days' : undefined} />;
    case 'table': return <IssueTable data={data} sample={sample} />;
    case 'goals': return <GoalsList data={data} sample={sample} />;
    case 'error': return <p className="dash-widget-error">{data.message}</p>;
    default: return <Empty />;
  }
}
