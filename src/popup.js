(function () {
  'use strict';

  const Matcher = globalThis.GTA6SpoilerMatcher;
  if (!Matcher) return;

  const els = {
    enabled: document.getElementById('toggle-enabled'),
    tabCount: document.getElementById('tab-count'),
    totalCount: document.getElementById('total-count'),
    modeHide: document.getElementById('mode-hide'),
    modeBlur: document.getElementById('mode-blur'),
    strict: document.getElementById('toggle-strict'),
    anyGta: document.getElementById('toggle-any-gta'),
    fullpage: document.getElementById('toggle-fullpage'),
    sitePanel: document.getElementById('site-panel'),
    siteHostname: document.getElementById('site-hostname'),
    btnWhitelist: document.getElementById('btn-whitelist'),
    customKeywords: document.getElementById('custom-keywords'),
    btnSaveKeywords: document.getElementById('btn-save-keywords'),
    saveStatus: document.getElementById('save-status'),
    subtitle: document.querySelector('.subtitle')
  };

  let settings = Matcher.sanitizeSettings(Matcher.DEFAULT_SETTINGS);
  let activeHostname = '';

  function render() {
    els.enabled.checked = settings.enabled;
    els.subtitle.textContent = settings.enabled
      ? 'Filtro anti-spoilers ativo'
      : 'Filtro pausado';

    els.totalCount.textContent = String(settings.blockedTotal || 0);
    els.modeHide.classList.toggle('active', settings.mode === 'hide');
    els.modeBlur.classList.toggle('active', settings.mode === 'blur');
    els.strict.checked = settings.strictMode;
    els.anyGta.checked = settings.blockAnyGta;
    els.fullpage.checked = settings.protectFullPage;

    if (activeHostname) {
      els.sitePanel.hidden = false;
      const whitelisted = Matcher.isDomainWhitelisted(
        activeHostname,
        settings.whitelistedDomains
      );
      els.siteHostname.textContent = activeHostname;
      els.btnWhitelist.textContent = whitelisted
        ? 'Reativar neste site'
        : 'Pausar neste site';
    } else {
      els.sitePanel.hidden = true;
    }
  }

  function savePartial(patch, onDone) {
    settings = Matcher.sanitizeSettings({ ...settings, ...patch });
    render();
    chrome.storage.local.set(patch, () => {
      if (typeof onDone === 'function') onDone();
    });
  }

  function loadActiveTabStats() {
    if (!chrome?.tabs?.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== 'number') return;

      chrome.tabs.sendMessage(tab.id, { type: 'GET_TAB_STATS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          els.tabCount.textContent = '—';
          return;
        }
        els.tabCount.textContent = String(res.tabBlockedCount ?? 0);
        if (res.hostname) {
          activeHostname = res.hostname;
          render();
        }
      });
    });
  }

  function init() {
    chrome.storage.local.get(Matcher.DEFAULT_SETTINGS, (stored) => {
      settings = Matcher.sanitizeSettings(stored);
      els.customKeywords.value = settings.customKeywords.join('\n');
      render();
      loadActiveTabStats();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.blockedTotal) {
        settings.blockedTotal = Number(changes.blockedTotal.newValue) || 0;
        els.totalCount.textContent = String(settings.blockedTotal);
      }
    });

    els.enabled.addEventListener('change', () => {
      savePartial({ enabled: els.enabled.checked });
    });

    els.modeHide.addEventListener('click', () => {
      savePartial({ mode: 'hide' });
    });

    els.modeBlur.addEventListener('click', () => {
      savePartial({ mode: 'blur' });
    });

    els.strict.addEventListener('change', () => {
      savePartial({ strictMode: els.strict.checked });
    });

    els.anyGta.addEventListener('change', () => {
      savePartial({ blockAnyGta: els.anyGta.checked });
    });

    els.fullpage.addEventListener('change', () => {
      savePartial({ protectFullPage: els.fullpage.checked });
    });

    els.btnWhitelist.addEventListener('click', () => {
      if (!activeHostname) return;
      const cleanHost = Matcher.normalizeText(activeHostname).replace(/^www\./, '');
      const isListed = Matcher.isDomainWhitelisted(
        activeHostname,
        settings.whitelistedDomains
      );
      let nextList;
      if (isListed) {
        nextList = settings.whitelistedDomains.filter(
          (d) => !(cleanHost === d || cleanHost.endsWith('.' + d))
        );
      } else {
        nextList = [...settings.whitelistedDomains, cleanHost];
      }
      savePartial({ whitelistedDomains: nextList });
    });

    els.btnSaveKeywords.addEventListener('click', () => {
      const lines = els.customKeywords.value
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      const unique = Array.from(new Set(lines));
      savePartial({ customKeywords: unique }, () => {
        els.saveStatus.textContent = 'Salvo!';
        setTimeout(() => {
          els.saveStatus.textContent = '';
        }, 1800);
      });
    });
  }

  init();
})();
