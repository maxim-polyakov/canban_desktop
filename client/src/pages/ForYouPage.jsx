import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { myWork, teams as teamsApi } from '../api.js';
import { IssueTypeIcon, getIssueTypeMeta } from '../components/IssueIcons.jsx';
import SpaceAvatar from '../components/SpaceAvatar.jsx';
import NavIcon from '../components/NavIcons.jsx';
import { toggleStarredBoard, useNavHistory } from '../utils/navHistory.js';
import { groupByDay, timeAgo } from '../utils/timeAgo.js';
import './ForYouPage.css';

const TABS = [
  ['recommended', 'Рекомендации'],
  ['assigned', 'Назначенные мне'],
  ['starred', 'Отмеченные'],
  ['worked', 'Бывшие в работе'],
  ['viewed', 'Просмотренные'],
];

function normalizeTeams(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const team = item.team ?? item.Team ?? {};
    return {
      team: { id: team.id ?? team.Id, name: team.name ?? team.Name ?? '' },
      boards: (item.boards ?? item.Boards ?? []).map((b) => ({ id: b.id ?? b.Id, name: b.name ?? b.Name ?? '', description: b.description ?? b.Description ?? '', avatarUrl: b.avatarUrl ?? b.AvatarUrl ?? null })),
    };
  });
}

function IssueRow({ issue, language, t }) {
  return (
    <Link to={`/board/${issue.boardId}/issue/${issue.questId}`} className="foryou-row">
      <IssueTypeIcon issueType={issue.issueType} size={16} />
      <span className="foryou-row-main">
        <span className={`foryou-row-title ${issue.done ? 'is-done' : ''}`}>{issue.title}</span>
        <span className="foryou-row-meta">
          {[t(getIssueTypeMeta(issue.issueType).label), issue.issueKey, issue.boardName].filter(Boolean).join(' • ')}
        </span>
      </span>
      <span className="foryou-row-status">{issue.status}</span>
      <span className="foryou-row-time">{timeAgo(issue.activityAt, language)}</span>
    </Link>
  );
}

