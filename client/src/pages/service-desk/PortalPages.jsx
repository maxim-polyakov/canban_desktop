import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { serviceDesk } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import './ServiceDesk.css';

export function SlaBadges({ clocks = [] }) {
  const { t } = useLocalization();
  if (!clocks.length) return null;
  return (
    <span className="sd-sla">
      {clocks.map((clock) => {
        const tone = clock.status === 'breached' ? 'is-bad'
          : clock.status === 'paused' ? 'is-paused'
            : clock.status === 'met' ? 'is-ok'
              : clock.remainingMinutes <= 60 ? 'is-warn' : 'is-ok';
        const label = clock.metric === 'first_response' ? t('Первый ответ') : t('Решение');
        const detail = clock.status === 'breached' ? t('нарушено')
          : clock.status === 'met' ? t('выполнено')
            : clock.status === 'paused' ? t('пауза')
              : `${clock.remainingMinutes} ${t('мин.')}`;
        return <span key={clock.id} className={`sd-lozenge ${tone}`}>{label}: {detail}</span>;
      })}
    </span>
  );
}

function FieldInput({ field, value, onChange, t }) {
  if (field.type === 'paragraph') {
    return <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} required={field.required} />;
  }
  if (field.type === 'select') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
        <option value="">{t('Выберите…')}</option>
        {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text';
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={field.required} />;
}

