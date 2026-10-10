/**
 * KIND-SPECIFIC (paged): this carrier behind the kit's standalone seam
 * (`StandaloneKind`, orz-markdown `carrier/app`, spec/carrier-app.md §3, §7)
 * — its assemble, its creation tool (`newDocument`: the default template),
 * its editor (the kit's shell with a Paged.js preview), its read view
 * (Paged.js pages in the page), its header settings (theme, page size,
 * template, page numbers, Version), its actions (Print; New document from
 * template…), its reader control (Page zoom), its repository (edit mode's
 * GitHub link) and the rest of its FC-19 §2 surface. No text size: it would
 * change the pagination; the reader zooms the pages instead.
 */
import type { CarrierReadView, StandaloneKind } from 'orz-markdown/carrier/app';
import { DEFAULT_TEMPLATE, newDocument } from '../../assemble.js';
import { assemble, extract, formats, kind, mountEditor, readDocument, renderPreview, version } from '../carrier.js';
import { PAGED_ACTIONS } from './actions.js';
import { createReadView, type PagedReadView } from './read-view.js';
import { PAGED_SETTINGS } from './settings.js';
import { PAGE_ZOOMS, isPageZoom } from './zoom.js';

export const PAGED_KIND: StandaloneKind = {
  kind,
  version,
  formats,
  brand: 'orz-paged',
  repo: 'https://github.com/wangyu16/orz-paged',
  assemble: (text, options) => assemble(text, options ?? {}),
  newDocument: () => newDocument({ template: DEFAULT_TEMPLATE }),
  mountEditor: (element, options, ctx) => mountEditor(element as unknown as HTMLElement, options as never, ctx),
  createReadView: (doc) => createReadView(doc as unknown as Document) as never,
  settings: PAGED_SETTINGS,
  actions: PAGED_ACTIONS,
  readerControls: {
    // the reader's page zoom (REBUILD §3b decision 6): a reader preference by uid (`reader.pageZoom`), never in the text
    choices: [{
      key: 'pageZoom',
      label: 'Page zoom',
      choices: PAGE_ZOOMS,
      default: 'auto',
      apply: (view: CarrierReadView, id: string) => { if (isPageZoom(id)) (view as unknown as PagedReadView).setZoom(id); },
    }],
  },
  readDocument,
  extract,
  renderPreview: (text, options) => renderPreview(text, options ?? {}),
};
