/// <reference types="vite/client" />

declare global {
  interface Window {
    CommonAuth?: {
      init: (containerId?: string) => void;
    };
  }
}

export {};
