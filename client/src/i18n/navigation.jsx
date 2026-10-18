import React from 'react';
import {
  Link as RouterLink,
  Navigate as RouterNavigate,
  useNavigate as useRouterNavigate,
} from 'react-router-dom';
import { useLocalization } from './LocalizationContext.jsx';
import { withLangQuery } from './locale.js';

export { BrowserRouter, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';

export function Link({ to, ...props }) {
  const { language } = useLocalization();
  return <RouterLink to={typeof to === 'string' ? withLangQuery(to, language) : to} {...props} />;
}

export function Navigate({ to, ...props }) {
  const { language } = useLocalization();
  return <RouterNavigate to={typeof to === 'string' ? withLangQuery(to, language) : to} {...props} />;
}

export function useNavigate() {
  const navigate = useRouterNavigate();
  const { language } = useLocalization();
  return React.useCallback((to, options) => {
    navigate(typeof to === 'string' ? withLangQuery(to, language) : to, options);
  }, [navigate, language]);
}