export function PortalHomePage() {
  const { t } = useLocalization();
  const [portals, setPortals] = useState(null);
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    serviceDesk.listPortals().then(setPortals).catch((e) => { setPortals([]); setError(e.message); });
    serviceDesk.myRequests().then(setRequests).catch(() => setRequests([]));
  }, []);

  return (
    <div className="sd-page">
      <div className="sd-head">
        <div>
          <h1>{t('Service Desk')}</h1>
          <p className="sd-muted">{t('Создавайте заявки в доступных порталах и отслеживайте свои обращения.')}</p>
        </div>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <section className="sd-section">
        <h2>{t('Порталы')}</h2>
        {!portals && <p className="settings-empty">{t('Загрузка...')}</p>}
        {portals && portals.length === 0 && <div className="sd-empty">{t('Нет доступных порталов. Включите Service Desk в настройках раздела.')}</div>}
        {portals && portals.length > 0 && (
          <div className="sd-grid">
            {portals.map((portal) => (
              <Link key={portal.boardId} to={`/portal/${portal.portalSlug}`} className="sd-card">
                <NavIcon name="help" size={20} />
                <h3>{portal.welcomeTitle || portal.boardName}</h3>
                <p className="sd-muted">{portal.welcomeText || portal.boardName}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="sd-section">
        <h2>{t('Мои заявки')}</h2>
        {!requests && <p className="settings-empty">{t('Загрузка...')}</p>}
        {requests && requests.length === 0 && <div className="sd-empty">{t('У вас пока нет заявок.')}</div>}
        {requests && requests.length > 0 && (
          <table className="sd-table">
            <thead>
              <tr><th>{t('Ключ')}</th><th>{t('Тема')}</th><th>{t('Статус')}</th><th>SLA</th><th>{t('Раздел')}</th></tr>
            </thead>
            <tbody>
                  {requests.map((item) => (
                <tr key={item.id}>
                  <td><Link to={`/portal/${item.portalSlug}/requests/${item.id}`}>{item.issueKey}</Link></td>
                  <td><Link to={`/portal/${item.portalSlug}/requests/${item.id}`}>{item.title}</Link></td>
                  <td>{item.statusTitle}</td>
                  <td><SlaBadges clocks={item.sla} /></td>
                  <td>{item.boardName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function PortalCatalogPage() {
  const { slug } = useParams();
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [portal, setPortal] = useState(null);
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    serviceDesk.getPortal(slug).then(setPortal).catch((e) => setError(e.message));
    serviceDesk.myRequests(slug).then(setRequests).catch(() => setRequests([]));
  }, [slug]);

  return (
    <div className="sd-page">
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {!portal && !error && <p className="settings-empty">{t('Загрузка...')}</p>}
      {portal && (
        <>
          <div className="sd-head">
            <div>
              <p className="sd-muted"><Link to="/portal">{t('Service Desk')}</Link> / {portal.boardName}</p>
              <h1>{portal.welcomeTitle}</h1>
              {portal.welcomeText && <p className="sd-muted">{portal.welcomeText}</p>}
            </div>
            <div className="sd-actions">
              <Link className="app-btn app-btn-subtle" to={`/board/${portal.boardId}/service-desk`}>{t('Настройки')}</Link>
              <Link className="app-btn app-btn-subtle" to={`/board/${portal.boardId}/service-desk/queues`}>{t('Очереди')}</Link>
            </div>
          </div>
          <section className="sd-section">
            <h2>{t('Типы запросов')}</h2>
            {portal.requestTypes.length === 0 && <div className="sd-empty">{t('Типы запросов ещё не настроены.')}</div>}
            <div className="sd-grid">
              {portal.requestTypes.map((type) => (
                <button key={type.id} type="button" className="sd-card" onClick={() => navigate(`/portal/${slug}/new/${type.id}`)}>
                  <NavIcon name={type.icon || 'help'} size={20} />
                  <h3>{type.name}</h3>
                  <p className="sd-muted">{type.description || t('Создать заявку')}</p>
                </button>
              ))}
            </div>
          </section>
          <section className="sd-section">
            <h2>{t('Мои заявки')}</h2>
            {!requests && <p className="settings-empty">{t('Загрузка...')}</p>}
            {requests && requests.length === 0 && <div className="sd-empty">{t('У вас пока нет заявок в этом портале.')}</div>}
            {requests && requests.length > 0 && (
              <table className="sd-table">
                <thead>
                  <tr><th>{t('Ключ')}</th><th>{t('Тема')}</th><th>{t('Статус')}</th><th>SLA</th></tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id}>
                      <td><Link to={`/portal/${slug}/requests/${item.id}`}>{item.issueKey}</Link></td>
                      <td><Link to={`/portal/${slug}/requests/${item.id}`}>{item.title}</Link></td>
                      <td>{item.statusTitle}</td>
                      <td><SlaBadges clocks={item.sla} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function PortalCreatePage() {
  const { slug, typeId } = useParams();
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [portal, setPortal] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const type = useMemo(() => portal?.requestTypes?.find((item) => item.id === typeId), [portal, typeId]);

  useEffect(() => {
    serviceDesk.getPortal(slug).then(setPortal).catch((e) => setError(e.message));
  }, [slug]);

  const submit = async (event) => {
    event.preventDefault();
    if (!type) return;
    setSaving(true);
    setError('');
    try {
      const created = await serviceDesk.createRequest(slug, type.id, { answers });
      navigate(`/portal/${slug}/requests/${created.id}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (!portal && !error) return <div className="sd-page"><p className="settings-empty">{t('Загрузка...')}</p></div>;
  if (!type) return <div className="sd-page"><p className="settings-save-status is-error">{error || t('Тип запроса не найден.')}</p></div>;

  return (
    <div className="sd-page">
      <div className="sd-head">
        <div>
          <p className="sd-muted"><Link to={`/portal/${slug}`}>{portal.welcomeTitle}</Link></p>
          <h1>{type.name}</h1>
          {type.description && <p className="sd-muted">{type.description}</p>}
        </div>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <form className="sd-form" onSubmit={submit}>
        {(type.fields || []).map((field) => (
          <label key={field.id}>
            {field.label}{field.required ? ' *' : ''}
            <FieldInput field={field} value={answers[field.id] || ''} onChange={(value) => setAnswers((prev) => ({ ...prev, [field.id]: value }))} t={t} />
          </label>
        ))}
        <div className="sd-actions">
          <Link to={`/portal/${slug}`} className="app-btn app-btn-subtle">{t('Назад')}</Link>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : t('Отправить')}</button>
        </div>
      </form>
    </div>
  );
}

export function PortalRequestPage() {
  const { slug, questId } = useParams();
  const { t } = useLocalization();
  const [request, setRequest] = useState(null);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => serviceDesk.getRequest(slug, questId).then(setRequest).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [slug, questId]);

  const send = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError('');
    try {
      await serviceDesk.addComment(slug, questId, { text, isInternal: internal });
      setText('');
      setInternal(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const decide = async (approvalId, approve) => {
    setError('');
    try {
      await serviceDesk.decideApproval(approvalId, { approve });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!request && !error) return <div className="sd-page"><p className="settings-empty">{t('Загрузка...')}</p></div>;
  if (!request) return <div className="sd-page"><p className="settings-save-status is-error">{error}</p></div>;

  return (
    <div className="sd-page">
      <div className="sd-head">
        <div>
          <p className="sd-muted"><Link to={`/portal/${slug}`}>{request.boardName}</Link></p>
          <h1>{request.issueKey}: {request.title}</h1>
          <p className="sd-muted">{request.requestTypeName || t('Заявка')} · {request.statusTitle}</p>
          <div style={{ marginTop: 8 }}><SlaBadges clocks={request.sla} /></div>
        </div>
        <div className="sd-actions">
          <Link className="app-btn app-btn-subtle" to={`/board/${request.boardId}/issue/${request.id}`}>{t('Открыть как задачу')}</Link>
        </div>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <div className="sd-split">
        <div>
          <section className="sd-section">
            <h2>{t('Описание')}</h2>
            <div className="sd-comment" style={{ whiteSpace: 'pre-wrap' }}>{request.description || t('Без описания')}</div>
          </section>
          <section className="sd-section">
            <h2>{t('Комментарии')}</h2>
            <div className="sd-comments">
              {(request.comments || []).map((comment) => (
                <div key={comment.id} className={`sd-comment ${comment.isInternal ? 'is-internal' : ''}`}>
                  <div className="sd-comment-meta">
                    <strong>{comment.authorName}</strong>
                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                    {comment.isInternal && <span className="sd-lozenge is-paused">{t('Внутренний')}</span>}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{comment.text}</div>
                </div>
              ))}
              {(request.comments || []).length === 0 && <div className="sd-empty">{t('Комментариев пока нет.')}</div>}
            </div>
            <form className="sd-form" style={{ marginTop: 16 }} onSubmit={send}>
              <label>
                {t('Ответ')}
                <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <label className="sd-check">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                {t('Внутренняя заметка (только для агентов)')}
              </label>
              <button type="submit" className="app-btn app-btn-primary" disabled={saving || !text.trim()}>{saving ? '…' : t('Отправить')}</button>
            </form>
          </section>
        </div>
        <aside className="sd-side">
          <section className="sd-section">
            <h2>{t('Сведения')}</h2>
            <div className="sd-comment">
              <div><strong>{t('Исполнитель')}:</strong> {request.assigneeName || t('Не назначен')}</div>
              <div><strong>{t('Создано')}:</strong> {new Date(request.createdAt).toLocaleString()}</div>
            </div>
          </section>
          {(request.approvals || []).length > 0 && (
            <section className="sd-section">
              <h2>{t('Согласования')}</h2>
              {request.approvals.map((approval) => (
                <div key={approval.id} className="sd-comment">
                  <div className="sd-comment-meta">
                    <strong>{approval.title}</strong>
                    <span className={`sd-lozenge ${approval.status === 'approved' ? 'is-ok' : approval.status === 'rejected' ? 'is-bad' : 'is-warn'}`}>{approval.status}</span>
                  </div>
                  <ul>
                    {approval.decisions.map((decision) => (
                      <li key={decision.id}>{decision.approverName || decision.approverGroupName || t('Согласующий')}: {decision.status}</li>
                    ))}
                  </ul>
                  {approval.canDecide && (
                    <div className="sd-actions">
                      <button type="button" className="app-btn app-btn-primary" onClick={() => decide(approval.id, true)}>{t('Одобрить')}</button>
                      <button type="button" className="app-btn app-btn-subtle" onClick={() => decide(approval.id, false)}>{t('Отклонить')}</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
