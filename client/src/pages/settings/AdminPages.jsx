import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { adminInfo, integrations, spaces as spacesApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import SpaceAvatar from '../../components/SpaceAvatar.jsx';
import UsersPage from '../UsersPage.jsx';
import SettingsShell, { ADMIN_NAV, SettingsSection } from './SettingsShell.jsx';

function useSystemInfo() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    adminInfo.system().then(setInfo).catch((e) => setError(e.message || 'error'));
  }, []);
  return { info, error };
}

function StatusLozenge({ ok, okLabel = 'Настроено', offLabel = 'Не настроено' }) {
  const { t } = useLocalization();
  return <span className={`settings-lozenge ${ok ? 'is-success' : ''}`}>{t(ok ? okLabel : offLabel)}</span>;
}

export function AdminOverviewPage() {
  const { t } = useLocalization();
  const { info, error } = useSystemInfo();
  const cards = [
    ['users', 'Пользователи', '/admin/users', 'teams'],
    ['teams', 'Команды', '/teams', 'teams'],
    ['spaces', 'Разделы', '/spaces', 'spaces'],
    ['issues', 'Задачи', '/issues', 'issues'],
  ];
  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан']]} title={t('Обзор')} description={t('Сводка по вашему сайту Канбан: пользователи, разделы, задачи и состояние подключённых сервисов.')}>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <div className="settings-cards">
        {cards.map(([field, label, to, icon]) => (
          <Link key={field} to={to} className="settings-card">
            <div className="settings-card-label"><NavIcon name={icon} size={14} /> {t(label)}</div>
            <div className="settings-card-value">{info ? info[field] : '…'}</div>
          </Link>
        ))}
      </div>
      <SettingsSection title={t('Сервисы')}>
        <dl className="settings-dl">
          <dt>{t('Электронная почта')}</dt><dd><StatusLozenge ok={info?.mailConfigured} /></dd>
          <dt>GitHub App</dt><dd><StatusLozenge ok={info?.githubAppConfigured} /></dd>
          <dt>{t('Вход через Google')}</dt><dd><StatusLozenge ok={info?.googleSignIn} okLabel="Включён" offLabel="Выключен" /></dd>
          <dt>{t('Хранилище вложений')}</dt><dd>{info ? (info.attachmentsStorage === 's3' ? 'S3' : t('Локальное')) : '…'}</dd>
        </dl>
      </SettingsSection>
      <SettingsSection title={t('Тарифный план')}>
        <div className="settings-row">
          <span className="settings-row-text">
            <span className="settings-row-title">{t('Канбан')} · {t('Бесплатно')}</span>
            <span className="settings-row-desc">{t('Все функции доступны без ограничений по числу пользователей.')}</span>
          </span>
          <Link to="/admin/billing" className="app-btn">{t('Предварительный просмотр счёта')}</Link>
        </div>
      </SettingsSection>
    </SettingsShell>
  );
}

