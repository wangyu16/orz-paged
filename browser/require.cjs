// orz-paged-browser has no CommonJS build: `import` it (ES module) or load
// orz-paged.browser.js with a <script> tag (globalThis.OrzCarrier).
throw new Error("orz-paged-browser: require() is not supported. Use `import { mountEditor } from 'orz-paged-browser'` (ES module), or a <script src=\".../orz-paged.browser.js\"> tag that sets globalThis.OrzCarrier.");
