/**
 * KIND-SPECIFIC (paged): the extra operations of the pencil's list
 * (spec/carrier-app.md §3.4, REBUILD §3b decisions 3, 5, 6 and guide 6):
 *
 * - **Print** (`bar`: right after Edit): prints the read view — the pages as
 *   they show, after the current layout settles (`window.print()`; the
 *   chrome, the grey desk and the shadows do not print). Read view only: the
 *   editor preview does not print.
 * - **New document from template…**: the 12 templates; choosing one opens a
 *   fresh file made by `newDocument({ template })` through the kit's New
 *   document (a new file of its own: the current text is never replaced).
 * - **Version…** (only while the document offers dynamic choices): pick the
 *   version to print — a header edit of `dynamic_choices`, undoable.
 * - **Page zoom…**: Automatic / Fit width / 100 % / 125 % — a reader
 *   preference, the document is untouched.
 *
 * KIT GAP (orz-markdown 2.3.0): the kit's actions have no submenus and its
 * action list is read once at boot. The three lists open a kind menu
 * (./kind-menu.ts), and the Version item is added to and removed from this
 * kind's own (mutable) action array as the document changes
 * ({@link syncVersionAction}); the kit should offer `CarrierAction.items()`
 * and `CarrierAction.hidden?(text)`.
 */
import type { CarrierAction, CarrierApp, MenuItem } from 'orz-markdown/carrier/app';
import { templateList } from '../../doc/templates.js';
import { DEFAULT_TEMPLATE } from '../../assemble.js';
import { openKindMenu } from './kind-menu.js';
import type { PagedReadView } from './read-view.js';
import { versionChange, versionChoices } from './versions.js';
import { PAGE_ZOOMS, type PageZoom } from './zoom.js';

/** The template the kind's `newDocument` uses next (set only while "New document from template…" runs). */
let nextTemplate: string | null = null;

/** The template of the next new document (the kit's New document: the default template). */
export function pendingTemplate(): string {
  return nextTemplate ?? DEFAULT_TEMPLATE;
}

/**
 * Save a new document of `template` as a new file, as the kit's New document
 * does. KIT GAP (orz-markdown 2.3.0): `StandaloneKind.newDocument()` and
 * `CarrierApp.newDocument()` take no options, so the template is handed to
 * the kind's `newDocument` through {@link pendingTemplate} for the one call;
 * the kit should offer `app.newDocument({ text?, name? })`.
 */
export function newFromTemplate(app: CarrierApp, template: string): Promise<unknown> {
  nextTemplate = template;
  try {
    return app.newDocument(); // the kit calls the kind's newDocument() at once (before its first await)
  } finally {
    nextTemplate = null;
  }
}

const viewOf = (app: CarrierApp): PagedReadView => app.view as unknown as PagedReadView;

export const PRINT_ACTION: CarrierAction = {
  id: 'print',
  label: 'Print',
  icon: 'print',
  placement: 'bar',
  async run(app) {
    const view = viewOf(app);
    await view.idle?.();
    (view.element.ownerDocument.defaultView ?? window).print();
  },
};

export const NEW_FROM_TEMPLATE_ACTION: CarrierAction = {
  id: 'new-from-template',
  label: 'New document from template…',
  icon: 'new',
  placement: 'menu',
  inEdit: true,
  run(app) {
    openKindMenu(app, {
      label: 'New document from template',
      heading: 'New document from template',
      items: () => {
        let group = '';
        return templateList().map((t): MenuItem => {
          const separator = group !== '' && t.group !== group;
          group = t.group;
          return { label: t.label, ...(separator ? { separator: true } : {}), run: () => { void newFromTemplate(app, t.id); } };
        });
      },
    });
  },
};

export const VERSION_ACTION: CarrierAction = {
  id: 'version',
  label: 'Version…',
  placement: 'menu',
  run(app) {
    openKindMenu(app, {
      label: 'Version',
      heading: 'Version to show and print',
      items: () => {
        const out: MenuItem[] = [];
        versionChoices(app.getText()).forEach((c, i) => {
          const values = [...c.values, null];
          values.forEach((v, j) => {
            out.push({
              label: `${c.label}: ${v ?? '(not set)'}`,
              checked: c.current === v,
              ...(i > 0 && j === 0 ? { separator: true } : {}),
              disabled: app.updating,
              run: () => { if (c.current !== v) app.setSetting(versionChange(app.getText(), c.key, v)); },
            });
          });
        });
        return out;
      },
    });
  },
};

export const ZOOM_ACTION: CarrierAction = {
  id: 'page-zoom',
  label: 'Page zoom…',
  placement: 'menu',
  run(app) {
    const view = viewOf(app);
    const now = view.zoom();
    const choices: ReadonlyArray<{ value: PageZoom; label: string }> = [{ value: 'auto', label: 'Automatic' }, ...PAGE_ZOOMS];
    openKindMenu(app, {
      label: 'Page zoom',
      heading: 'Page zoom',
      items: () => choices.map((c) => ({ label: c.label, checked: c.value === now, run: () => view.setZoom(c.value) })),
    });
  },
};

/** This kind's actions — KIT GAP: mutable, the Version item comes and goes with the document's choices. */
export const PAGED_ACTIONS: CarrierAction[] = [PRINT_ACTION, NEW_FROM_TEMPLATE_ACTION, ZOOM_ACTION];

/** Offer the Version item exactly while `text` offers dynamic choices (before Page zoom). */
export function syncVersionAction(text: string): void {
  const offered = versionChoices(text).length > 0;
  const at = PAGED_ACTIONS.indexOf(VERSION_ACTION);
  if (offered && at < 0) PAGED_ACTIONS.splice(PAGED_ACTIONS.indexOf(ZOOM_ACTION), 0, VERSION_ACTION);
  else if (!offered && at >= 0) PAGED_ACTIONS.splice(at, 1);
}
