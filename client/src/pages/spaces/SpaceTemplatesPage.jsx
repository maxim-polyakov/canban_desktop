import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon } from '../../components/IssueIcons.jsx';
import { openCreateSpace } from '../../components/AppSidebar.jsx';
import { FEATURE_DESCRIPTIONS, FEATURE_TABS, useSpaceTemplates } from '../../utils/spaceFeatures.js';
import './SpaceTemplates.css';

export const ISSUE_TYPE_LABELS = ['Эпик', 'История', 'Задача', 'Ошибка', 'Подзадача'];
const FEATURED = 'featured';

function TemplateCard({ template, categoryTitle }) {
  const { t } = useLocalization();
  return (
    <Link to={`/spaces/templates/${template.id}`} className="tpl-card">
      <span className={`tpl-card-art tpl-cat-${template.category}`}><NavIcon name={template.icon} size={28} /></span>
      <span className="tpl-card-body">
        <span className="tpl-card-title">{t(template.title)}</span>
        <span className="tpl-card-desc">{t(template.description)}</span>
        {categoryTitle && <span className="tpl-card-category">{t(categoryTitle)}</span>}
      </span>
    </Link>
  );
}

export function WorkflowPreview({ columns }) {
  const { t } = useLocalization();
  return (
    <div className="tpl-workflow" aria-label={t('Workflow')}>
      {columns.map((column, index) => (
        <React.Fragment key={column.title}>
          {index > 0 && <span className="tpl-workflow-arrow" aria-hidden="true">→</span>}
          <span className={`tpl-status tpl-status-${column.kind === 3 ? 'done' : column.kind === 0 ? 'todo' : 'progress'}`}>{t(column.title)}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function CategoryNav({ categories, active }) {
  const { t } = useLocalization();
  return (
    <nav className="tpl-nav" aria-label={t('Категории шаблонов')}>
      <Link to="/spaces/templates" className={`tpl-nav-item ${active === FEATURED ? 'is-active' : ''}`}>
        <NavIcon name="star" size={14} />{t('Рекомендуемые')}
      </Link>
      <div className="tpl-nav-heading">{t('Категории')}</div>
      {categories.map((c) => (
        <Link key={c.id} to={`/spaces/templates?category=${c.id}`} className={`tpl-nav-item ${active === c.id ? 'is-active' : ''}`}>
          {t(c.title)}
        </Link>
      ))}
    </nav>
  );
}

function Gallery({ categories, templates }) {
  const { t } = useLocalization();
  const { search } = useLocation();
  const active = new URLSearchParams(search).get('category') || FEATURED;
  const titles = useMemo(() => new Map(categories.map((c) => [c.id, c.title])), [categories]);
  const shown = active === FEATURED ? templates.filter((x) => x.featured) : templates.filter((x) => x.category === active);
  const heading = active === FEATURED ? 'Рекомендуемые' : titles.get(active) || 'Шаблоны';
  return (
    <div className="tpl-layout">
      <CategoryNav categories={categories} active={active} />
      <section className="tpl-main">
        <h2 className="tpl-section-title">{t(heading)}</h2>
        {active === FEATURED && <p className="tpl-section-sub">{t('Самые популярные шаблоны для команд любого профиля')}</p>}
        <div className="tpl-grid">
          {shown.map((template) => (
            <TemplateCard key={template.id} template={template} categoryTitle={active === FEATURED ? titles.get(template.category) : null} />
          ))}
        </div>
        {active === FEATURED && categories.map((c) => {
          const items = templates.filter((x) => x.category === c.id);
          return (
            <div key={c.id} className="tpl-category-block">
              <div className="tpl-category-head">
                <h3>{t(c.title)}</h3>
                <Link to={`/spaces/templates?category=${c.id}`}>{t('Все')} ({items.length})</Link>
              </div>
              <div className="tpl-grid">
                {items.slice(0, 3).map((template) => <TemplateCard key={template.id} template={template} />)}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Preview({ template, categories, templates }) {
  const { t } = useLocalization();
  const category = categories.find((c) => c.id === template.category);
  const features = FEATURE_TABS.filter(([feature]) => template.features.includes(feature));
  const related = templates.filter((x) => x.category === template.category && x.id !== template.id).slice(0, 3);
  return (
    <div className="tpl-layout">
      <CategoryNav categories={categories} active={template.category} />
      <section className="tpl-main">
        <div className="tpl-preview-hero">
          <span className={`tpl-card-art tpl-cat-${template.category} is-large`}><NavIcon name={template.icon} size={40} /></span>
          <div className="tpl-preview-head">
            <div className="tpl-preview-category">{t(category?.title || '')}</div>
            <h2>{t(template.title)}</h2>
            <p>{t(template.description)}</p>
            <div className="tpl-preview-actions">
              <button type="button" className="app-btn app-btn-primary" onClick={() => openCreateSpace({ template: template.id })}>{t('Использовать шаблон')}</button>
            </div>
          </div>
        </div>

        <div className="tpl-preview-grid">
          <div className="tpl-preview-block">
            <h3>{t('Подходит для')}</h3>
            <p>{t(template.bestFor)}</p>
          </div>
          <div className="tpl-preview-block">
            <h3>{t('Типы работ')}</h3>
            <ul className="tpl-types">
              {template.issueTypes.map((type) => (
                <li key={type}><IssueTypeIcon issueType={type} size={16} />{t(ISSUE_TYPE_LABELS[type] || '')}</li>
              ))}
            </ul>
          </div>
          <div className="tpl-preview-block is-wide">
            <h3>{t('Workflow')}</h3>
            <p className="tpl-muted">{t('Статусы, через которые проходит работа. Их можно изменить после создания раздела.')}</p>
            <WorkflowPreview columns={template.columns} />
          </div>
          <div className="tpl-preview-block is-wide">
            <h3>{t('Функции')}</h3>
            <ul className="tpl-features">
              {features.map(([feature, , , icon, label]) => (
                <li key={feature}>
                  <span className="tpl-feature-icon"><NavIcon name={icon} size={16} /></span>
                  <span><strong>{t(label)}</strong><span className="tpl-muted">{t(FEATURE_DESCRIPTIONS[feature])}</span></span>
                </li>
              ))}
              {template.createsSprint && (
                <li>
                  <span className="tpl-feature-icon"><NavIcon name="releases" size={16} /></span>
                  <span><strong>{t('Спринты')}</strong><span className="tpl-muted">{t('Первый спринт будет создан автоматически')}</span></span>
                </li>
              )}
            </ul>
          </div>
        </div>

        {related.length > 0 && (
          <div className="tpl-category-block">
            <div className="tpl-category-head"><h3>{t('Похожие шаблоны')}</h3></div>
            <div className="tpl-grid">{related.map((x) => <TemplateCard key={x.id} template={x} />)}</div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function SpaceTemplatesPage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { categories, templates, loading, error } = useSpaceTemplates();
  const template = templateId ? templates.find((x) => x.id === templateId) : null;

  return (
    <div className="settings-shell">
      <section className="settings-content is-wide tpl-page">
        <div className="settings-breadcrumbs">
          <Link to="/spaces">{t('Разделы')}</Link>
          <span>/</span>
          {template ? <Link to="/spaces/templates">{t('Шаблоны')}</Link> : <span>{t('Шаблоны')}</span>}
        </div>
        <div className="settings-title-row">
          <h1 className="settings-title">{template ? t(template.title) : t('Шаблоны разделов')}</h1>
          <div className="settings-actions">
            <button type="button" className="app-btn app-btn-subtle" onClick={() => navigate(template ? '/spaces/templates' : '/spaces')}>
              {template ? t('Все шаблоны') : t('Закрыть')}
            </button>
          </div>
        </div>
        {loading && <p className="settings-empty">{t('Загрузка...')}</p>}
        {error && <p className="settings-save-status is-error" role="alert">{t('Не удалось загрузить шаблоны')}</p>}
        {!loading && !error && templateId && !template && <p className="settings-empty">{t('Шаблон не найден')}</p>}
        {!loading && !error && (template
          ? <Preview template={template} categories={categories} templates={templates} />
          : !templateId && <Gallery categories={categories} templates={templates} />)}
      </section>
    </div>
  );
}
