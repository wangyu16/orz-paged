/**
 * KIT GAP (orz-markdown 2.3.0): a kind's list of choices opened from the
 * handle's list. The kit's `CarrierAction` is one item (no submenu), its
 * `SettingControl` submenus always write a one-line header value, and its
 * reader controls are only the text size. paged needs three submenus of its
 * own — "New document from template…" (12 templates → a new file), "Version"
 * (the dynamic choices → a multi-line header value) and "Page zoom" (a reader
 * preference) — so each is an action that opens this menu: the kit's
 * `menuButton` (keyboard operable, Escape and an outside press close it),
 * rendered in the chrome's shadow root where the handle's list was (bottom
 * left, above the pencil), its own button hidden. The kit should offer
 * `CarrierAction.items()` (a submenu of actions and radio choices) instead.
 */
import { installCss, menuButton, type CarrierApp, type MenuItem } from 'orz-markdown/carrier/app';

const CSS = `
.orz-paged-kind-menu { position: fixed; left: max(12px, env(safe-area-inset-left)); bottom: calc(64px + env(safe-area-inset-bottom, 0px)); z-index: var(--orz-chrome-z, 2147483000); }
.orz-paged-kind-menu .orz-menu-wrap > button { position: absolute; left: 0; bottom: 0; width: 1px; height: 1px; padding: 0; overflow: hidden; opacity: 0; pointer-events: none; }
.orz-paged-kind-menu .orz-menu { top: auto; bottom: 0; left: 0; right: auto; max-height: min(70vh, 520px); }
@media print { .orz-paged-kind-menu { display: none !important; } }
`;

/** Open a kind menu of `items` in the app's chrome (replacing one already open). Returns its close. */
export function openKindMenu(app: CarrierApp, o: { label: string; heading?: string; items(): MenuItem[] }): () => void {
  const root = app.root as unknown as ShadowRoot;
  const doc = root.ownerDocument;
  installCss(root as never, CSS);
  root.querySelector('.orz-paged-kind-menu')?.remove();
  const wrap = doc.createElement('div');
  wrap.className = 'orz-paged-kind-menu';
  wrap.setAttribute('data-orz-kind-menu', o.label);
  const mb = menuButton(doc as never, { label: o.label, ...(o.heading ? { heading: o.heading } : {}), align: 'left', items: o.items });
  wrap.append(mb.element as unknown as Node);
  root.append(wrap);
  mb.open();
  // the menu takes the focus on its checked (else first) item, as the kit's submenus do
  const menu = wrap.querySelector('.orz-menu');
  const first = (menu?.querySelector('[aria-checked="true"]') ?? menu?.querySelector('.orz-menu__item:not(:disabled)')) as HTMLElement | null;
  first?.focus();
  const close = (): void => {
    mb.destroy();
    wrap.remove();
  };
  // once it closes (a choice, Escape, an outside press), it goes
  const watch = new MutationObserver(() => {
    if (!mb.isOpen()) {
      watch.disconnect();
      // after the choice's own run (the menu closes before it runs)
      setTimeout(close, 0);
    }
  });
  watch.observe(wrap, { childList: true, subtree: true });
  return close;
}
