/**
 * KIND-SPECIFIC (paged): this carrier behind the kit's standalone seam
 * (`StandaloneKind`, orz-markdown `carrier/app`, spec/carrier-app.md §3, §7)
 * — its assemble, its creation tool (`newDocument` from a template), its
 * editor (the kit's shell with a Paged.js preview), its read view (Paged.js
 * pages in the page), its header settings (theme, page size, template, page
 * numbers), its actions (Print; New document from template…; Version…;
 * Page zoom…), its repository (edit mode's GitHub link) and the rest of its
 * FC-19 §2 surface. No `readerControls`: the text size would change the
 * pagination; the page zoom is an action (KIT GAP, ./zoom.ts).
 */
import type { StandaloneKind } from 'orz-markdown/carrier/app';
import { newDocument } from '../../assemble.js';
import { assemble, extract, formats, kind, mountEditor, readDocument, renderPreview, version } from '../carrier.js';
import { PAGED_ACTIONS, pendingTemplate, syncVersionAction } from './actions.js';
import { createReadView } from './read-view.js';
import { PAGED_SETTINGS } from './settings.js';

export const PAGED_KIND: StandaloneKind = {
  kind,
  version,
  formats,
  brand: 'orz-paged',
  repo: 'https://github.com/wangyu16/orz-paged',
  assemble: (text, options) => assemble(text, options ?? {}),
  newDocument: () => newDocument({ template: pendingTemplate() }),
  mountEditor: (element, options, ctx) => mountEditor(element as unknown as HTMLElement, options as never, ctx),
  createReadView: (doc) => {
    const view = createReadView(doc as unknown as Document);
    const render = view.render.bind(view);
    // KIT GAP: the Version item follows the document the read view shows (./actions.ts)
    view.render = (text, ctx) => {
      syncVersionAction(text);
      return render(text, ctx);
    };
    return view as never;
  },
  settings: PAGED_SETTINGS,
  actions: PAGED_ACTIONS,
  readDocument,
  extract,
  renderPreview: (text, options) => renderPreview(text, options ?? {}),
};
