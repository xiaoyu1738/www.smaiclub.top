import { resolveUiVariant } from './uiVariant';

export const UI_VARIANT = resolveUiVariant(
  import.meta.env.VITE_UI_VARIANT,
  import.meta.env.DEV,
);
export const IS_DEV_UI = UI_VARIANT === 'dev';
export const UI_NAME = IS_DEV_UI ? '开发版 UI' : '生产版 UI';
