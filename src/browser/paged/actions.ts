/**
 * KIND-SPECIFIC (paged): the extra operations of the pencil's list
 * (spec/carrier-app.md §3.4, REBUILD §3b decisions 3, 5, 6 and guide 6):
 *
 * - **Print** (`bar`: right after Edit): prints the read view — the pages as
 *   they show, after the current layout settles (`window.print()`; the
 *   chrome, the grey desk and the shadows do not print; "Preparing pages…"
 *   while it waits). Read view only: the editor preview does not print. The
 *   kit runs it for Cmd/Ctrl+P too — in the read view, in edit mode (leaving
 *   it first), in the editor and in its preview frame (orz-markdown 2.3.0).
 * - **New document from template…**: a submenu of the 12 templates (the kit's
 *   action `items`, grouped by separators); choosing one saves a fresh file
 *   of the template's text through the kit's New document
 *   (`app.newDocument({ text })`: a new file of its own, the current text is
 *   never replaced; the suggested name is `<template>.paged.html`).
 *
 * The Version picker is a header setting (./settings.ts, `VERSION_SETTING`)
 * and the page zoom a reader control (./kind.ts, `readerControls.choices`).
 */
import type { CarrierAction, CarrierActionItem } from 'orz-markdown/carrier/app';
import { letterDate, newDocument } from '../../assemble.js';
import { templateList } from '../../doc/templates.js';
import type { PagedReadView } from './read-view.js';

/** The print waiting for its layout (one at a time: closed loop round 3). */
let pendingPrint: Promise<void> | null = null;

export const PRINT_ACTION: CarrierAction = {
  id: 'print',
  label: 'Print',
  icon: 'print',
  placement: 'bar',
  run(app) {
    const view = app.view as unknown as PagedReadView;
    // one pending print: another press (the button, Cmd/Ctrl+P) while the pages are prepared only says so again —
    // never a second dialog after the first (closed loop round 3)
    if (pendingPrint) {
      app.toast('Preparing pages… the print dialog opens when they are ready.', 'info');
      return pendingPrint;
    }
    pendingPrint = (async () => {
      // the pages print as their final layout: a render or the re-flow after late fonts is awaited first (a quiet,
      // announced "Preparing pages… (n of N)" while it takes), never the provisional pages (closed loop round 2, R.11)
      const waits = !!view.busy?.();
      if (waits) {
        app.toast('Preparing pages…', 'info');
        view.preparing?.(true);
      }
      try {
        await view.idle?.();
      } finally {
        if (waits) view.preparing?.(false);
      }
      (view.element.ownerDocument.defaultView ?? window).print();
    })().finally(() => { pendingPrint = null; });
    return pendingPrint;
  },
};

export const NEW_FROM_TEMPLATE_ACTION: CarrierAction = {
  id: 'new-from-template',
  label: 'New document from template…',
  icon: 'new',
  placement: 'menu',
  inEdit: true,
  items() {
    let group = '';
    return templateList().map((t): CarrierActionItem => {
      const separator = group !== '' && t.group !== group;
      group = t.group;
      return { id: t.id, label: t.label, ...(separator ? { separator: true } : {}), run: (app) => app.newDocument({ text: newDocument({ template: t.id, date: letterDate(new Date()) }), name: `${t.id}.paged.html` }).then(() => undefined) };
    });
  },
};

/** This kind's actions. */
export const PAGED_ACTIONS: readonly CarrierAction[] = Object.freeze([PRINT_ACTION, NEW_FROM_TEMPLATE_ACTION]);
