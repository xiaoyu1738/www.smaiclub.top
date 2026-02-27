export function resolveUiVariant(rawVariant, isDev) {
  const normalized = String(rawVariant || '').toLowerCase();
  if (normalized === 'dev' || normalized === 'prod') {
    return normalized;
  }
  return isDev ? 'dev' : 'prod';
}
