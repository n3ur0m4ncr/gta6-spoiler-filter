const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Matcher = require('../src/matcher.js');

function createMiniDom({ url = 'https://www.youtube.com/', title = 'YouTube' } = {}) {
  class MiniClassList {
    constructor(el) {
      this.el = el;
      this.set = new Set();
    }
    add(...names) {
      for (const n of names) if (n) this.set.add(n);
      this.el._className = Array.from(this.set).join(' ');
    }
    remove(...names) {
      for (const n of names) this.set.delete(n);
      this.el._className = Array.from(this.set).join(' ');
    }
    contains(name) {
      return this.set.has(name);
    }
    _syncFromString(str) {
      this.set = new Set(String(str || '').split(/\s+/).filter(Boolean));
    }
  }

  function makeDataset(el) {
    return new Proxy(
      {},
      {
        get(_t, prop) {
          const attr = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          return el._attrs.get(attr);
        },
        set(_t, prop, val) {
          const attr = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          el._attrs.set(attr, String(val));
          return true;
        },
        deleteProperty(_t, prop) {
          const attr = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          el._attrs.delete(attr);
          return true;
        }
      }
    );
  }

  class MiniNode {
    constructor(nodeType, nodeValue = '') {
      this.nodeType = nodeType;
      this.nodeValue = nodeValue;
      this.parentElement = null;
      this.childNodes = [];
    }
    get parentNode() {
      return this.parentElement;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    remove() {
      if (!this.parentElement) return;
      const idx = this.parentElement.childNodes.indexOf(this);
      if (idx !== -1) this.parentElement.childNodes.splice(idx, 1);
      this.parentElement = null;
    }
  }

  class MiniElement extends MiniNode {
    constructor(tagName) {
      super(1);
      this.tagName = tagName.toUpperCase();
      this._attrs = new Map();
      this._className = '';
      this.classList = new MiniClassList(this);
      this.dataset = makeDataset(this);
      this._listeners = new Map();
      this.paused = false;
      this.muted = false;
    }
    get id() {
      return this._attrs.get('id') || '';
    }
    set id(v) {
      this._attrs.set('id', String(v));
    }
    get className() {
      return this._className;
    }
    set className(v) {
      this._className = String(v || '');
      this.classList._syncFromString(this._className);
    }
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    get textContent() {
      if (this.nodeType === 3) return this.nodeValue;
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(val) {
      this.childNodes = [];
      if (val !== '' && val !== null && val !== undefined) {
        this.appendChild(new MiniNode(3, String(val)));
      }
    }
    appendChild(node) {
      if (node.parentElement) node.remove();
      node.parentElement = this;
      this.childNodes.push(node);
      return node;
    }
    getAttribute(name) {
      if (name === 'class') return this._className;
      return this._attrs.has(name) ? this._attrs.get(name) : null;
    }
    setAttribute(name, val) {
      if (name === 'class') {
        this.className = val;
      } else {
        this._attrs.set(name, String(val));
      }
    }
    hasAttribute(name) {
      if (name === 'class') return this._className.length > 0;
      return this._attrs.has(name);
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    dispatchEvent(ev) {
      const fns = this._listeners.get(ev.type) || [];
      for (const fn of fns) fn(ev);
    }
    pause() {
      this.paused = true;
    }
    getBoundingClientRect() {
      return { width: 320, height: 220 };
    }
    matches(selectorList) {
      const parts = selectorList.split(',').map((s) => s.trim()).filter(Boolean);
      for (const sel of parts) {
        if (matchesSingleSelectorChain(this, sel)) return true;
      }
      return false;
    }
    closest(selectorList) {
      let cur = this;
      while (cur) {
        if (cur.nodeType === 1 && cur.matches(selectorList)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(selectorList) {
      const results = [];
      const parts = selectorList.split(',').map((s) => s.trim()).filter(Boolean);
      const hasDirectScope = parts.some((p) => p.startsWith(':scope >'));
      const visit = (node) => {
        for (const child of node.children) {
          let hit = false;
          for (const sel of parts) {
            if (sel.startsWith(':scope >')) {
              const inner = sel.slice(':scope >'.length).trim();
              if (child.parentElement === this && matchesSingleSelectorChain(child, inner)) {
                hit = true;
                break;
              }
            } else if (matchesSingleSelectorChain(child, sel)) {
              hit = true;
              break;
            }
          }
          if (hit) results.push(child);
          if (!hasDirectScope || parts.some((p) => !p.startsWith(':scope >'))) {
            visit(child);
          }
        }
      };
      visit(this);
      return results;
    }
    querySelector(selectorList) {
      return this.querySelectorAll(selectorList)[0] || null;
    }
  }

  function matchesSimpleSelector(el, sel) {
    if (!el || el.nodeType !== 1 || !sel) return false;
    let rest = sel;

    // Extract tag if present at start
    const tagMatch = rest.match(/^[a-zA-Z0-9-]+/);
    if (tagMatch) {
      if (el.tagName !== tagMatch[0].toUpperCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }

    while (rest.length > 0) {
      if (rest[0] === '#') {
        const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
        if (!m || el.id !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '.') {
        const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
        if (!m || !el.classList.contains(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '[') {
        const end = rest.indexOf(']');
        if (end === -1) return false;
        const inner = rest.slice(1, end);
        rest = rest.slice(end + 1);
        const eqIdx = inner.indexOf('=');
        if (eqIdx === -1) {
          if (!el.hasAttribute(inner)) return false;
        } else {
          let attrName = inner.slice(0, eqIdx);
          let op = '=';
          if (attrName.endsWith('^') || attrName.endsWith('*')) {
            op = attrName.slice(-1) + '=';
            attrName = attrName.slice(0, -1);
          }
          const rawVal = inner.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
          const actual = el.getAttribute(attrName);
          if (actual === null) return false;
          if (op === '=' && actual !== rawVal) return false;
          if (op === '^=' && !actual.startsWith(rawVal)) return false;
          if (op === '*=' && !actual.includes(rawVal)) return false;
        }
      } else {
        return false;
      }
    }
    return true;
  }

  function matchesSingleSelectorChain(el, chain) {
    const tokens = chain.trim().split(/\s+/);
    if (!matchesSimpleSelector(el, tokens[tokens.length - 1])) return false;
    let cur = el.parentElement;
    for (let i = tokens.length - 2; i >= 0; i--) {
      while (cur && !matchesSimpleSelector(cur, tokens[i])) {
        cur = cur.parentElement;
      }
      if (!cur) return false;
      cur = cur.parentElement;
    }
    return true;
  }

  const parsedUrl = new URL(url);
  const docListeners = new Map();
  const doc = {
    readyState: 'complete',
    title,
    documentElement: new MiniElement('html'),
    head: new MiniElement('head'),
    body: new MiniElement('body'),
    createElement(tag) {
      return new MiniElement(tag);
    },
    getElementById(id) {
      return this.documentElement.querySelector('#' + id);
    },
    querySelectorAll(sel) {
      return this.documentElement.querySelectorAll(sel);
    },
    querySelector(sel) {
      return this.documentElement.querySelector(sel);
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      const fns = docListeners.get(ev.type) || [];
      for (const fn of fns) fn(ev);
    }
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  return { doc, parsedUrl };
}

function runContentScript({ url, title, storedSettings = {}, setupDom }) {
  const { doc, parsedUrl } = createMiniDom({ url, title });
  setupDom(doc);

  let storageState = { ...Matcher.DEFAULT_SETTINGS, ...storedSettings };
  const storageListeners = [];
  const runtimeListeners = [];
  const windowListeners = new Map();

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  const win = {
    top: null,
    self: null,
    innerWidth: 1280,
    innerHeight: 720,
    location: {
      href: parsedUrl.href,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname,
      replace(next) {
        this.href = next;
      }
    },
    history: {
      length: 2,
      backCalled: false,
      back() {
        this.backCalled = true;
      }
    },
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    }
  };
  win.top = win;
  win.self = win;

  const chrome = {
    storage: {
      local: {
        get(defaults, cb) {
          cb({ ...defaults, ...storageState });
        },
        set(patch, cb) {
          const changes = {};
          for (const [k, v] of Object.entries(patch)) {
            changes[k] = { oldValue: storageState[k], newValue: v };
            storageState[k] = v;
          }
          for (const fn of storageListeners) fn(changes, 'local');
          if (cb) cb();
        }
      },
      onChanged: {
        addListener(fn) {
          storageListeners.push(fn);
        }
      }
    },
    runtime: {
      onMessage: {
        addListener(fn) {
          runtimeListeners.push(fn);
        }
      }
    }
  };

  const sandbox = {
    globalThis: null,
    window: win,
    document: doc,
    location: win.location,
    chrome,
    GTA6SpoilerMatcher: Matcher,
    MutationObserver: FakeMutationObserver,
    requestAnimationFrame: (fn) => fn(),
    setTimeout,
    clearTimeout,
    URL
  };
  sandbox.globalThis = sandbox;

  const code = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'content.js'),
    'utf8'
  );
  vm.runInNewContext(code, sandbox);

  return { doc, win, chrome, storageState, runtimeListeners };
}

test('YouTube feed hides only GTA 6 cards and leaves other videos visible', () => {
  const { doc } = runContentScript({
    url: 'https://www.youtube.com/',
    title: 'YouTube',
    setupDom(doc) {
      const grid = doc.createElement('ytd-rich-grid-renderer');
      const v1 = doc.createElement('ytd-rich-item-renderer');
      v1.id = 'v1';
      v1.textContent = 'Gameplay completa de GTA 6 vazada!';

      const v2 = doc.createElement('ytd-rich-item-renderer');
      v2.id = 'v2';
      v2.textContent = 'Receita fácil de pão caseiro';

      const v3 = doc.createElement('yt-lockup-view-model');
      v3.id = 'v3';
      v3.textContent = 'Novidades da Rockstar Games hoje';

      grid.appendChild(v1);
      grid.appendChild(v2);
      grid.appendChild(v3);
      doc.body.appendChild(grid);
    }
  });

  const v1 = doc.getElementById('v1');
  const v2 = doc.getElementById('v2');
  const v3 = doc.getElementById('v3');

  assert.equal(v1.classList.contains('gta6sf-hidden'), true);
  assert.equal(v2.classList.contains('gta6sf-hidden'), false);
  assert.equal(v3.classList.contains('gta6sf-hidden'), true);
});

test('Reddit nested comments hide only the spoiler reply and preserve parent thread', () => {
  const { doc } = runContentScript({
    url: 'https://www.reddit.com/r/games/',
    title: 'r/games',
    setupDom(doc) {
      const parent = doc.createElement('shreddit-comment');
      parent.id = 'parent-comment';
      const parentBody = doc.createElement('p');
      parentBody.textContent = 'Qual jogo vocês estão jogando esse mês?';
      parent.appendChild(parentBody);

      const childSpoiler = doc.createElement('shreddit-comment');
      childSpoiler.id = 'child-spoiler';
      const childBody = doc.createElement('p');
      childBody.textContent = 'Estou evitando spoilers de GTA VI por aqui!';
      childSpoiler.appendChild(childBody);

      parent.appendChild(childSpoiler);
      doc.body.appendChild(parent);
    }
  });

  const parent = doc.getElementById('parent-comment');
  const child = doc.getElementById('child-spoiler');

  assert.equal(parent.classList.contains('gta6sf-hidden'), false);
  assert.equal(child.classList.contains('gta6sf-hidden'), true);
});

test('Generic news site hides article card with spoiler URL even without GTA 6 in text', () => {
  const { doc } = runContentScript({
    url: 'https://noticias.example.com/',
    title: 'Portal de Notícias',
    setupDom(doc) {
      const main = doc.createElement('main');

      const card1 = doc.createElement('article');
      card1.id = 'spoiler-card';
      const link1 = doc.createElement('a');
      link1.setAttribute('href', 'https://noticias.example.com/games/gta-6-ending-leaked');
      link1.textContent = 'Você não vai acreditar nesse final!';
      card1.appendChild(link1);

      const card2 = doc.createElement('article');
      card2.id = 'safe-card';
      const link2 = doc.createElement('a');
      link2.setAttribute('href', 'https://noticias.example.com/tech/novo-cpu');
      link2.textContent = 'Novo processador chega ao mercado';
      card2.appendChild(link2);

      main.appendChild(card1);
      main.appendChild(card2);
      doc.body.appendChild(main);
    }
  });

  assert.equal(doc.getElementById('spoiler-card').classList.contains('gta6sf-hidden'), true);
  assert.equal(doc.getElementById('safe-card').classList.contains('gta6sf-hidden'), false);
});

test('Blur mode blurs card and reveals it when badge is clicked', () => {
  const { doc } = runContentScript({
    url: 'https://x.com/home',
    title: 'Home / X',
    storedSettings: { mode: 'blur' },
    setupDom(doc) {
      const tweet = doc.createElement('article');
      tweet.id = 'tweet-1';
      tweet.setAttribute('data-testid', 'tweet');
      tweet.textContent = 'Olha essa cena de #GTA6!';
      doc.body.appendChild(tweet);
    }
  });

  const tweet = doc.getElementById('tweet-1');
  assert.equal(tweet.classList.contains('gta6sf-blurred'), true);

  const badge = tweet.querySelector('.gta6sf-blur-badge');
  assert.ok(badge, 'Expected blur badge inside blurred tweet');
  badge.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });

  assert.equal(tweet.classList.contains('gta6sf-blurred'), false);
  assert.equal(tweet.dataset.gta6sfRevealed, '1');
});

test('Full-page shield blocks GTA 6 video page, pauses/mutes video, and hides title text', () => {
  const secretTitle = 'GTA 6 - O FINAL SECRETO REVELADO';
  const { doc } = runContentScript({
    url: 'https://www.youtube.com/watch?v=abc12345678',
    title: secretTitle + ' - YouTube',
    setupDom(doc) {
      const video = doc.createElement('video');
      video.id = 'player';
      doc.body.appendChild(video);
    }
  });

  const shield = doc.getElementById('gta6sf-page-shield');
  assert.ok(shield, 'Expected full-page shield overlay');
  assert.equal(shield.textContent.includes('O FINAL SECRETO REVELADO'), false);

  const video = doc.getElementById('player');
  assert.equal(video.paused, true);
  assert.equal(video.muted, true);

  const bypassBtn = shield.querySelector('.gta6sf-btn-secondary');
  assert.ok(bypassBtn);
  bypassBtn.dispatchEvent({ type: 'click' });
  assert.equal(doc.getElementById('gta6sf-page-shield'), null);
});

test('Whitelisted domain does not block GTA 6 content', () => {
  const { doc } = runContentScript({
    url: 'https://www.youtube.com/',
    title: 'GTA 6 - YouTube',
    storedSettings: { whitelistedDomains: ['youtube.com'] },
    setupDom(doc) {
      const v1 = doc.createElement('ytd-rich-item-renderer');
      v1.id = 'v1';
      v1.textContent = 'GTA 6 trailer';
      doc.body.appendChild(v1);
    }
  });

  assert.equal(doc.getElementById('gta6sf-page-shield'), null);
  assert.equal(doc.getElementById('v1').classList.contains('gta6sf-hidden'), false);
});

test('News homepage hero H1 hides only the hero card instead of shielding entire site', () => {
  const { doc } = runContentScript({
    url: 'https://portal-games.example.com/',
    title: 'Portal Games - Notícias',
    setupDom(doc) {
      const main = doc.createElement('main');

      const hero = doc.createElement('article');
      hero.id = 'hero-article';
      const h1 = doc.createElement('h1');
      h1.textContent = 'GTA 6 ganha novidade';
      hero.appendChild(h1);

      const other = doc.createElement('article');
      other.id = 'safe-article';
      other.textContent = 'Novo jogo indie faz sucesso';

      main.appendChild(hero);
      main.appendChild(other);
      doc.body.appendChild(main);
    }
  });

  assert.equal(doc.getElementById('gta6sf-page-shield'), null);
  assert.equal(doc.getElementById('hero-article').classList.contains('gta6sf-hidden'), true);
  assert.equal(doc.getElementById('safe-article').classList.contains('gta6sf-hidden'), false);
});

test('Single article page with H1 mentioning GTA 6 activates full-page shield', () => {
  const { doc } = runContentScript({
    url: 'https://portal-games.example.com/artigo/12345',
    title: 'Portal Games',
    setupDom(doc) {
      const main = doc.createElement('main');
      const art = doc.createElement('article');
      const h1 = doc.createElement('h1');
      h1.textContent = 'Análise completa de GTA VI';
      art.appendChild(h1);
      main.appendChild(art);
      doc.body.appendChild(main);
    }
  });

  assert.ok(doc.getElementById('gta6sf-page-shield'));
});

test('Brave Search hides only GTA 6 snippets', () => {
  const { doc } = runContentScript({
    url: 'https://search.brave.com/search?q=lancamentos+games',
    title: 'lancamentos games - Brave Search',
    setupDom(doc) {
      const r1 = doc.createElement('div');
      r1.id = 'brave-r1';
      r1.className = 'snippet';
      r1.setAttribute('data-pos', '0');
      r1.textContent = 'Tudo sobre o lançamento de GTA 6';

      const r2 = doc.createElement('div');
      r2.id = 'brave-r2';
      r2.className = 'snippet';
      r2.setAttribute('data-pos', '1');
      r2.textContent = 'Lançamentos indie de novembro';

      doc.body.appendChild(r1);
      doc.body.appendChild(r2);
    }
  });

  assert.equal(doc.getElementById('brave-r1').classList.contains('gta6sf-hidden'), true);
  assert.equal(doc.getElementById('brave-r2').classList.contains('gta6sf-hidden'), false);
});

test('Hides vague news card when image src filename contains GTA 6 slug', () => {
  const { doc } = runContentScript({
    url: 'https://portal-games.example.com/',
    title: 'Portal Games',
    setupDom(doc) {
      const card = doc.createElement('article');
      card.id = 'vague-card';
      const img = doc.createElement('img');
      img.setAttribute('src', 'https://cdn.example.com/uploads/gta-6-vazamento.webp');
      const h2 = doc.createElement('h2');
      h2.textContent = 'Você precisa ver essa imagem!';
      card.appendChild(img);
      card.appendChild(h2);
      doc.body.appendChild(card);
    }
  });

  assert.equal(doc.getElementById('vague-card').classList.contains('gta6sf-hidden'), true);
});

test('Blocks embedded iframe with GTA 6 title on a safe article', () => {
  const { doc } = runContentScript({
    url: 'https://blog.example.com/resumo-da-semana',
    title: 'Resumo da Semana',
    setupDom(doc) {
      const p = doc.createElement('p');
      p.textContent = 'Veja os destaques da semana em tecnologia.';
      const iframe = doc.createElement('iframe');
      iframe.id = 'spoiler-embed';
      iframe.setAttribute('title', 'Trailer de GTA 6 em 4K');
      iframe.setAttribute('src', 'https://www.youtube.com/embed/xyz12345678');
      doc.body.appendChild(p);
      doc.body.appendChild(iframe);
    }
  });

  assert.equal(doc.getElementById('gta6sf-page-shield'), null);
  assert.equal(doc.getElementById('spoiler-embed').classList.contains('gta6sf-hidden'), true);
});

test('Activates full-page shield via og:title meta tag on non-SPA detail page and blocks late video play', () => {
  const { doc } = runContentScript({
    url: 'https://blog.example.com/post/9988',
    title: 'Blog Exemplo',
    setupDom(doc) {
      const meta = doc.createElement('meta');
      meta.setAttribute('property', 'og:title');
      meta.setAttribute('content', 'Análise de GTA 6');
      doc.head.appendChild(meta);
    }
  });

  assert.ok(doc.getElementById('gta6sf-page-shield'));

  const lateVideo = doc.createElement('video');
  lateVideo.paused = false;
  lateVideo.muted = false;
  doc.dispatchEvent({ type: 'play', target: lateVideo });
  assert.equal(lateVideo.paused, true);
  assert.equal(lateVideo.muted, true);
});
