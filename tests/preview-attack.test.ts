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

interface AttackRun { got: string | null; r: { picks: number; printed: number; opened: string[]; editing: boolean }; pages: number; scroll: [number, number]; probe: unknown }

/**
 * Open a document whose text carries `code` (an `<img onerror>`), Edit, wait for the preview frame and the attack in
 * place, let the reader type one character, then `act` (more reader input), and report what the attacker got.
 */
async function attack(name: string, code: string, o: { paras?: number; act?: (page: import('playwright-core').Page, frame: Frame) => Promise<void>; probe?: string } = {}): Promise<AttackRun> {
  const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(PICKER_INIT);
  await routeCdn(ctx);
  const page = await ctx.newPage();
  const paras = Array.from({ length: o.paras ?? 1 }, (_, i) => `Para ${i} ${'lorem ipsum dolor sit amet '.repeat(o.paras ? 6 : 1)}`).join('\n\n');
  const text = `{{nyml\nkind: document\ntitle: Attack\nuid: doc-attackpaged0001\n}}\n\n# Attack ${name}\n\n<img src="x" onerror="eval(atob('${Buffer.from(code).toString('base64')}'))">\n\n${paras}\n`;
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
  const scroller = page.locator('.cm-scroller');
  const s0 = await scroller.evaluate((e) => e.scrollTop);
  if (o.act) await o.act(page, frame!);
  const s1 = await scroller.evaluate((e) => e.scrollTop);
  const cur = page.frames().find((x) => x !== page.mainFrame()) ?? frame!;
  const got = await cur.evaluate(() => (window as unknown as { __got?: string }).__got ?? null).catch(() => 'frame gone');
  const probe = o.probe ? await cur.evaluate(o.probe).catch((e) => `probe failed ${e}`) : null;
  const r = await page.evaluate(() => {
    const w = window as unknown as { __orzPicks: unknown[]; __printed: number; __opened: string[] };
    return { picks: w.__orzPicks.length, printed: w.__printed, opened: w.__opened, editing: document.getElementById('orz-view')!.hidden };
  });
  const pages = ctx.pages().length;
  await ctx.close();
  return { got, r, pages, scroll: [s0, s1], probe };
}

const SAFE = { picks: 0, printed: 0, opened: [], editing: true };

chrome('the paged preview against window.event port theft (real Chrome)', () => {
  for (const [name, code] of Object.entries(ATTACKS)) {
    it(`[E.9] a document script in the preview frame (${name}: ${name === 'hook' ? 'a wrapped page hook' : 'a MutationObserver on the pages'}) never gets the preview's port: typing one character saves, prints and opens nothing, and edit mode stays`, async () => {
      const a = await attack(name, code);
      expect(a.got).toBeNull();
      expect(a.r).toEqual(SAFE);
      expect(a.pages).toBe(1);
    }, 90_000);
  }
});

// closed loop round 5: the carrier-side probes (in the preview frame only: the document's scripts run in the read view
// too, the author's own page) of the kit's bridge rules (orz-markdown 2.3.0 E.35 — the bridge reads
// events through natives it captured, its page hooks cannot be replaced, and scroll sync follows only reader input)
const KEYS = `if(window.parent===window)throw 0;window.__W='keys';try{var kd=Object.getOwnPropertyDescriptor(KeyboardEvent.prototype,'key');Object.defineProperty(KeyboardEvent.prototype,'key',{configurable:true,get:function(){return 's'}});['metaKey','ctrlKey'].forEach(function(n){Object.defineProperty(KeyboardEvent.prototype,n,{configurable:true,get:function(){return true}})});Object.defineProperty(Event.prototype,'isTrusted',{configurable:true,get:function(){return true}})}catch(x){window.__err=String(x)}`;
const HOOKS = `if(window.parent===window)throw 0;window.__W='hooks';var d0=Object.getOwnPropertyDescriptor(window,'__orzPreview');window.__desc=d0?{writable:!!d0.writable,configurable:!!d0.configurable}:null;var real=window.__orzPreview;try{window.__orzPreview={report:function(){},navigated:function(){},key:function(){}}}catch(x){}try{Object.defineProperty(window,'__orzPreview',{value:{report:function(){}}})}catch(x){}try{delete window.__orzPreview}catch(x){}window.__same=window.__orzPreview===real;try{if(real){real.report=function(){};real.key=function(){}}}catch(x){}window.__frozen=!!real&&Object.isFrozen(real)`;
const SCROLL = `if(window.parent===window)throw 0;window.__W='scroll';var y=0;setInterval(function(){y=(y+400)%4000;try{document.scrollingElement.scrollTop=y;var g=document.querySelectorAll('.pagedjs_page');if(g.length)g[(y/400|0)%g.length].scrollIntoView();if(window.__orzPreview&&window.__orzPreview.navigated)window.__orzPreview.navigated(40);window.dispatchEvent(new WheelEvent('wheel',{bubbles:true}));window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))}catch(x){}},250)`;

chrome('the paged preview against forged reader input and replaced hooks (real Chrome, round 5)', () => {
  it('[E.9] a document script that overrides `KeyboardEvent.prototype.key` (and the modifier and `isTrusted` getters) to read Cmd/Ctrl+S: the reader pressing a plain key in the preview saves, prints and opens nothing — the bridge reads keys through the natives it captured (the kit\'s E.35)', async () => {
    const a = await attack('keys', KEYS, {
      act: async (page) => {
        const box = await page.locator('iframe').boundingBox();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + 120);
        for (const k of ['x', 'j', 'ArrowDown']) await page.keyboard.press(k);
        await page.waitForTimeout(1500);
      },
      probe: 'window.__err || null',
    });
    expect(a.probe).toBeNull(); // the overrides were in place
    expect(a.got).toBeNull();
    expect(a.r).toEqual(SAFE);
    expect(a.pages).toBe(1);
  }, 90_000);

  it('[E.9] a document script cannot replace the preview\'s page hooks: `window.__orzPreview` is neither writable nor configurable (assignment, `defineProperty`, `delete` leave the bridge\'s object) and that object is frozen; typing goes on rendering and nothing is saved, printed or opened (the kit\'s E.35)', async () => {
    const a = await attack('hooks', HOOKS, { probe: '({ desc: window.__desc, same: window.__same, frozen: window.__frozen })' });
    expect(a.probe).toEqual({ desc: { writable: false, configurable: false }, same: true, frozen: true });
    expect(a.got).toBeNull();
    expect(a.r).toEqual(SAFE);
  }, 90_000);

  it('[E.9] a document that scrolls itself and calls `__orzPreview.navigated()` with no reader input (synthetic wheel and pointer events too) never scrolls the editor: scroll sync follows only the reader\'s own input in the preview (the kit\'s E.35)', async () => {
    const a = await attack('scroll', SCROLL, {
      paras: 60,
      act: async (page) => {
        // the reader moves the mouse over the preview without clicking or scrolling, and waits
        const box = await page.locator('iframe').boundingBox();
        await page.mouse.move(box!.x + box!.width / 2, box!.y + 200);
        await page.waitForTimeout(4000);
      },
    });
    expect(a.scroll[1]).toBe(a.scroll[0]);
    expect(a.got).toBeNull();
    expect(a.r).toEqual(SAFE);
  }, 90_000);
});
