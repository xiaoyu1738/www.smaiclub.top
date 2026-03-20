type TransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => unknown;
};

export function runViewTransition(update: () => void): boolean {
  if (typeof document === 'undefined') {
    update();
    return false;
  }

  const transitionDocument = document as TransitionDocument;
  if (typeof transitionDocument.startViewTransition !== 'function') {
    update();
    return false;
  }

  transitionDocument.startViewTransition(() => {
    update();
  });
  return true;
}
