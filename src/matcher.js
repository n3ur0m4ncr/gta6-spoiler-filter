(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GTA6SpoilerMatcher = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: 'hide', // 'hide' | 'blur'
    strictMode: true, // Blocks standalone Rockstar, Take-Two, Vice City, Leonida
    blockAnyGta: true, // Blocks ANY mention of "GTA" even without "6" / "VI"
    protectFullPage: true, // Blocks whole page/video if URL, title, or main H1 matches
    customKeywords: [],
    whitelistedDomains: [],
    blockedTotal: 0
  };

  // Opaque URL query parameters that often carry random Base64/alphanumeric IDs
  const OPAQUE_QUERY_PARAMS = new Set([
    'v',
    'vi',
    'si',
    'pp',
    'list',
    'index',
    't',
    'start',
    'end',
    'feature',
    'fbclid',
    'gclid',
    'dclid',
    'msclkid',
    'igshid',
    's',
    'ref',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content'
  ]);

  function normalizeText(input) {
    if (!input) return '';
    return String(input)
      .replace(/[\u200B-\u200D\uFEFF\uFE0E\uFE0F\u20E3]/g, '') // Zero-width & keycap combining marks
      .replace(/⑥/g, '6')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Strip diacritics
      .toLowerCase();
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function compileCustomKeywordRegex(rawKeyword) {
    const normalized = normalizeText(rawKeyword).trim();
    if (!normalized || normalized.length < 2) return null;

    const escaped = escapeRegExp(normalized).replace(/\s+/g, '[\\s._-]+');
    const startsAlphaNum = /^[a-z0-9]/.test(normalized);
    const endsAlphaNum = /[a-z0-9]$/.test(normalized);
    const prefix = startsAlphaNum ? '(?<![a-z0-9])' : '';
    const suffix = endsAlphaNum ? '(?![a-z0-9])' : '';

    try {
      return new RegExp(prefix + escaped + suffix, 'i');
    } catch (_) {
      return null;
    }
  }

  function sanitizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_SETTINGS.enabled,
      mode: src.mode === 'blur' ? 'blur' : 'hide',
      strictMode:
        typeof src.strictMode === 'boolean' ? src.strictMode : DEFAULT_SETTINGS.strictMode,
      blockAnyGta:
        typeof src.blockAnyGta === 'boolean'
          ? src.blockAnyGta
          : DEFAULT_SETTINGS.blockAnyGta,
      protectFullPage:
        typeof src.protectFullPage === 'boolean'
          ? src.protectFullPage
          : DEFAULT_SETTINGS.protectFullPage,
      customKeywords: Array.isArray(src.customKeywords)
        ? src.customKeywords
            .map((k) => String(k || '').trim())
            .filter((k) => k.length >= 2)
        : [],
      whitelistedDomains: Array.isArray(src.whitelistedDomains)
        ? src.whitelistedDomains
            .map((d) => normalizeText(d).trim().replace(/^https?:\/\//, '').split('/')[0])
            .filter(Boolean)
        : [],
      blockedTotal:
        typeof src.blockedTotal === 'number' && Number.isFinite(src.blockedTotal)
          ? Math.max(0, Math.floor(src.blockedTotal))
          : 0
    };
  }

  function isDomainWhitelisted(hostname, whitelistedDomains) {
    const host = normalizeText(hostname).trim().replace(/^www\./, '');
    if (!host || !Array.isArray(whitelistedDomains) || whitelistedDomains.length === 0) {
      return false;
    }
    return whitelistedDomains.some((entry) => {
      const clean = normalizeText(entry).trim().replace(/^www\./, '');
      if (!clean) return false;
      return host === clean || host.endsWith('.' + clean);
    });
  }

  function createMatcher(rawSettings) {
    const settings = sanitizeSettings(rawSettings);

    // Unambiguous GTA 6 patterns (including spaced/punctuated obfuscations)
    const directPatterns = [
      {
        label: 'GTA 6',
        regex: /(?<![a-z0-9])(?:gta|g\.t\.a\.?|g\s+t\s+a)[\s.:/_-]*6(?![0-9])/i
      },
      {
        label: 'GTA VI',
        regex: /(?<![a-z0-9])(?:gta|g\.t\.a\.?|g\s+t\s+a)[\s.:/_-]*vi(?![a-z0-9])/i
      },
      {
        label: 'GTA Six',
        regex: /(?<![a-z0-9])(?:gta|g\.t\.a\.?|g\s+t\s+a)[\s.:/_-]*(?:six|seis|sexto)(?![a-z0-9])/i
      },
      {
        label: 'Grand Theft Auto 6/VI',
        regex: /(?<![a-z0-9])grand[\s._-]*theft[\s._-]*auto[\s._-]*(?:6|vi|six|seis|sexto)(?![a-z0-9])/i
      },
      {
        label: 'Novo GTA',
        regex: /(?<![a-z0-9])(?:novo|proximo|next|new)[\s._-]+(?:gta|grand[\s._-]*theft[\s._-]*auto)(?![a-z0-9])/i
      },
      { label: 'Leonida', regex: /(?<![a-z0-9])leonida(?![a-z0-9])/i }
    ];

    // Strict mode patterns (catches Rockstar/Take-Two/Vice City even without "GTA 6")
    const strictPatterns = settings.strictMode
      ? [
          {
            label: 'Rockstar',
            regex: /(?<![a-z0-9])rockstar(?![\s._-]*energy)(?![a-z0-9])/i
          },
          {
            label: 'Take-Two',
            regex: /(?<![a-z0-9])take[\s._-]*(?:two|2)(?![a-z0-9])/i
          },
          {
            label: 'Vice City',
            regex: /(?<![a-z0-9])vice[\s._-]*city(?![a-z0-9])/i
          },
          {
            label: 'Grand Theft Auto',
            regex: /(?<![a-z0-9])grand[\s._-]*theft[\s._-]*auto(?![a-z0-9])/i
          }
        ]
      : [];

    // Nuclear GTA toggle: catches ANY standalone "GTA" / "G.T.A" mention
    const anyGtaPatterns = settings.blockAnyGta
      ? [
          {
            label: 'GTA (modo rigoroso)',
            regex: /(?<![a-z0-9])(?:gta(?:o|rp)?|g\.t\.a\.?|g\s+t\s+a)(?![a-z0-9])/i
          }
        ]
      : [];

    // Contextual patterns: trigger when character/game/spoiler terms co-occur
    const contextualRules = [
      {
        label: 'Lucia & Jason',
        first: /(?<![a-z0-9])lucia(?![a-z0-9])/i,
        second: /(?<![a-z0-9])jason(?![a-z0-9])/i
      },
      {
        label: 'Personagem + contexto GTA/spoiler',
        first: /(?<![a-z0-9])(?:lucia|jason)(?![a-z0-9])/i,
        second: /(?<![a-z0-9])(gta|rockstar|leonida|vice[\s._-]*city|trailer|gameplay|vazou|vazamento|leak|leaks|leaked|spoiler|spoilers|final|ending|morte|morreu|death|died|protagonista|protagonist|campanha|campaign|historia|story|mapa|map|cena|scene|missao|mission|ps5|xbox)(?![a-z0-9])/i
      },
      {
        label: 'Rockstar + spoiler/jogo',
        first: /(?<![a-z0-9])rockstar(?![a-z0-9])/i,
        second: /(?<![a-z0-9])(gta|spoiler|spoilers|vazou|vazamento|vazamentos|leak|leaks|leaked|final|ending|morte|death|lucia|jason|leonida|vice[\s._-]*city|trailer|gameplay|campanha|campaign|historia|story|mapa|map|protagonista|protagonist|novo[\s._-]*jogo|new[\s._-]*game|cena|scene|missao|mission|review|analise)(?![a-z0-9])/i
      },
      {
        label: 'GTA + contexto',
        first: /(?<![a-z0-9])gta(?![a-z0-9])/i,
        second: /(?<![a-z0-9])(spoiler|spoilers|vazou|vazamento|vazamentos|leak|leaks|leaked|leonida|lucia|jason|final|ending|morte|morreu|death|died|zerando|zerou|campanha|historia|story|gameplay|trailer|mapa|review|analise|metacritic|cena|missao|segredo|easter[\s._-]*egg)(?![a-z0-9])/i
      },
      {
        label: 'Vice City + contexto',
        first: /(?<![a-z0-9])vice[\s._-]*city(?![a-z0-9])/i,
        second: /(?<![a-z0-9])(gta|6|vi|leonida|rockstar|leak|vazou|vazamento|spoiler|trailer|gameplay|final|ending|ps5|xbox|pc|2025|2026|2027|lucia|jason|mapa|map)(?![a-z0-9])/i
      }
    ];

    const customMatchers = settings.customKeywords
      .map((kw) => ({ label: kw, regex: compileCustomKeywordRegex(kw) }))
      .filter((item) => item.regex !== null);

    function matchText(rawText) {
      if (!rawText) return null;
      const text = normalizeText(rawText);
      if (!text) return null;

      for (const pat of directPatterns) {
        if (pat.regex.test(text)) {
          return { matched: true, reason: pat.label };
        }
      }

      for (const pat of strictPatterns) {
        if (pat.regex.test(text)) {
          return { matched: true, reason: pat.label };
        }
      }

      for (const pat of anyGtaPatterns) {
        if (pat.regex.test(text)) {
          return { matched: true, reason: pat.label };
        }
      }

      for (const rule of contextualRules) {
        if (rule.first.test(text) && rule.second.test(text)) {
          return { matched: true, reason: rule.label };
        }
      }

      for (const custom of customMatchers) {
        if (custom.regex.test(text)) {
          return { matched: true, reason: custom.label };
        }
      }

      return null;
    }

    function extractInspectableUrlText(rawUrl) {
      if (!rawUrl || typeof rawUrl !== 'string') return '';
      if (/^(javascript:|data:|blob:|about:|brave:|chrome:)/i.test(rawUrl.trim())) {
        return '';
      }
      try {
        const parsed = new URL(rawUrl, 'https://example.invalid');
        const parts = [];
        const isYoutuBeId =
          /(^|\.)youtu\.be$/i.test(parsed.hostname) &&
          /^\/[A-Za-z0-9_-]{11}$/.test(parsed.pathname);

        if (parsed.pathname && parsed.pathname !== '/' && !isYoutuBeId) {
          parts.push(parsed.pathname);
        }
        if (parsed.hash) {
          parts.push(parsed.hash);
        }
        for (const [key, value] of parsed.searchParams.entries()) {
          if (!OPAQUE_QUERY_PARAMS.has(key.toLowerCase())) {
            parts.push(`${key} ${value}`);
          }
        }

        const joined = parts.join(' ');
        let decoded = joined;
        try {
          decoded = decodeURIComponent(joined);
        } catch (_) {
          // Keep raw if malformed percent-encoding
        }
        return decoded.replace(/[+/]+/g, ' ');
      } catch (_) {
        return rawUrl;
      }
    }

    function matchUrl(rawUrl) {
      const inspectable = extractInspectableUrlText(rawUrl);
      if (!inspectable) return null;
      return matchText(inspectable);
    }

    return {
      settings,
      matchText,
      matchUrl
    };
  }

  return {
    DEFAULT_SETTINGS,
    normalizeText,
    sanitizeSettings,
    isDomainWhitelisted,
    createMatcher
  };
});
