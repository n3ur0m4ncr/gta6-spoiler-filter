(function () {
  'use strict';

  const Matcher = globalThis.GTA6SpoilerMatcher;
  if (!Matcher) return;

  const SITE_ITEM_SELECTORS = [
    // YouTube
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'yt-lockup-view-model',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytm-shorts-lockup-view-model',
    'ytd-reel-video-renderer',
    'ytd-channel-renderer',
    'ytd-movie-renderer',
    'ytd-radio-renderer',
    'ytd-compact-radio-renderer',
    'ytd-comment-thread-renderer',
    'ytd-comment-view-model',
    'ytd-notification-renderer',
    'ytd-search-refinement-card-renderer',
    'yt-chip-cloud-chip-renderer',
    'ytd-video-preview',
    'ytd-miniplayer',
    'ytd-compact-link-renderer',
    'tp-yt-paper-item',
    // X / Twitter
    'article[data-testid="tweet"]',
    '[data-testid="trend"]',
    '[data-testid="UserCell"]',
    '[data-testid="notification"]',
    // Reddit
    'shreddit-post',
    'shreddit-comment',
    'faceplate-tracker[source="search"]',
    '.thing.link',
    '.thing.comment',
    // Google Search / News
    'div.tF2Cxc',
    'div.g',
    'g-card',
    'g-inner-card',
    'div.SoaBEf',
    'div.WlydOe',
    'li.sbct',
    // Brave Search
    'div.snippet[data-pos]',
    'div.snippet[data-type]',
    'div.video-snippet',
    'div.news-snippet',
    // TikTok
    '[data-e2e="recommend-list-item-container"]',
    '[data-e2e="search_video-item"]',
    // Twitch
    '[data-a-target="search-result-card"]',
    'div[data-target="directory-first-item"]',
    // Discord / Telegram / WhatsApp Web
    'li[id^="chat-messages-"]',
    'div.Message',
    'div.message-in',
    'div.message-out',
    // Facebook
    'div[data-pagelet^="FeedUnit"]',
    // Threads / Bluesky
    '[data-testid="postThreadItem"]',
    '[data-testid^="feedItem"]'
  ].join(', ');

  const SEMANTIC_ITEM_SELECTORS = [
    'article',
    '[role="article"]',
    '[role="listitem"]',
    '[role="option"]',
    '[role="menuitem"]',
    'li',
    'figure',
    'tr'
  ].join(', ');

  const CANDIDATE_LEAF_SELECTORS = [
    SITE_ITEM_SELECTORS,
    'article',
    '[role="article"]',
    '[role="option"]',
    '[role="menuitem"]',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'p',
    'a[href]',
    'img[alt]',
    'img[src]',
    'iframe[src]',
    'iframe[title]',
    'video[title]',
    'video[aria-label]',
    'yt-formatted-string',
    'span[dir="auto"]',
    '[aria-label]',
    '[title]'
  ].join(', ');

  const FORBIDDEN_TAGS = new Set([
    'HTML',
    'BODY',
    'HEAD',
    'MAIN',
    'HEADER',
    'NAV',
    'FOOTER',
    'ASIDE',
    'YTD-APP',
    'YTD-BROWSE',
    'YTD-PAGE-MANAGER',
    'YTD-WATCH-FLEXY',
    'YTD-TWO-COLUMN-BROWSE-RESULTS-RENDERER',
    'YTD-RICH-GRID-RENDERER',
    'YTD-SECTION-LIST-RENDERER',
    'YTD-ITEM-SECTION-RENDERER',
    'SHREDDIT-APP'
  ]);

  const FORBIDDEN_IDS = new Set([
    'app',
    'root',
    '__next',
    'content',
    'contents',
    'page-manager',
    'primary',
    'secondary',
    'search',
    'rso',
    'center_col',
    'react-root',
    'gta6sf-page-shield'
  ]);

  const CARD_CLASS_HINT_RE =
    /\b(card|post|item|story|news|teaser|article|tile|entry|video|thread|result|feed|bento|clip|reel|short|tweet|comment|snippet|cellinnerdiv)\b/i;

  let settings = Matcher.sanitizeSettings(Matcher.DEFAULT_SETTINGS);
  let matcher = Matcher.createMatcher(settings);
  let storageReady = false;
  let observer = null;
  let headObserver = null;
  let scanScheduled = false;
  let pendingRoots = new Set();
  let lastObservedUrl = location.href;
  let pageBypassedForUrl = null;
  let tabBlockedCount = 0;
  let pendingStorageIncrement = 0;
  let storageFlushTimer = null;
  const countedElements = new WeakSet();

  function isActiveForCurrentSite() {
    if (!settings.enabled) return false;
    return !Matcher.isDomainWhitelisted(location.hostname, settings.whitelistedDomains);
  }

  function isForbiddenWrapper(el) {
    if (!el || el.nodeType !== 1) return true;
    if (FORBIDDEN_TAGS.has(el.tagName)) return true;
    if (el.id && FORBIDDEN_IDS.has(el.id)) return true;
    const role = el.getAttribute('role');
    if (role === 'main' || role === 'banner' || role === 'navigation') return true;
    if (el.id === 'gta6sf-page-shield' || el.closest('#gta6sf-page-shield')) return true;
    return false;
  }

  function collectTextExcludingCode(root, maxLength = 2500) {
    if (!root) return '';
    let out = '';
    const stack = [root];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;

      if (node.nodeType === 3) {
        const val = node.nodeValue;
        if (val && val.trim()) {
          out += val + ' ';
          if (out.length >= maxLength) return out;
        }
      } else if (node.nodeType === 1) {
        const tag = node.tagName;
        if (
          tag === 'SCRIPT' ||
          tag === 'STYLE' ||
          tag === 'NOSCRIPT' ||
          tag === 'SVG' ||
          tag === 'TEMPLATE'
        ) {
          continue;
        }
        // Avoid bleeding nested Reddit/YouTube comment replies into parent comment text
        if (
          node !== root &&
          (tag === 'SHREDDIT-COMMENT' || tag === 'YTD-COMMENT-THREAD-RENDERER')
        ) {
          continue;
        }
        const children = node.childNodes;
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push(children[i]);
        }
      }
    }

    return out;
  }

  function isSafeCardContainer(el) {
    if (isForbiddenWrapper(el)) return false;

    const multiItems = el.querySelectorAll(
      'article, [role="article"], ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, shreddit-post'
    );
    if (multiItems.length > 1) return false;

    const textLen = collectTextExcludingCode(el, 2201).length;
    if (textLen > 2200) return false;

    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        if (rect.width > vw * 0.9 && rect.height > Math.max(850, vh * 0.85)) {
          return false;
        }
      }
    }

    return true;
  }

  function findBestContainer(el) {
    if (!el || el.nodeType !== 1 || isForbiddenWrapper(el)) return null;

    const siteItem = el.closest(SITE_ITEM_SELECTORS);
    if (siteItem && !isForbiddenWrapper(siteItem)) {
      return siteItem;
    }

    const semanticItem = el.closest(SEMANTIC_ITEM_SELECTORS);
    if (semanticItem && isSafeCardContainer(semanticItem)) {
      return semanticItem;
    }

    let bestBounded = null;
    let curr = el;
    for (let depth = 0; depth < 6 && curr; depth++) {
      if (isForbiddenWrapper(curr)) break;
      const cls = typeof curr.className === 'string' ? curr.className : '';
      const isCardLike =
        curr.tagName === 'A' ||
        CARD_CLASS_HINT_RE.test(cls) ||
        curr.hasAttribute('data-testid');

      if (isCardLike && isSafeCardContainer(curr)) {
        bestBounded = curr;
      }
      curr = curr.parentElement;
    }
    if (bestBounded) return bestBounded;

    const fallback = el.closest('a, h1, h2, h3, h4, h5, p, li, figure') || el;
    return isForbiddenWrapper(fallback) ? null : fallback;
  }

  function inspectElementMatch(el) {
    if (!el || el.nodeType !== 1) return null;

    // 1. Direct attributes on the element
    const attrNames = ['aria-label', 'title', 'alt', 'post-title', 'data-title'];
    for (const attr of attrNames) {
      const val = el.getAttribute(attr);
      if (val) {
        const m = matcher.matchText(val);
        if (m) return m;
      }
    }

    // 2. Direct link / media / embed URL check
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href) {
        const m = matcher.matchUrl(href);
        if (m) return m;
      }
    }
    if (el.tagName === 'IMG' || el.tagName === 'IFRAME' || el.tagName === 'VIDEO') {
      const src = el.getAttribute('src');
      if (src) {
        const m = matcher.matchUrl(src);
        if (m) return m;
      }
    }

    // 3. Visible text content (without layout reflow)
    const text = collectTextExcludingCode(el);
    if (text) {
      const m = matcher.matchText(text);
      if (m) return m;
    }

    // 4. Child attributes inside known item containers (alt text, URLs, aria-labels, media src)
    const attrNodes = el.querySelectorAll(
      'a[href], img[alt], img[src], iframe[src], [aria-label], [title]'
    );
    const isCommentRoot =
      el.tagName === 'SHREDDIT-COMMENT' || el.tagName === 'YTD-COMMENT-THREAD-RENDERER';
    for (let i = 0; i < attrNodes.length && i < 25; i++) {
      const child = attrNodes[i];
      if (isCommentRoot) {
        const ownerComment = child.closest('shreddit-comment, ytd-comment-thread-renderer');
        if (ownerComment && ownerComment !== el) continue;
      }
      const href = child.getAttribute('href');
      if (href) {
        const m = matcher.matchUrl(href);
        if (m) return m;
      }
      const src = child.getAttribute('src');
      if (src) {
        const m = matcher.matchUrl(src);
        if (m) return m;
      }
      const alt =
        child.getAttribute('alt') ||
        child.getAttribute('aria-label') ||
        child.getAttribute('title');
      if (alt) {
        const m = matcher.matchText(alt);
        if (m) return m;
      }
    }

    return null;
  }

  function pauseAndMuteMediaInside(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const mediaList = root.querySelectorAll('video, audio');
    for (const media of mediaList) {
      try {
        media.muted = true;
        if (!media.paused) media.pause();
      } catch (_) {
        // Ignore cross-origin or browser autoplay restrictions
      }
    }
  }

  function recordBlockedCount(el) {
    if (!el || countedElements.has(el)) return;
    countedElements.add(el);
    tabBlockedCount += 1;
    pendingStorageIncrement += 1;

    if (!storageFlushTimer) {
      storageFlushTimer = setTimeout(() => {
        storageFlushTimer = null;
        const delta = pendingStorageIncrement;
        pendingStorageIncrement = 0;
        if (delta > 0 && chrome?.storage?.local) {
          chrome.storage.local.get({ blockedTotal: 0 }, (res) => {
            const next = (Number(res.blockedTotal) || 0) + delta;
            settings.blockedTotal = next;
            chrome.storage.local.set({ blockedTotal: next });
          });
        }
      }, 600);
    }
  }

  function removeBlurBadge(el) {
    const existing = el.querySelector(':scope > .gta6sf-blur-badge');
    if (existing) existing.remove();
  }

  function clearBlock(el) {
    if (!el) return;
    el.classList.remove('gta6sf-hidden', 'gta6sf-blurred');
    removeBlurBadge(el);
    delete el.dataset.gta6sfBlocked;
    delete el.dataset.gta6sfMode;
  }

  function applyBlock(container, reason) {
    if (!container || isForbiddenWrapper(container)) return;
    if (container.dataset.gta6sfRevealed === '1') return;

    const targetMode = settings.mode === 'blur' ? 'blur' : 'hide';
    if (
      container.dataset.gta6sfBlocked === '1' &&
      container.dataset.gta6sfMode === targetMode
    ) {
      return;
    }

    clearBlock(container);
    container.dataset.gta6sfBlocked = '1';
    container.dataset.gta6sfMode = targetMode;

    pauseAndMuteMediaInside(container);

    if (targetMode === 'blur') {
      container.classList.add('gta6sf-blurred');
      const badge = document.createElement('div');
      badge.className = 'gta6sf-blur-badge';
      badge.title = 'Clique para revelar este item';

      const inner = document.createElement('span');
      inner.className = 'gta6sf-blur-badge-inner';
      inner.textContent = `Spoiler bloqueado (${reason}) • Clique para revelar`;
      badge.appendChild(inner);

      badge.addEventListener(
        'click',
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          container.dataset.gta6sfRevealed = '1';
          clearBlock(container);
        },
        true
      );

      container.appendChild(badge);
    } else {
      container.classList.add('gta6sf-hidden');
    }

    recordBlockedCount(container);
  }

  function removeEarlyHideStyle() {
    const el = document.getElementById('gta6sf-early-hide');
    if (el) el.remove();
  }

  function ensureEarlyHideStyle() {
    if (document.getElementById('gta6sf-early-hide')) return;
    const target = document.head || document.documentElement;
    if (!target) return;
    const style = document.createElement('style');
    style.id = 'gta6sf-early-hide';
    style.textContent = 'html { visibility: hidden !important; }';
    target.appendChild(style);
  }

  function removePageShield() {
    const existing = document.getElementById('gta6sf-page-shield');
    if (existing) existing.remove();
  }

  function mountPageShield(sourceLabel) {
    if (document.getElementById('gta6sf-page-shield')) return;
    const host = document.body || document.documentElement;
    if (!host) return;

    pauseAndMuteMediaInside(document);

    const overlay = document.createElement('div');
    overlay.id = 'gta6sf-page-shield';

    const card = document.createElement('div');
    card.className = 'gta6sf-shield-card';

    const icon = document.createElement('div');
    icon.className = 'gta6sf-shield-icon';
    icon.textContent = '🛡️';

    const heading = document.createElement('h1');
    heading.textContent = 'Possível spoiler de GTA 6 bloqueado';

    const desc = document.createElement('p');
    desc.textContent =
      'O Escudo Anti-Spoiler detectou uma referência a GTA 6 nesta página e ocultou o conteúdo para proteger você.';

    const reasonPill = document.createElement('div');
    reasonPill.className = 'gta6sf-shield-reason';
    reasonPill.textContent = `Detectado em: ${sourceLabel}`;

    const actions = document.createElement('div');
    actions.className = 'gta6sf-shield-actions';

    if (window.top === window.self) {
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'gta6sf-btn-primary';
      backBtn.textContent = 'Voltar para página segura';
      backBtn.addEventListener('click', () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.replace('about:blank');
        }
      });
      actions.appendChild(backBtn);
    }

    const bypassBtn = document.createElement('button');
    bypassBtn.type = 'button';
    bypassBtn.className = 'gta6sf-btn-secondary';
    bypassBtn.textContent = 'Mostrar página mesmo assim';
    bypassBtn.addEventListener('click', () => {
      pageBypassedForUrl = location.href;
      removePageShield();
    });
    actions.appendChild(bypassBtn);

    card.appendChild(icon);
    card.appendChild(heading);
    card.appendChild(desc);
    card.appendChild(reasonPill);
    card.appendChild(actions);
    overlay.appendChild(card);

    host.appendChild(overlay);
    removeEarlyHideStyle();
  }

  function isKnownSpaHost(hostname) {
    return /(^|\.)(youtube\.com|youtu\.be|x\.com|twitter\.com|reddit\.com|instagram\.com|tiktok\.com|facebook\.com|twitch\.tv|threads\.net|bsky\.app)$/i.test(
      hostname || ''
    );
  }

  function findPrimaryPageMatch() {
    if (matcher.matchUrl(location.href)) {
      return 'URL da página';
    }
    if (document.title && matcher.matchText(document.title)) {
      return 'Título da aba';
    }

    const dedicatedDetailHeadingSelectors = [
      'ytd-watch-metadata h1',
      '#above-the-fold #title h1'
    ];
    for (const sel of dedicatedDetailHeadingSelectors) {
      const h1 = document.querySelector(sel);
      if (h1 && !h1.closest('nav, header, aside')) {
        const text = collectTextExcludingCode(h1, 400);
        if (text && matcher.matchText(text)) {
          return 'Título principal';
        }
      }
    }

    // Only check generic main/article H1 and meta tags on single-article non-SPA pages
    const isDetailPath = location.pathname && location.pathname !== '/';
    const articleCount = document.querySelectorAll('article').length;
    if (isDetailPath && articleCount <= 2) {
      if (!isKnownSpaHost(location.hostname)) {
        const metaSelectors = [
          'meta[property="og:title"]',
          'meta[name="twitter:title"]',
          'meta[name="keywords"]'
        ];
        for (const metaSel of metaSelectors) {
          const meta = document.querySelector(metaSel);
          const content = meta && meta.getAttribute('content');
          if (content && matcher.matchText(content)) {
            return 'Metadados da página';
          }
        }
      }

      const genericHeadingSelectors = [
        'shreddit-post[permalink] h1',
        'main h1',
        'article h1',
        '[role="main"] h1'
      ];
      for (const sel of genericHeadingSelectors) {
        const h1 = document.querySelector(sel);
        if (h1 && !h1.closest('nav, header, aside')) {
          const text = collectTextExcludingCode(h1, 400);
          if (text && matcher.matchText(text)) {
            return 'Título principal';
          }
        }
      }
    }

    return null;
  }

  function checkPageLevelProtection({ early = false } = {}) {
    if (!isActiveForCurrentSite() || !settings.protectFullPage) {
      removeEarlyHideStyle();
      removePageShield();
      return false;
    }

    if (pageBypassedForUrl === location.href) {
      removeEarlyHideStyle();
      removePageShield();
      return false;
    }

    const matchSource = findPrimaryPageMatch();
    if (matchSource) {
      if (early && !document.body) {
        ensureEarlyHideStyle();
      } else {
        mountPageShield(matchSource);
      }
      return true;
    }

    if (storageReady) {
      removeEarlyHideStyle();
      removePageShield();
    }
    return false;
  }

  function scanSubtree(root) {
    if (!root || !isActiveForCurrentSite()) return;

    if (root.nodeType === 1) {
      if (root.id === 'gta6sf-page-shield') return;
      if (root.matches && root.matches(SITE_ITEM_SELECTORS)) {
        const match = inspectElementMatch(root);
        if (match) {
          applyBlock(root, match.reason);
          return;
        } else if (root.dataset.gta6sfBlocked === '1') {
          clearBlock(root);
        }
      }
    }

    if (typeof root.querySelectorAll !== 'function') return;

    const checkedContainers = new Set();
    const candidates = root.querySelectorAll(CANDIDATE_LEAF_SELECTORS);

    for (const el of candidates) {
      if (el.closest('#gta6sf-page-shield')) continue;

      const container = findBestContainer(el);
      if (!container || checkedContainers.has(container)) continue;

      // Skip deep children if a parent item container is already blocked
      if (
        container.dataset.gta6sfBlocked === '1' &&
        container.dataset.gta6sfMode === (settings.mode === 'blur' ? 'blur' : 'hide') &&
        !container.matches(SITE_ITEM_SELECTORS)
      ) {
        checkedContainers.add(container);
        continue;
      }

      checkedContainers.add(container);

      const match = inspectElementMatch(container);
      if (match) {
        applyBlock(container, match.reason);
      } else if (container.dataset.gta6sfBlocked === '1') {
        clearBlock(container);
      }
    }
  }

  function flushPendingScans() {
    scanScheduled = false;

    if (location.href !== lastObservedUrl) {
      lastObservedUrl = location.href;
      pageBypassedForUrl = null;
      if (isActiveForCurrentSite()) {
        pendingRoots.add(document.body || document.documentElement);
      }
    }

    if (!isActiveForCurrentSite()) {
      pendingRoots.clear();
      return;
    }

    checkPageLevelProtection({ early: !storageReady });

    const roots = Array.from(pendingRoots);
    pendingRoots.clear();

    for (const root of roots) {
      if (root && root.isConnected) {
        scanSubtree(root);
      }
    }
  }

  function scheduleScan(root) {
    if (!root || !isActiveForCurrentSite()) return;
    pendingRoots.add(root);
    if (!scanScheduled) {
      scanScheduled = true;
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(flushPendingScans);
      } else {
        Promise.resolve().then(flushPendingScans);
      }
    }
  }

  function clearAllBlocks() {
    removeEarlyHideStyle();
    removePageShield();
    const blocked = document.querySelectorAll('[data-gta6sf-blocked="1"]');
    for (const el of blocked) {
      clearBlock(el);
      delete el.dataset.gta6sfRevealed;
    }
  }

  function reevaluatePage() {
    matcher = Matcher.createMatcher(settings);
    if (!isActiveForCurrentSite()) {
      clearAllBlocks();
      return;
    }

    // Re-evaluate previously blocked items in case mode or keywords changed
    const blocked = document.querySelectorAll('[data-gta6sf-blocked="1"]');
    for (const el of blocked) {
      const m = inspectElementMatch(el);
      if (m) {
        applyBlock(el, m.reason);
      } else {
        clearBlock(el);
      }
    }

    checkPageLevelProtection({ early: !storageReady });
    if (document.body) {
      scanSubtree(document.body);
    }
  }

  function startHeadObserver() {
    if (headObserver || !document.head) return;
    headObserver = new MutationObserver(() => {
      checkPageLevelProtection({ early: !storageReady });
    });
    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function startObservers() {
    if (!observer && document.documentElement) {
      observer = new MutationObserver((mutations) => {
        if (!isActiveForCurrentSite()) return;

        for (const mut of mutations) {
          if (mut.type === 'childList') {
            for (const added of mut.addedNodes) {
              if (added.nodeType === 1) {
                scheduleScan(added);
              } else if (added.nodeType === 3 && mut.target?.nodeType === 1) {
                scheduleScan(mut.target);
              }
            }
          } else if (mut.type === 'characterData') {
            const parent = mut.target?.parentElement;
            if (parent) {
              const siteItem = parent.closest(SITE_ITEM_SELECTORS);
              scheduleScan(siteItem || parent);
            }
          } else if (mut.type === 'attributes' && mut.target?.nodeType === 1) {
            const siteItem = mut.target.closest(SITE_ITEM_SELECTORS);
            scheduleScan(siteItem || mut.target);
          }
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'alt', 'href', 'src', 'post-title']
      });
    }

    startHeadObserver();
  }

  function handleSpaNavigation() {
    if (location.href !== lastObservedUrl) {
      lastObservedUrl = location.href;
      pageBypassedForUrl = null;
    }
    checkPageLevelProtection({ early: !storageReady });
    if (document.body) {
      scheduleScan(document.body);
    }
  }

  function init() {
    // Immediate URL guard at document_start before storage responds
    checkPageLevelProtection({ early: true });
    startObservers();

    if (chrome?.storage?.local) {
      chrome.storage.local.get(Matcher.DEFAULT_SETTINGS, (stored) => {
        storageReady = true;
        settings = Matcher.sanitizeSettings(stored);
        matcher = Matcher.createMatcher(settings);
        reevaluatePage();
      });

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const next = { ...settings };
        let meaningfulChange = false;
        for (const [key, diff] of Object.entries(changes)) {
          if (key in Matcher.DEFAULT_SETTINGS) {
            next[key] = diff.newValue;
            if (key !== 'blockedTotal') meaningfulChange = true;
          }
        }
        settings = Matcher.sanitizeSettings(next);
        if (meaningfulChange) {
          reevaluatePage();
        }
      });
    } else {
      storageReady = true;
    }

    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.type === 'GET_TAB_STATS') {
          sendResponse({
            hostname: location.hostname,
            tabBlockedCount,
            whitelisted: Matcher.isDomainWhitelisted(
              location.hostname,
              settings.whitelistedDomains
            )
          });
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          startObservers();
          reevaluatePage();
        },
        { once: true }
      );
    } else {
      startObservers();
      reevaluatePage();
    }

    document.addEventListener(
      'play',
      (ev) => {
        const media = ev && ev.target;
        if (!media) return;
        const shielded =
          Boolean(document.getElementById('gta6sf-page-shield')) ||
          (typeof media.closest === 'function' && Boolean(media.closest('.gta6sf-hidden')));
        if (shielded) {
          try {
            media.muted = true;
            media.pause();
          } catch (_) {
            // Ignore playback restriction errors
          }
        }
      },
      true
    );

    window.addEventListener('popstate', handleSpaNavigation);
    window.addEventListener('hashchange', handleSpaNavigation);
    window.addEventListener('yt-navigate-finish', handleSpaNavigation);
    window.addEventListener('yt-page-data-updated', handleSpaNavigation);
  }

  init();
})();
