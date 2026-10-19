import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from '../i18n/navigation.jsx';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards, character, leaderboard, activity, reports } from '../api.js';
import AssigneeAvatar from '../components/AssigneeAvatar.jsx';
import './ProjectReportsPage.css';

const RANGE_OPTIONS = [7, 14, 30];

export default function ProjectReportsPage() {
  const { boardId } = useParams();
  const { locale } = useLocalization();
  const [board, setBoard] = useState(null);
  const [rangeDays, setRangeDays] = useState(14);
  const [leaders, setLeaders] = useState([]);
  const [kpi, setKpi] = useState([]);
  const [feed, setFeed] = useState([]);
  const [userCharacter, setUserCharacter] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deliveryReports, setDeliveryReports] = useState({});

  const loadUserCharacter = useCallback((userId) => {
    if (!userId || userCharacter[userId] !== undefined) return;
    setUserCharacter((prev) => ({ ...prev, [userId]: null }));
    character.getByUser(userId).then((c) => setUserCharacter((prev) => ({ ...prev, [userId]: c }))).catch(() => {});
  }, [userCharacter]);

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError('');
    try {
      const boardData = await boards.getById(boardId);
      setBoard(boardData);
      const teamId = boardData?.teamId;
      if (!teamId) { setLoading(false); return; }
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - rangeDays);
      const [leaderRes, kpiRes, feedRes] = await Promise.all([
        leaderboard.getTeam(teamId, from.toISOString(), to.toISOString(), 15).catch(() => []),
        leaderboard.getTeamKpi(teamId, from.toISOString(), to.toISOString()).catch(() => []),
        activity.getTeamFeed(teamId, 25).catch(() => []),
      ]);
      const leaderArr = Array.isArray(leaderRes) ? leaderRes : [];
      setLeaders(leaderArr);
      leaderArr.forEach((entry) => loadUserCharacter(entry.userId));
      setKpi((Array.isArray(kpiRes) ? kpiRes : []).map((p) => ({
        date: p.date,
        xp: p.totalXpGained ?? 0,
        quests: p.questsCompleted ?? 0,
      })));
      setFeed(Array.isArray(feedRes) ? feedRes : []);
      const reportTypes = ['burndown', 'velocity', 'cumulativeFlow', 'releaseProgress', 'estimatesVsSpent', 'roadmapDependencies'];
      const reportResults = await Promise.all(reportTypes.map((type) => reports.get(boardId, type, { from: from.toISOString(), to: to.toISOString() }).catch(() => null)));
      setDeliveryReports(Object.fromEntries(reportTypes.map((type, index) => [type, reportResults[index]])));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [boardId, rangeDays]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page">Загрузка отчётов...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;

  return (
    <div className="page reports-page">
      <div className="reports-header">
        <h1>Отчёты{board?.name ? `: ${board.name}` : ''}</h1>
        <div className="reports-range-switch">
          {RANGE_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              className={rangeDays === days ? 'is-active' : ''}
              onClick={() => setRangeDays(days)}
            >
              {days} дн.
            </button>
          ))}
        </div>
      </div>

      <section className="reports-section">
        <h2>Поставка и планирование</h2>
        <div className="reports-kpi-charts">
          {[
            ['burndown', 'Burndown'], ['velocity', 'Velocity'], ['cumulativeFlow', 'Cumulative flow'],
            ['releaseProgress', 'Прогресс релизов'], ['estimatesVsSpent', 'Оценка и затраченное время'], ['roadmapDependencies', 'Зависимости roadmap'],
          ].map(([key, title]) => <div className="reports-kpi-chart" key={key}>
            <h3>{title}</h3>
            {deliveryReports[key]?.length ? <ResponsiveContainer width="100%" height={200}><AreaChart data={deliveryReports[key]}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" /><YAxis /><Tooltip /><Area type="monotone" dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.2} /></AreaChart></ResponsiveContainer> : <p className="reports-empty">Нет данных за выбранный период.</p>}
          </div>)}
        </div>
      </section>

      <section className="reports-section">
        <h2>KPI команды</h2>
        {kpi.length > 0 ? (
          <div className="reports-kpi-charts">
            <div className="reports-kpi-chart">
              <h3>Набранный XP</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={kpi} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString(locale)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} labelStyle={{ color: 'var(--text)' }} />
                  <Area type="monotone" dataKey="xp" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} name="XP" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="reports-kpi-chart">
              <h3>Выполненные задачи</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={kpi} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString(locale)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} labelStyle={{ color: 'var(--text)' }} />
                  <Bar dataKey="quests" fill="var(--accent)" name="Задачи" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="reports-empty">Нет данных за выбранный период.</p>
        )}
      </section>

      <section className="reports-section">
        <h2>Рейтинг (XP за период)</h2>
        {leaders.length > 0 ? (
          <ol className="reports-leaderboard">
            {leaders.map((entry) => (
              <li key={entry.userId}>
                <span className="reports-leaderboard-rank">#{entry.rank}</span>
                <AssigneeAvatar userId={entry.userId} displayName={entry.userName} size={26} />
                <span className="reports-leaderboard-name">{entry.userName}</span>
                {userCharacter[entry.userId] != null && (
                  <span className="chip chip-accent">Ур. {userCharacter[entry.userId].levelNumber}</span>
                )}
                <span className="reports-leaderboard-xp">{entry.totalXpGained} XP</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="reports-empty">Нет данных рейтинга.</p>
        )}
      </section>

      <section className="reports-section">
        <h2>Лента активности</h2>
        {feed.length > 0 ? (
          <ul className="reports-activity-feed">
            {feed.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong>
                {a.description && <span> — {a.description}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="reports-empty">Нет записей активности.</p>
        )}
      </section>
    </div>
  );
}
