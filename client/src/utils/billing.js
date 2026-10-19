import { useEffect, useState } from 'react';
import { billing as billingApi, getToken } from '../api.js';

export const BILLING_CHANGED_EVENT = 'canban:billing-changed';

let cache = { token: null, promise: null };

export function loadBilling(force = false) {
  const token = getToken();
  if (!token) return Promise.resolve(null);
  if (force || cache.token !== token || !cache.promise) {
    cache = { token, promise: billingApi.get().catch(() => null) };
  }
  return cache.promise;
}

export function notifyBillingChanged(data) {
  cache = { token: getToken(), promise: Promise.resolve(data) };
  window.dispatchEvent(new CustomEvent(BILLING_CHANGED_EVENT));
}

/** Current account plan; null while loading or when the request fails. */
export function useBilling() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => loadBilling().then((d) => { if (alive) setData(d); });
    refresh();
    window.addEventListener(BILLING_CHANGED_EVENT, refresh);
    return () => { alive = false; window.removeEventListener(BILLING_CHANGED_EVENT, refresh); };
  }, []);
  return data;
}

export function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function formatBytes(bytes) {
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

export const PLAN_ORDER = ['free', 'standard', 'premium', 'enterprise'];

export const planIncludes = (plan, minPlan) => PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(minPlan);
