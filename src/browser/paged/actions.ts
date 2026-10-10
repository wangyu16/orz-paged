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
import { newDocument } from '../../assemble.js';
import { templateList } from '../../doc/templates.js';
import type { PagedReadView } from './read-view.js';

export const PRINT_ACTION: CarrierAction = {
  id: 'print',
  label: 'Print',
  icon: 'print',
  placement: 'bar',
  async run(app) {
    const view = app.view as unknown as PagedReadView;
    // the pages print as their final layout: a render or the re-flow after late fonts is awaited first (a quiet note
    // while it takes), never the provisional pages (closed loop round 2, R.11)
    if (view.busy?.()) app.toast('Preparing pages…', 'info');
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
  items() {
    let group = '';
    return templateList().map((t): CarrierActionItem => {
      const separator = group !== '' && t.group !== group;
      group = t.group;
      return { id: t.id, label: t.label, ...(separator ? { separator: true } : {}), run: (app) => app.newDocument({ text: newDocument({ template: t.id }), name: `${t.id}.paged.html` }).then(() => undefined) };
    });
  },
};

/** This kind's actions. */
export const PAGED_ACTIONS: readonly CarrierAction[] = Object.freeze([PRINT_ACTION, NEW_FROM_TEMPLATE_ACTION]);
