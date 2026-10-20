// Commit navigation even when the browser cannot animate it. An interrupted
// transition must never leave the latest destination waiting on an old frame.
export function createPageNavigator({ commit, startTransition, reducedMotion }) {
  let active, revision = 0;
  return destination => {
    const current = ++revision;
    active?.skipTransition();
    const update = () => { if (current === revision) commit(destination); };
    if (!startTransition || reducedMotion()) { update(); return; }
    try {
      active = startTransition(update);
      active.ready.catch(() => {});
      active.finished.catch(() => {});
    } catch { update(); }
  };
}
