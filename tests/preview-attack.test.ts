/**
 * The real paged preview against port theft through `window.event` (claim
 * E.9; closed loop round 4, orz-markdown 2.3.0's bridge fix E.35 bundled):
 * document code in the editor's preview frame — here an `<img onerror>` in
 * the document's own text — that runs while the frame handles a render (a
 * MutationObserver on the pages Paged.js builds, a wrapped page hook) reads
 * `window.event`; under the round-3 bridge its `target` was the private
 * MessagePort, and the attacker forged a save, a print or a link with it.
 * Oracle: the reader types one character; nothing is saved, printed or
 * opened, edit mode stays, and the attacker never held a port.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { assembleReal, bootDone, launch, PICKER_INIT, pagesIdle, routeCdn, serve, tempDir, type Browser, type Frame } from './browser-env.js';

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-attack-');
const site = await serve(files.dir);
afterAll(async () => { await browser?.close(); await site.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const STEAL = `function steal(p){if(!p||window.__stolen||!(p instanceof MessagePort))return;window.__stolen=1;window.__got='[port]';var W=window.__W;if(W==='save')p.postMessage({type:'orz-preview-key',key:'s'});if(W==='link')p.postMessage({type:'orz-preview-link',href:'https://evil.example/x'});if(W==='print')p.postMessage({type:'orz-preview-key',key:'p'})}
function ev(){try{var e=window.event;if(e){steal(e.target);steal(e.currentTarget)}}catch(x){}}`;
const OBSERVE = "if(!window.__mo){window.__mo=1;new MutationObserver(function(){ev()}).observe(document.documentElement,{subtree:true,childList:true,attributes:true})}";
const ATTACKS: Record<string, string> = {
  save: `window.__W='save';${STEAL}${OBSERVE}`,
  link: `window.__W='link';${STEAL}${OBSERVE}`,
  print: `window.__W='print';${STEAL}${OBSERVE}`,
  hook: `window.__W='print';${STEAL}if(!window.__hk){window.__hk=1;var h=window.__orzPreviewApply;try{window.__orzPreviewApply=function(a,b){ev();return h(a,b)}}catch(x){}}`,
};

chrome('the paged preview against window.event port theft (real Chrome)', () => {
  for (const [name, code] of Object.entries(ATTACKS)) {
    it(`[E.9] a document script in the preview frame (${name}: ${name === 'hook' ? 'a wrapped page hook' : 'a MutationObserver on the pages'}) never gets the preview's port: typing one character saves, prints and opens nothing, and edit mode stays`, async () => {
      const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(PICKER_INIT);
      await routeCdn(ctx);
      const page = await ctx.newPage();
      const text = `{{nyml\nkind: document\ntitle: Attack\nuid: doc-attackpaged0001\n}}\n\n# Attack ${name}\n\n<img src="x" onerror="eval(atob('${Buffer.from(code).toString('base64')}'))">\n\nPara one.\n`;
      files.write(`${name}.paged.html`, await assembleReal(text));
      await page.goto(`${site.url}/${name}.paged.html`);
      await bootDone(page);
      await pagesIdle(page);
      await page.evaluate(() => {
        const w = window as unknown as { __printed: number; __opened: string[] };
        w.__printed = 0;
        w.__opened = [];
        window.print = () => { w.__printed++; };
        window.open = ((u: string) => { w.__opened.push(String(u)); return null; }) as typeof window.open;
      });
      await page.keyboard.press(`${MOD}+e`);
      let frame: Frame | null = null;
      for (let i = 0; i < 100 && !frame; i++) {
        const f = page.frames().find((x) => x !== page.mainFrame());
        if (f && (await f.evaluate(() => document.querySelectorAll('#orz-doc .pagedjs_page').length).catch(() => 0)) > 0) frame = f;
        else await page.waitForTimeout(200);
      }
      expect(frame).not.toBeNull();
      // the attack is in place (its script ran in the frame)
      await frame!.waitForFunction(() => typeof (window as unknown as { __W?: string }).__W === 'string', null, { timeout: 10_000, polling: 100 });
      await page.waitForTimeout(1000);
      // the reader types one character: a render goes through the port
      await page.locator('.cm-content').click();
      await page.keyboard.press(`${MOD}+End`);
      await page.keyboard.type('x');
      await page.waitForTimeout(4000);
      const got = await frame!.evaluate(() => (window as unknown as { __got?: string }).__got ?? null).catch(() => 'frame gone');
      const r = await page.evaluate(() => {
        const w = window as unknown as { __orzPicks: unknown[]; __printed: number; __opened: string[] };
        return { picks: w.__orzPicks.length, printed: w.__printed, opened: w.__opened, editing: document.getElementById('orz-view')!.hidden };
      });
      expect(got).toBeNull();
      expect(r).toEqual({ picks: 0, printed: 0, opened: [], editing: true });
      expect(ctx.pages().length).toBe(1);
      await ctx.close();
    }, 90_000);
  }
});
