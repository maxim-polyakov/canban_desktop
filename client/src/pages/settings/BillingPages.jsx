import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { billing as billingApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { formatBytes, formatMoney, loadBilling, notifyBillingChanged, PLAN_ORDER, planIncludes, useBilling } from '../../utils/billing.js';
import SettingsShell, { ADMIN_NAV, SettingsSection } from './SettingsShell.jsx';

const CYCLES = [['monthly', 'Ежемесячно'], ['annual', 'Ежегодно']];

function UsageBar({ label, used, limit, format = (v) => v }) {
  const { t } = useLocalization();
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit != null && used > limit;
  return (
    <div className="billing-usage">
      <div className="billing-usage-head">
        <span>{t(label)}</span>
        <span className={over ? 'billing-over' : ''}>{format(used)} / {limit == null ? t('Без ограничений') : format(limit)}</span>
      </div>
      {limit != null && <div className="billing-usage-bar"><span className={over ? 'is-over' : pct >= 80 ? 'is-near' : ''} style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

const planPrice = (plan, t, locale) => {
  if (plan.pricePerUser == null) return t('По запросу');
  if (!plan.pricePerUser) return t('Бесплатно');
  return `${formatMoney(plan.pricePerUser, locale)} ${t('за пользователя в месяц')}`;
};

const GB = 1024 * 1024 * 1024;

export function AdminBillingPage() {
  const { t, locale, formatDate } = useLocalization();
  const location = useLocation();
  const data = useBilling();
  const changed = new URLSearchParams(location.search).get('changed') === '1';
  useEffect(() => { loadBilling(true).then((d) => d && notifyBillingChanged(d)); }, []);

  if (!data) {
    return <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Платежи']]} title={t('Тариф и счёт')}><p className="settings-empty">{t('Загрузка...')}</p></SettingsShell>;
  }
  const plan = data.plans?.plans?.find((p) => p.id === data.plan);
  const cycleLabel = CYCLES.find(([id]) => id === data.cycle)?.[1];
  return (
    <SettingsShell
      nav={ADMIN_NAV}
      wide
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Платежи'], ['Тариф и счёт']]}
      title={t('Тариф и счёт')}
      description={t('Тариф действует для всех команд, которыми вы владеете, и всех их участников.')}
      actions={!data.hideUpsell && <Link to="/admin/billing/plans" className="app-btn app-btn-primary">{t('Сменить план')}</Link>}
    >
      {changed && <p className="settings-save-status is-ok" role="status"><NavIcon name="check" size={14} />{t('Тариф изменён')}</p>}
      {data.overLimit.length > 0 && (
        <div className="billing-alert" role="alert">
          <strong>{t('Использование превышает лимиты плана')}</strong>
          <ul>{data.overLimit.map((x) => <li key={x}>{x}</li>)}</ul>
          {!data.hideUpsell && <Link to="/admin/billing/plans" className="app-btn">{t('Выбрать подходящий план')}</Link>}
        </div>
      )}
      <div className="settings-cards">
        <div className="settings-card">
          <div className="settings-card-label">{t('Тарифный план')}</div>
          <div className="settings-card-value">{data.planName}</div>
          <div className="settings-card-sub">{data.complimentary ? t('Предоставлен бесплатно') : t(cycleLabel)}</div>
        </div>
        <div className="settings-card">
          <div className="settings-card-label">{t('Следующий счёт')}</div>
          <div className="settings-card-value">{formatMoney(data.amount, locale)}</div>
          <div className="settings-card-sub">{data.nextInvoiceAt ? formatDate(data.nextInvoiceAt, { day: 'numeric', month: 'long', year: 'numeric' }) : t('Счёт не выставляется')}</div>
        </div>
        <div className="settings-card">
          <div className="settings-card-label">{t('Пользователи')}</div>
          <div className="settings-card-value">{data.usage.users}</div>
          <div className="settings-card-sub">{data.limits.maxUsers == null ? t('Без ограничений') : `${t('до')} ${data.limits.maxUsers}`}</div>
        </div>
      </div>

      <SettingsSection title={t('Использование')} description={t('Считается по командам, которыми вы владеете.')}>
        <UsageBar label="Пользователи" used={data.usage.users} limit={data.limits.maxUsers} />
        <UsageBar label="Хранилище вложений" used={data.usage.storageBytes} limit={data.limits.storageGb == null ? null : data.limits.storageGb * GB} format={formatBytes} />
        <UsageBar label="Правила автоматизации" used={data.usage.automationRules} limit={data.limits.automationRules} />
        <p className="settings-row-desc">{t('Команды')}: {data.usage.teams} · {t('Разделы')}: {data.usage.spaces}</p>
      </SettingsSection>

      <SettingsSection title={t('Сведения о счёте')}>
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead><tr><th>{t('Продукт')}</th><th>{t('План')}</th><th className="is-narrow">{t('Пользователи')}</th><th className="is-narrow">{t('Сумма')}</th></tr></thead>
            <tbody>
              <tr>
                <td>{t('Канбан')}</td>
                <td>{data.planName}{plan && plan.pricePerUser > 0 && !data.complimentary ? ` · ${formatMoney(plan.pricePerUser, locale)} × ${data.usage.users}${data.cycle === 'annual' ? ` × ${data.plans.annualMonths}` : ''}` : ''}</td>
                <td className="is-narrow">{data.usage.users}</td>
                <td className="is-narrow">{formatMoney(data.amount, locale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="billing-total"><span>{t('Итого')}</span><strong>{formatMoney(data.amount, locale)}</strong></div>
      </SettingsSection>

      {data.history.length > 0 && (
        <SettingsSection title={t('История изменений')}>
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead><tr><th>{t('Дата')}</th><th>{t('Изменение')}</th><th className="is-narrow">{t('Пользователи')}</th><th className="is-narrow">{t('Сумма счёта')}</th></tr></thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>{h.fromPlan} → {h.toPlan} · {t(CYCLES.find(([id]) => id === h.cycle)?.[1] || '')}</td>
                    <td className="is-narrow">{h.users}</td>
                    <td className="is-narrow">{formatMoney(h.amount, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      )}
    </SettingsShell>
  );
}

export function AdminBillingPlansPage() {
  const { t, locale } = useLocalization();
  const navigate = useNavigate();
  const data = useBilling();
  const [cycle, setCycle] = useState(null);
  const activeCycle = cycle || data?.cycle || 'monthly';
  const groups = useMemo(() => {
    const result = [];
    (data?.plans?.features || []).forEach((f) => {
      const last = result[result.length - 1];
      if (last && last.group === f.group) last.items.push(f); else result.push({ group: f.group, items: [f] });
    });
    return result;
  }, [data]);

  if (data?.hideUpsell) return <Navigate to="/admin/billing" replace />;
  if (!data?.plans) {
    return <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Платежи']]} title={t('Тарифные планы')}><p className="settings-empty">{t('Загрузка...')}</p></SettingsShell>;
  }
  const plans = data.plans.plans;
  const isCurrent = (p) => p.id === data.plan && activeCycle === data.cycle;

  return (
    <SettingsShell
      nav={ADMIN_NAV}
      wide
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Платежи', '/admin/billing'], ['Тарифные планы']]}
      title={t('Тарифные планы')}
      description={t('Сравните планы и выберите подходящий. Стоимость считается по числу пользователей в ваших командах.')}
    >
      <div className="billing-cycle" role="radiogroup" aria-label={t('Период оплаты')}>
        {CYCLES.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={activeCycle === id} className={activeCycle === id ? 'is-active' : ''} onClick={() => setCycle(id)}>
            {t(label)}{id === 'annual' && <span className="billing-save">{t('2 месяца бесплатно')}</span>}
          </button>
        ))}
      </div>
      <div className="billing-plans">
        {plans.map((p) => {
          const monthly = (p.pricePerUser || 0) * Math.max(1, data.usage.users);
          return (
            <div key={p.id} className={`billing-plan ${p.id === data.plan ? 'is-current' : ''} ${p.id === 'premium' ? 'is-featured' : ''}`}>
              {p.id === 'premium' && <span className="billing-plan-flag">{t('Рекомендуем')}</span>}
              <h2>{p.name}</h2>
              <p className="billing-plan-tagline">{t(p.tagline)}</p>
              <div className="billing-plan-price">{planPrice(p, t, locale)}</div>
              {p.pricePerUser > 0 && (
                <div className="billing-plan-estimate">
                  ≈ {formatMoney(activeCycle === 'annual' ? monthly * data.plans.annualMonths : monthly, locale)} {t(activeCycle === 'annual' ? 'в год' : 'в месяц')} · {data.usage.users} {t('польз.')}
                </div>
              )}
              <ul className="billing-plan-limits">
                <li>{p.maxUsers == null ? t('Без ограничений по пользователям') : `${t('До')} ${p.maxUsers.toLocaleString(locale)} ${t('пользователей')}`}</li>
                <li>{p.storageGb == null ? t('Хранилище без ограничений') : `${p.storageGb} ${t('ГБ хранилища')}`}</li>
                <li>{p.automationRules == null ? t('Автоматизация без ограничений') : `${p.automationRules} ${t('правил автоматизации')}`}</li>
              </ul>
              {isCurrent(p) ? (
                <span className="app-btn billing-plan-cta is-current" aria-disabled="true">{t('Текущий план')}</span>
              ) : p.selfServe ? (
                <button type="button" className={`app-btn billing-plan-cta ${PLAN_ORDER.indexOf(p.id) > PLAN_ORDER.indexOf(data.plan) ? 'app-btn-primary' : ''}`} onClick={() => navigate(`/admin/billing/change?plan=${p.id}&cycle=${activeCycle}`)}>
                  {t(p.id === data.plan ? 'Сменить период оплаты' : PLAN_ORDER.indexOf(p.id) > PLAN_ORDER.indexOf(data.plan) ? 'Перейти на план' : 'Понизить план')}
                </button>
              ) : (
                <a className="app-btn billing-plan-cta" href="mailto:sales@baxic.ru?subject=Canban%20Enterprise">{t('Связаться с отделом продаж')}</a>
              )}
            </div>
          );
        })}
      </div>

      <SettingsSection title={t('Сравнение возможностей')}>
        <div className="settings-table-wrap">
          <table className="settings-table billing-matrix">
            <thead><tr><th>{t('Возможность')}</th>{plans.map((p) => <th key={p.id} className="is-narrow">{p.name}</th>)}</tr></thead>
            <tbody>
              {groups.map(({ group, items }) => (
                <React.Fragment key={group}>
                  <tr className="billing-matrix-group"><td colSpan={plans.length + 1}>{t(group)}</td></tr>
                  {items.map((f) => (
                    <tr key={f.label}>
                      <td>{t(f.label)}</td>
                      {plans.map((p) => (
                        <td key={p.id} className="is-narrow billing-matrix-cell">
                          {planIncludes(p.id, f.minPlan) ? <NavIcon name="check" size={14} /> : <span className="billing-dash" aria-label={t('Нет')}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>
    </SettingsShell>
  );
}

export function AdminBillingChangePage() {
  const { t, locale, formatDate } = useLocalization();
  const location = useLocation();
  const navigate = useNavigate();
  const billing = useBilling();
  const params = new URLSearchParams(location.search);
  const plan = params.get('plan') || 'standard';
  const cycle = params.get('cycle') || 'monthly';
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (billing?.hideUpsell) return;
    setQuote(null);
    setError('');
    billingApi.quote(plan, cycle).then(setQuote).catch((e) => setError(e.message));
  }, [plan, cycle, billing]);

  if (billing?.hideUpsell) return <Navigate to="/admin/billing" replace />;

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await billingApi.change(plan, cycle);
      if (data?.confirmationUrl) {
        window.location.assign(data.confirmationUrl);
        return;
      }
      notifyBillingChanged(data);
      navigate('/admin/billing?changed=1');
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const blocked = quote?.blockers?.length > 0;
  return (
    <SettingsShell
      nav={ADMIN_NAV}
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Платежи', '/admin/billing'], ['Тарифные планы', '/admin/billing/plans'], ['Смена плана']]}
      title={quote ? `${t('Переход на')} ${quote.planName}` : t('Смена плана')}
    >
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {!quote && !error && <p className="settings-empty">{t('Загрузка...')}</p>}
      {quote && (
        <>
          <SettingsSection title={t('Проверьте изменения')}>
            <dl className="settings-dl">
              <dt>{t('Текущий план')}</dt><dd>{quote.currentPlan} · {t(CYCLES.find(([id]) => id === quote.currentCycle)?.[1] || '')}</dd>
              <dt>{t('Новый план')}</dt><dd><strong>{quote.planName}</strong> · {t(CYCLES.find(([id]) => id === quote.cycle)?.[1] || '')}</dd>
              <dt>{t('Пользователи')}</dt><dd>{quote.users}</dd>
              <dt>{t('Цена')}</dt><dd>{quote.pricePerUser ? `${formatMoney(quote.pricePerUser, locale)} ${t('за пользователя в месяц')}` : t('Бесплатно')}</dd>
              <dt>{t('Сумма счёта')}</dt><dd><strong>{formatMoney(quote.amount, locale)}</strong> {quote.amount > 0 && t(quote.cycle === 'annual' ? 'в год' : 'в месяц')}</dd>
              {quote.nextInvoiceAt && <><dt>{t('Первый счёт')}</dt><dd>{formatDate(quote.nextInvoiceAt, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></>}
            </dl>
          </SettingsSection>
          {blocked && (
            <div className="billing-alert" role="alert">
              <strong>{t('Этот план не подходит под текущее использование')}</strong>
              <ul>{quote.blockers.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {!quote.isChange && <p className="settings-row-desc">{t('Это ваш текущий план.')}</p>}
          {quote.direction < 0 && !blocked && <p className="settings-row-desc">{t('При понижении плана возможности старшего плана перестанут быть доступны вашим командам.')}</p>}
          {quote.amount > 0 && (
            <label className="billing-agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              {t('Я согласен с условиями подписки и публичной офертой. После подтверждения откроется защищённая страница оплаты ЮKassa.')}
            </label>
          )}
          <div className="settings-actions billing-change-actions">
            <Link to="/admin/billing/plans" className="app-btn app-btn-subtle">{t('Назад')}</Link>
            <button type="button" className="app-btn app-btn-primary" disabled={saving || blocked || !quote.isChange || (quote.amount > 0 && !agreed)} onClick={confirm}>
              {saving ? '…' : t('Подтвердить')}
            </button>
          </div>
        </>
      )}
    </SettingsShell>
  );
}

export function AdminBillingPaymentPage() {
  const { t, locale } = useLocalization();
  const location = useLocation();
  const navigate = useNavigate();
  const paymentId = new URLSearchParams(location.search).get('id');
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!paymentId) { setError(t('Платёж не найден.')); return undefined; }
    let alive = true;
    let timer;
    const check = async () => {
      try {
        const result = await billingApi.payment(paymentId);
        if (!alive) return;
        setPayment(result);
        if (result.status === 'succeeded') {
          const data = await loadBilling(true);
          if (data) notifyBillingChanged(data);
          navigate('/admin/billing?changed=1', { replace: true });
          return;
        }
        if (result.status === 'pending') timer = window.setTimeout(check, 2500);
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    check();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [navigate, paymentId, t]);

  return (
    <SettingsShell
      nav={ADMIN_NAV}
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Платежи', '/admin/billing'], ['Статус платежа']]}
      title={t('Статус платежа')}
    >
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {!error && !payment && <p className="settings-empty">{t('Проверяем платёж…')}</p>}
      {payment?.status === 'pending' && (
        <div className="settings-card">
          <h2>{t('Ожидаем подтверждения оплаты')}</h2>
          <p>{t('Не закрывайте страницу. Обычно подтверждение занимает несколько секунд.')}</p>
          <strong>{formatMoney(payment.amount, locale)}</strong>
          {payment.confirmationUrl && (
            <p><a className="app-btn app-btn-primary" href={payment.confirmationUrl}>{t('Вернуться к оплате')}</a></p>
          )}
        </div>
      )}
      {payment?.status === 'canceled' && (
        <div className="billing-alert" role="alert">
          <strong>{t('Платёж не прошёл')}</strong>
          <p>{payment.error || t('Попробуйте другой способ оплаты.')}</p>
          <Link className="app-btn app-btn-primary" to="/admin/billing/plans">{t('Выбрать тариф')}</Link>
        </div>
      )}
    </SettingsShell>
  );
}