export default function ForYouPage() {
  const { t, language } = useLocalization();
  const location = useLocation();
  const navigate = useNavigate();
  const { recentBoards, starredBoards, viewedIssues } = useNavHistory();
  const initialTab = new URLSearchParams(location.search).get('tab');
  const [tab, setTab] = useState(TABS.some(([key]) => key === initialTab) ? initialTab : 'worked');
  const [teams, setTeams] = useState([]);
  const [lists, setLists] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    teamsApi.getMyTeamsWithBoards().then((list) => setTeams(normalizeTeams(list))).catch(() => setTeams([]));
  }, []);

  const viewedKey = viewedIssues.map((x) => x.id).join(',');
  useEffect(() => {
    const kinds = [...new Set(['assigned', ...(tab === 'recommended' ? ['worked'] : tab === 'starred' ? [] : [tab])])];
    kinds.forEach((kind) => {
      if (kind === 'viewed' && !viewedKey) { setLists((s) => ({ ...s, viewed: [] })); return; }
      setLoading((s) => ({ ...s, [kind]: true }));
      myWork.get(kind, kind === 'viewed' ? viewedKey.split(',') : undefined)
        .then((items) => setLists((s) => ({ ...s, [kind]: Array.isArray(items) ? items : [] })))
        .catch((e) => setError(e.message || t('Не удалось загрузить задачи.')))
        .finally(() => setLoading((s) => ({ ...s, [kind]: false })));
    });
  }, [tab, viewedKey, t]);

  const allBoards = useMemo(() => teams.flatMap(({ team, boards }) => boards.map((b) => ({ ...b, teamName: team.name }))), [teams]);
  const recommendedSpaces = useMemo(() => {
    const byId = new Map(allBoards.map((b) => [b.id, b]));
    const ordered = [...recentBoards.map((b) => byId.get(b.id)).filter(Boolean), ...allBoards];
    return [...new Map(ordered.map((b) => [b.id, b])).values()].slice(0, 4);
  }, [allBoards, recentBoards]);

  const starredIds = new Set(starredBoards.map((b) => b.id));
  const viewedAt = new Map(viewedIssues.map((x) => [x.id, x.at]));
  const items = (() => {
    if (tab === 'recommended') {
      const merged = [...(lists.assigned || []), ...(lists.worked || [])].filter((x) => !x.done);
      return [...new Map(merged.map((x) => [x.questId, x])).values()]
        .sort((a, b) => new Date(b.activityAt) - new Date(a.activityAt)).slice(0, 20);
    }
    if (tab === 'viewed') {
      return (lists.viewed || []).map((x) => ({ ...x, activityAt: viewedAt.get(x.questId) ?? x.activityAt }))
        .sort((a, b) => new Date(b.activityAt) - new Date(a.activityAt));
    }
    return lists[tab] || [];
  })();
  const isLoading = tab === 'recommended' ? loading.assigned || loading.worked : loading[tab];
  const groups = groupByDay(items, (x) => x.activityAt);
  const assignedCount = lists.assigned?.length;

  const selectTab = (key) => {
    setTab(key);
    navigate(key === 'worked' ? '/for-you' : `/for-you?tab=${key}`, { replace: true });
  };

  return (
    <div className="page foryou-page">
      <section className="foryou-section">
        <div className="foryou-section-header">
          <h2>{t('Рекомендуемые разделы')}</h2>
          <Link to="/spaces" className="foryou-link">{t('Смотреть все разделы')}</Link>
        </div>
        <div className="foryou-spaces">
          {recommendedSpaces.map((space) => (
            <Link key={space.id} to={`/board/${space.id}`} className="foryou-space-card">
              <SpaceAvatar id={space.id} name={space.name} avatarUrl={space.avatarUrl} size={32} />
              <span className="foryou-space-name">{space.name}</span>
              <span className="foryou-space-sub">{space.description || space.teamName}</span>
            </Link>
          ))}
          {recommendedSpaces.length === 0 && (
            <Link to="/spaces?create=1" className="foryou-space-card foryou-space-create">
              <span className="foryou-space-plus"><NavIcon name="plus" /></span>
              <span className="foryou-space-name">{t('Создать раздел')}</span>
              <span className="foryou-space-sub">{t('Команда и доска для задач')}</span>
            </Link>
          )}
        </div>
      </section>

      <section className="foryou-section">
        <div className="foryou-section-header">
          <h2>{t('Для вас')}</h2>
          <div className="foryou-tabs" role="tablist">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={`foryou-tab ${tab === key ? 'is-active' : ''}`} onClick={() => selectTab(key)}>
                {t(label)}
                {key === 'assigned' && assignedCount != null && <span className="foryou-tab-count">{assignedCount}</span>}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="foryou-error" role="alert">{error}</p>}
        {tab === 'starred' ? (
          starredBoards.length === 0 ? (
            <p className="foryou-empty">{t('Отмечайте разделы звёздочкой, чтобы быстро находить их здесь.')}</p>
          ) : (
            <div className="foryou-list">
              {starredBoards.map((b) => (
                <div key={b.id} className="foryou-row">
                  <SpaceAvatar id={b.id} name={b.name} avatarUrl={b.avatarUrl} size={20} />
                  <Link to={`/board/${b.id}`} className="foryou-row-main">
                    <span className="foryou-row-title">{b.name}</span>
                    <span className="foryou-row-meta">{[t('Раздел'), b.teamName].filter(Boolean).join(' • ')}</span>
                  </Link>
                  <button type="button" className="foryou-star is-starred" aria-label={t('Убрать из отмеченных')} onClick={() => toggleStarredBoard(b)}>
                    <NavIcon name="star" filled={starredIds.has(b.id)} />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : isLoading && items.length === 0 ? (
          <p className="foryou-empty">{t('Загрузка...')}</p>
        ) : groups.length === 0 ? (
          <p className="foryou-empty">
            {t(tab === 'assigned' ? 'Нет открытых задач, назначенных вам.' : tab === 'viewed' ? 'Вы ещё не открывали задачи.' : 'Здесь появятся задачи, с которыми вы работали за последние 90 дней.')}
          </p>
        ) : groups.map((group) => (
          <div key={group.label} className="foryou-group">
            <h3>{t(group.label)}</h3>
            <div className="foryou-list">
              {group.items.map((issue) => <IssueRow key={issue.questId} issue={issue} language={language} t={t} />)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