export function AdminSystemPage() {
  const { t, languages, language } = useLocalization();
  const { info, error } = useSystemInfo();
  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Система'], ['Системные настройки']]} title={t('Системные настройки')} description={t('Общая конфигурация сайта. Значения задаются переменными окружения сервера при развёртывании.')}>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <SettingsSection title={t('Настройки')}>
        <dl className="settings-dl">
          <dt>{t('Название')}</dt><dd>{info?.name ?? '…'}</dd>
          <dt>{t('Базовый URL')}</dt><dd>{window.location.origin}</dd>
          <dt>{t('Окружение')}</dt><dd>{info?.environment ?? '…'}</dd>
          <dt>{t('Версия')}</dt><dd>{info?.version ?? '…'}</dd>
        </dl>
      </SettingsSection>
      <SettingsSection title={t('Электронная почта')} description={t('Адрес, от имени которого отправляются уведомления о задачах.')}>
        <dl className="settings-dl">
          <dt>{t('Состояние')}</dt><dd><StatusLozenge ok={info?.mailConfigured} /></dd>
          <dt>{t('Имя отправителя')}</dt><dd>{info?.mailFromName ?? '…'}</dd>
          <dt>{t('Адрес отправителя')}</dt><dd>{info?.mailFromAddress || '—'}</dd>
        </dl>
      </SettingsSection>
      <SettingsSection title={t('Безопасность и вход')}>
        <dl className="settings-dl">
          <dt>{t('Вход по паролю')}</dt><dd><StatusLozenge ok okLabel="Включён" /></dd>
          <dt>{t('Вход через Google')}</dt><dd><StatusLozenge ok={info?.googleSignIn} okLabel="Включён" offLabel="Выключен" /></dd>
          <dt>{t('Хранилище вложений')}</dt><dd>{info ? (info.attachmentsStorage === 's3' ? 'S3' : t('Локальное')) : '…'}</dd>
        </dl>
      </SettingsSection>
      <SettingsSection title={t('Установленные языки')} description={t('Пользователи выбирают язык в персональных настройках.')}>
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead><tr><th>{t('Язык')}</th><th className="is-narrow">{t('Код')}</th><th className="is-narrow" /></tr></thead>
            <tbody>
              {languages.map(({ code, label }) => (
                <tr key={code}>
                  <td>{label}</td>
                  <td className="is-narrow">{code}</td>
                  <td className="is-narrow">{code === language && <span className="settings-lozenge is-info">{t('Текущий')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>
    </SettingsShell>
  );
}

export function AdminAppsPage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [connectSpace, setConnectSpace] = useState('');
  const [spaceList, setSpaceList] = useState([]);
  const [appConfigured, setAppConfigured] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await spacesApi.getMine();
      setSpaceList(list);
      setConnectSpace((current) => current || list[0]?.id || '');
      const results = await Promise.all(list.map((space) => integrations.getByBoard(space.id)
        .then((data) => ({ space, data }))
        .catch(() => ({ space, data: { github: [], webhooks: [] } }))));
      setAppConfigured(results.some((r) => r.data?.githubAppConfigured));
      setRows(results.flatMap(({ space, data }) => [
        ...(data.github || []).map((g) => ({ kind: 'github', id: g.id, space, title: `${g.repositoryOwner}/${g.repositoryName}`, enabled: g.enabled, detail: `Installation ${g.installationId}` })),
        ...(data.webhooks || []).map((w) => ({ kind: 'webhook', id: w.id, space, title: w.url, enabled: w.enabled, detail: w.events })),
      ]));
    } catch (e) {
      setError(e.message || t('Не удалось загрузить приложения'));
      setRows([]);
    }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const disconnect = async (row) => {
    if (!window.confirm(`${t('Отключить')} ${row.title} ${t('от раздела')} «${row.space.name}»?`)) return;
    setBusy(row.id);
    try {
      if (row.kind === 'github') await integrations.deleteGithub(row.space.id, row.id);
      else await integrations.deleteWebhook(row.space.id, row.id);
      setRows((list) => list.filter((x) => x.id !== row.id));
    } catch (e) {
      setError(e.message || t('Не удалось отключить приложение'));
    } finally {
      setBusy(null);
    }
  };

  const github = (rows || []).filter((r) => r.kind === 'github');
  const webhooks = (rows || []).filter((r) => r.kind === 'webhook');

  const table = (list, empty) => (
    <div className="settings-table-wrap">
      <table className="settings-table">
        <thead>
          <tr>
            <th>{t('Подключение')}</th>
            <th>{t('Раздел')}</th>
            <th className="hide-mobile">{t('Сведения')}</th>
            <th className="is-narrow">{t('Статус')}</th>
            <th className="is-narrow" aria-label={t('Действия')} />
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.id}>
              <td style={{ wordBreak: 'break-all' }}>{row.title}</td>
              <td><Link to={`/board/${row.space.id}`} className="settings-table-name"><SpaceAvatar id={row.space.id} name={row.space.name} size={20} />{row.space.name}</Link></td>
              <td className="hide-mobile">{row.detail}</td>
              <td className="is-narrow"><span className={`settings-lozenge ${row.enabled ? 'is-success' : ''}`}>{t(row.enabled ? 'Включено' : 'Выключено')}</span></td>
              <td className="is-narrow">
                <div className="settings-actions">
                  <Link to={`/board/${row.space.id}/integrations`} className="app-btn">{t('Настроить')}</Link>
                  <button type="button" className="app-btn" disabled={busy === row.id} onClick={() => disconnect(row)}>{busy === row.id ? '…' : t('Отключить')}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows && list.length === 0 && <p className="settings-empty">{t(empty)}</p>}
      {!rows && <p className="settings-empty">{t('Загрузка...')}</p>}
    </div>
  );

  return (
    <SettingsShell
      nav={ADMIN_NAV}
      wide
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Приложения'], ['Подключённые приложения']]}
      title={t('Подключённые приложения')}
      description={t('Приложения и вебхуки, подключённые к разделам, где вы участник. Управлять подключением можно в настройках интеграций раздела.')}
      actions={spaceList.length > 0 && (
        <>
          <select className="app-select" value={connectSpace} onChange={(e) => setConnectSpace(e.target.value)} aria-label={t('Раздел')}>
            {spaceList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="app-btn app-btn-primary" disabled={!connectSpace} onClick={() => navigate(`/board/${connectSpace}/integrations`)}>{t('Подключить приложение')}</button>
        </>
      )}
    >
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <SettingsSection
        title={<span className="settings-table-name"><NavIcon name="integrations" size={18} />GitHub {appConfigured ? <span className="settings-lozenge is-success">GitHub App</span> : <span className="settings-lozenge">{t('Не настроено')}</span>}</span>}
        description={t('Связывает ветки, коммиты, pull request и сборки GitHub Actions с задачами по ключу (например KAN-12).')}
      >
        {table(github, 'Репозитории GitHub не подключены.')}
      </SettingsSection>
      <SettingsSection title={<span className="settings-table-name"><NavIcon name="automation" size={18} />{t('Вебхуки')}</span>} description={t('Отправляют подписанные HTTP-запросы при событиях задач.')}>
        {table(webhooks, 'Вебхуки не настроены.')}
      </SettingsSection>
    </SettingsShell>
  );
}

export function AdminBillingPage() {
  const { t, formatDate } = useLocalization();
  const { info } = useSystemInfo();
  const now = new Date();
  const nextBill = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lines = [
    ['Канбан', 'Бесплатно', info?.users],
    ['Автоматизация', 'Включено в план', null],
    ['Интеграция с GitHub', 'Включено в план', null],
  ];
  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Платежи'], ['Предварительный просмотр счёта']]} title={t('Предварительный просмотр счёта')} description={t('Оценка следующего счёта по текущим подпискам и числу пользователей.')}>
      <div className="settings-cards">
        <div className="settings-card">
          <div className="settings-card-label">{t('Следующий счёт')}</div>
          <div className="settings-card-value">0 ₽</div>
          <div className="settings-card-sub">{formatDate(nextBill, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="settings-card">
          <div className="settings-card-label">{t('Пользователи')}</div>
          <div className="settings-card-value">{info?.users ?? '…'}</div>
          <div className="settings-card-sub">{t('Без ограничений')}</div>
        </div>
        <div className="settings-card">
          <div className="settings-card-label">{t('Тарифный план')}</div>
          <div className="settings-card-value">{t('Бесплатно')}</div>
          <div className="settings-card-sub">{t('Ежемесячно')}</div>
        </div>
      </div>
      <SettingsSection title={t('Сведения о счёте')}>
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead><tr><th>{t('Продукт')}</th><th>{t('План')}</th><th className="is-narrow">{t('Пользователи')}</th><th className="is-narrow">{t('Сумма')}</th></tr></thead>
            <tbody>
              {lines.map(([product, plan, users]) => (
                <tr key={product}>
                  <td>{t(product)}</td>
                  <td>{t(plan)}</td>
                  <td className="is-narrow">{users ?? '—'}</td>
                  <td className="is-narrow">0 ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="billing-total"><span>{t('Итого')}</span><strong>0 ₽</strong></div>
      </SettingsSection>
    </SettingsShell>
  );
}

export function AdminUsersPage() {
  const { t } = useLocalization();
  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Пользователи']]} title={t('Пользователи')} actions={<Link to="/teams" className="app-btn app-btn-primary">{t('Пригласить в команду')}</Link>}>
      <UsersPage embedded />
    </SettingsShell>
  );
}
