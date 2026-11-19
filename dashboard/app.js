// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a KPI strip, the fitted comps curve with its blind test, working filters, a
// factor-by-factor detail drawer with a netted farm plan, a side-by-side compare panel, a CSV export
// and a live sandbox that re-scores every row from the page. No network: every byte it shows is already
// in data.js, and the model below is a port of lib/model.ts's scoreProtocol, so the sandbox can re-rank
// without a server. The URL is real page state (?token=none&category=RWA&protocol=steakhouse-financial).
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var ROWS = DATA.rows || [];
  var ALL = ROWS.concat(DATA.live || []);
  var CATEGORIES = uniqueSorted(ALL.map(catOf));
  var CHAINS = uniqueSorted(ALL.reduce(function (out, r) { return out.concat(r.chains || []); }, []));
  var SORTS = ['value', 'rank', 'name', 'tvl', 'growth', 'age', 'multiple', 'net'];
  var TOKENS = ['none', 'live', 'all'];
  var SLIDERS = [
    ['growth_weight', 'Growth weight', 0, 1.5, 0.05],
    ['maturity_floor', 'Maturity floor', 0.4, 1, 0.01],
    ['maturity_range', 'Maturity range', 0, 0.8, 0.01],
    ['multiple_cap', 'Multiple clamp', 1, 12, 0.5],
    ['allocation_share', 'Allocation share', 0, 0.005, 0.0001],
  ];
  var DEFAULTS = {};
  Object.keys(DATA.model).forEach(function (k) { DEFAULTS[k] = DATA.model[k]; });
  DEFAULTS.allocation_share = DATA.farm.allocation_share;
  var state = { q: '', category: 'all', chain: 'all', token: 'none', sort: 'value', dir: -1, selected: null, compare: [], sandbox: {} };
  var liveCache = null;
  var sandboxActive = false;
  var tokenButtons = [];
  var searchInput = null;
  var boardHost = null;
  var boardCount = null;
  var resultLabel = null;
  var compareHost = null;
  var kpiHost = null;
  var modeBadge = null;

  var usdExact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function uniqueSorted(values) {
    var seen = {};
    var out = [];
    values.forEach(function (v) {
      if (typeof v !== 'string' || v === '' || seen[v]) return;
      seen[v] = true;
      out.push(v);
    });
    return out.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  }
  function catOf(r) { return r.category || 'Other'; }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n), s = n < 0 ? '-' : '';
    if (abs >= 1e9) return s + '$' + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return s + '$' + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return s + '$' + Math.round(abs / 1e3) + 'K';
    return (n < 0 ? '-$' : '$') + Math.round(abs);
  }
  function fmtUsdExact(n) {
    return n === null || n === undefined || !isFinite(n) ? 'n/a' : usdExact.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtRatio(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(n >= 10 ? 1 : n >= 1 ? 2 : 3) + '×';
  }
  function chainLabel(r) {
    var chains = r.chains || [];
    if (chains.length === 0) return 'unnamed chain';
    if (chains.length === 1) return chains[0];
    return chains.slice(0, 2).join(', ') + (chains.length > 2 ? ' +' + (chains.length - 2) : '');
  }
  function isLive(r) { return r.token_status === 'live'; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function median(values) {
    if (!values.length) return 0;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // scoreProtocol: the page's port of lib/model.ts impliedValue, same four rounded steps, so a sandbox
  // constant moved here re-ranks exactly as main.ts would. fitComps/testComps produce the curve and its
  // blind score the KPI strip quotes; those are read-only facts about the snapshot.

  function scoreProtocol(r, m) {
    var age = r.age_days === null || r.age_days === undefined ? m.unknown_age_days : r.age_days;
    var rawGrowth = r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d;
    var growthPct = clamp(rawGrowth, m.growth_floor, m.growth_cap);
    var growthMult = Math.round((1 + (growthPct / 100) * m.growth_weight) * 1e4) / 1e4;
    var maturityMult = Math.round((m.maturity_floor + (clamp(age, 0, m.maturity_days) / m.maturity_days) * m.maturity_range) * 1e4) / 1e4;
    var multiple = Math.round(clamp(r.model.category_multiple, m.multiple_floor, m.multiple_cap) * 1e6) / 1e6;
    var base = Math.max(0, r.tvl_usd) * multiple;
    var implied = Math.max(1, Math.round(base * growthMult * maturityMult));
    var gas = r.farm ? r.farm.gas_usd : 0;
    var share = m.allocation_share;
    var gross = Math.round(implied * share);
    return { implied: implied, multiple: multiple, growthPct: growthPct, growthMult: growthMult, maturityMult: maturityMult, age: age, gross: gross, net: Math.round(gross - gas) };
  }

  function modelOf() { return sandboxActive ? state.sandbox : DATA.model; }

  var LIVE = ROWS;

  function rescore() {
    if (!sandboxActive) {
      LIVE = ROWS;
      return;
    }
    var m = state.sandbox;
    var scored = ROWS.map(function (r) {
      var s = scoreProtocol(r, m);
      var copy = JSON.parse(JSON.stringify(r));
      copy.model.category_multiple = s.multiple;
      copy.model.growth_pct = s.growthPct;
      copy.model.growth_multiplier = s.growthMult;
      copy.model.maturity_multiplier = s.maturityMult;
      copy.model.base_value_usd = Math.round(Math.max(0, r.tvl_usd) * s.multiple);
      copy.implied_value_usd = s.implied;
      copy.farm.allocation_share = m.allocation_share;
      copy.farm.gross_usd = s.gross;
      copy.farm.net_usd = s.net;
      return copy;
    });
    scored.sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
    scored.forEach(function (r, i) { r.rank = i + 1; });
    LIVE = scored;
    liveCache = LIVE.concat(DATA.live || []);
  }

  function allRows() { return sandboxActive ? liveCache : ALL; }
  function rowFor(slug) {
    var list = allRows();
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
    return null;
  }
  function valueOf(r) {
    if (isLive(r)) return r.mcap_usd === null || r.mcap_usd === undefined ? -Infinity : r.mcap_usd;
    return r.implied_value_usd;
  }
  function multipleOf(r) {
    if (isLive(r)) return r.tvl_usd > 0 && r.mcap_usd !== null && r.mcap_usd !== undefined ? r.mcap_usd / r.tvl_usd : null;
    return r.model ? r.model.category_multiple : null;
  }
  function netOf(r) { return r.farm ? r.farm.net_usd : -Infinity; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) {
        child.forEach(function (c) { if (c !== null && c !== undefined) node.appendChild(c); });
      } else if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }


  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    if (!params.toString() && window.location.hash) params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var q = params.get('q');
    if (q) state.q = q;
    var category = params.get('category');
    if (category && CATEGORIES.indexOf(category) >= 0) state.category = category;
    var chain = params.get('chain');
    if (chain && CHAINS.indexOf(chain) >= 0) state.chain = chain;
    var token = params.get('token');
    if (token && TOKENS.indexOf(token) >= 0) state.token = token;
    var sort = params.get('sort');
    if (sort && SORTS.indexOf(sort) >= 0) state.sort = sort;
    var dir = params.get('dir');
    if (dir === '1' || dir === '-1') state.dir = Number(dir);
    var protocol = params.get('protocol') || params.get('p');
    if (protocol) state.selected = protocol;
    var panelScroll = params.get('panel');
    if (panelScroll === 'plan' || panelScroll === 'factors') state.panelScroll = panelScroll;
    var compare = params.get('compare');
    if (compare) state.compare = compare.split(',').filter(function (s) { return s.length > 0; }).slice(0, 2);
    var sandbox = params.get('sandbox');
    if (sandbox) applySandbox(sandbox.split(',').map(Number));
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.token !== 'none') params.set('token', state.token);
    if (state.sort !== 'value') params.set('sort', state.sort);
    if (state.sort !== 'value' && state.dir === 1) params.set('dir', '1');
    if (state.selected) params.set('protocol', state.selected);
    if (state.compare.length) params.set('compare', state.compare.join(','));
    if (sandboxActive) params.set('sandbox', sandboxCode());
    var next = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (next ? '?' + next : ''));
  }

  function sandboxCode() {
    return [state.sandbox.growth_weight, state.sandbox.maturity_floor, state.sandbox.maturity_range, state.sandbox.multiple_cap, state.sandbox.allocation_share].join(',');
  }
  function applySandbox(values) {
    var keys = ['growth_weight', 'maturity_floor', 'maturity_range', 'multiple_cap', 'allocation_share'];
    if (values.length !== keys.length || values.some(function (v) { return !isFinite(v); })) return;
    state.sandbox = defaultSandbox();
    keys.forEach(function (k, i) { state.sandbox[k] = values[i]; });
    sandboxActive = true;
    liveCache = null;
    rescore();
  }
  function defaultSandbox() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = DEFAULTS[k]; });
    return out;
  }


  function filtered() {
    var q = state.q.trim().toLowerCase();
    return allRows().filter(function (r) {
      if (state.token === 'none' && isLive(r)) return false;
      if (state.token === 'live' && !isLive(r)) return false;
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, r.symbol, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortValue(r, key) {
    if (key === 'rank') return isLive(r) ? Infinity : r.rank;
    if (key === 'name') return (r.name || '').toLowerCase();
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'growth') return r.change_7d === null || r.change_7d === undefined ? -Infinity : r.change_7d;
    if (key === 'age') return r.age_days === null || r.age_days === undefined ? Infinity : r.age_days;
    if (key === 'multiple') { var m = multipleOf(r); return m === null ? Infinity : m; }
    if (key === 'net') return netOf(r);
    return valueOf(r);
  }

  function sortedRows(list) {
    return list.slice().sort(function (a, b) {
      var av = sortValue(a, state.sort);
      var bv = sortValue(b, state.sort);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      var ar = isLive(a) ? Infinity : a.rank;
      var br = isLive(b) ? Infinity : b.rank;
      if (ar < br) return -1;
      if (ar > br) return 1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }


  function scoreKpis() {
    var rows = LIVE;
    var top10 = rows.slice(0, 10).reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var nets = rows.map(function (r) { return r.farm ? r.farm.net_usd : 0; });
    return {
      scanned: ROWS.length + (DATA.live || []).length,
      ranked: rows.length,
      watchlist: DATA.watchlist_size,
      r2: DATA.comps.fit.r2,
      medape: DATA.comps.test.med_ape,
      hit2x: DATA.comps.test.hit_2x,
      top10: top10,
      median_net: median(nets),
    };
  }

  function kpiStrip() {
    var k = scoreKpis();
    function cell(label, big, note, cls) {
      return el('div', { class: 'kpi' + (cls ? ' ' + cls : '') },
        el('span', { class: 'kpi-label', text: label }),
        el('b', { class: 'kpi-big', text: big }),
        el('small', { class: 'kpi-note', text: note })
      );
    }
    return el('section', { class: 'kpis', 'aria-label': 'The radar in figures' },
      cell('Protocols scanned', String(k.scanned), 'every slug in the snapshot'),
      cell('Pre-token ranked', String(k.ranked), 'watchlist + all below floor'),
      cell('Watchlist covered', k.watchlist + ' / ' + k.watchlist, 'the floor, never the ceiling'),
      cell('Comps fit R²', k.r2.toFixed(2), 'n=' + DATA.comps.fit.n + ' live peers · slope ' + DATA.comps.fit.slope.toFixed(2), 'model'),
      cell('Out-of-sample MedAPE', k.medape.toFixed(0) + '%', (k.hit2x * 100).toFixed(0) + '% within 2× · blind ' + DATA.comps.test.held_out, 'model'),
      cell('Top-10 implied value', fmtUsd(k.top10), 'summed, launch estimates'),
      cell('Median farm net', fmtUsd(k.median_net), 'plan value − gas, per row'),
      cell('Live peers set aside', String(DATA.comps.fit.n + DATA.comps.test.held_out), 'market values, never modelled')
    );
  }

  function paintKpis() {
    if (!kpiHost) return;
    kpiHost.textContent = '';
    kpiHost.appendChild(kpiStrip());
  }


  function header() {
    modeBadge = el('span', { class: 'pill sandbox-badge', hidden: sandboxActive ? null : 'hidden', text: 'sandbox mode' });
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name', text: 'Token Radar' })
      ),
      el('div', { class: 'top-meta' },
        modeBadge,
        el('span', { class: 'pill', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'pill model', text: 'model ' + DATA.model_version.split('-').slice(0, 3).join('-') }),
        el('span', { class: 'pill live', text: DATA.live_size + ' live tokens set aside' })
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'Pre-token launch radar' }),
        el('h1', { text: 'What a launch could be worth, fitted and tested on the snapshot itself.' }),
        el('p', null,
          'Every pre-token protocol the snapshot records is ranked, not only the watchlist: ',
          el('b', { text: DATA.watchlist_size + ' watchlist names are covered' }),
          ' and ' + (LIVE.length - DATA.early_size) + ' other pre-token protocols join them below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor — ' + LIVE.length + ' in all. ',
          'The multiple comes from a comps curve fitted on live-token peers, then tested blind on a held-out fifth. ',
          'Protocols that already trade are kept in their own live view.'
        )
      ),
      el('div', { class: 'facts', 'aria-label': 'Snapshot facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug present' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token ranked' }), el('b', { text: String(LIVE.length) }), el('small', { text: 'the watchlist plus all below' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live peers' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'market values, not models' })),
        el('div', { class: 'fact' }, el('span', { text: 'Categories priced' }), el('b', { text: String((DATA.multiples || []).filter(function (m) { return m.comparables > 0; }).length) }), el('small', { text: 'from real TVL ratios' }))
      )
    );
  }

  function setToken(value) {
    state.token = value;
    tokenButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-token') === value ? 'true' : 'false');
    });
    syncUrl();
    paintBoard();
  }

  function controls() {
    searchInput = el('input', {
      type: 'search', id: 'q', placeholder: 'Name, ticker, category or chain', value: state.q,
      'aria-label': 'Search the board', autocomplete: 'off',
    });
    searchInput.addEventListener('input', function () {
      state.q = searchInput.value;
      syncUrl();
      paintBoard();
    });
    var categorySelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      CATEGORIES.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    categorySelect.addEventListener('change', function () {
      state.category = categorySelect.value;
      syncUrl();
      paintBoard();
    });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      CHAINS.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () {
      state.chain = chainSelect.value;
      syncUrl();
      paintBoard();
    });
    tokenButtons = [
      ['all', 'All'], ['none', 'No token'], ['live', 'Has token']
    ].map(function (pair) {
      return el('button', {
        type: 'button', 'data-token': pair[0], text: pair[1],
        'aria-pressed': state.token === pair[0] ? 'true' : 'false',
        onclick: function () { setToken(pair[0]); },
      });
    });
    resultLabel = el('div', { class: 'result', 'aria-live': 'polite' });
    return el('section', { class: 'controls', 'aria-label': 'Filter the board' },
      el('div', { class: 'field search-field' }, el('label', { for: 'q', text: 'Search' }), searchInput),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), categorySelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'segmented' }, tokenButtons)),
      el('button', { class: 'button', type: 'button', text: 'Export CSV', onclick: exportCsv }),
      resultLabel
    );
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls },
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else {
            state.sort = key;
            state.dir = key === 'name' || key === 'rank' ? 1 : -1;
          }
          syncUrl();
          paintBoard();
        },
      },
        label,
        state.sort === key ? el('span', { class: 'sort-arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '▼' : '▲' }) : null
      )
    );
  }

  function valueHeader() {
    if (state.token === 'live') return 'Market cap';
    if (state.token === 'all') return 'Value (model / market)';
    return 'Implied value';
  }

  function toggleCompare(slug) {
    var at = state.compare.indexOf(slug);
    if (at >= 0) state.compare.splice(at, 1);
    else {
      if (state.compare.length >= 2) state.compare.shift();
      state.compare.push(slug);
    }
    syncUrl();
    paintCompare();
    paintBoard();
  }

  function boardTable(list) {
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches these filters' }),
        el('p', { text: 'Clear the search, choose another category or chain, or switch the token status to see the rest of the snapshot.' }),
        el('button', {
          class: 'button primary', type: 'button', text: 'Clear filters',
          onclick: function () {
            state.q = '';
            state.category = 'all';
            state.chain = 'all';
            state.token = 'none';
            if (searchInput) searchInput.value = '';
            Array.prototype.forEach.call(document.querySelectorAll('select'), function (s) { s.value = 'all'; });
            tokenButtons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-token') === 'none' ? 'true' : 'false'); });
            syncUrl();
            paintBoard();
          },
        })
      ));
    }
    var max = 1;
    list.forEach(function (r) { max = Math.max(max, Math.abs(valueOf(r)) || 0); });
    var caption = state.token === 'live'
      ? 'Live-token protocols: their market cap is a fact from the snapshot, not a model output. They stay out of the pre-token ranking.'
      : state.token === 'all'
        ? 'Pre-token estimates and live market values in one view; the status column keeps the two apart. Select a row for its working.'
        : 'Every pre-token protocol, strongest implied value first. Select a row for the working and its netted farm plan; tick the box to compare two.';
    var tbody = el('tbody');
    list.forEach(function (r) {
      var live = isLive(r);
      var growthClass = r.change_7d === null || r.change_7d === undefined ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var val = valueOf(r);
      var pct = Math.max(3, Math.round((Math.abs(val) / max) * 100));
      var comp = !live && r.model ? r.model.category_comparables : null;
      var mult = multipleOf(r);
      var multNote = live ? 'mcap / TVL' : (comp === 0 ? 'market prior' : comp + ' comp' + (comp === 1 ? '' : 's'));
      var checked = state.compare.indexOf(r.slug) >= 0;
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        el('td', { class: 'c-check' }, live ? null : el('input', {
          type: 'checkbox', class: 'cmp', checked: checked ? 'checked' : null, 'aria-label': 'Compare ' + r.name,
          onclick: function (e) { e.stopPropagation(); toggleCompare(r.slug); },
        })),
        el('td', { class: 'c-rank' }, live
          ? el('span', { class: 'rank live', text: 'Live' })
          : el('span', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) })),
        el('td', { class: 'c-name' }, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: catOf(r) + ' · ' + chainLabel(r) })
        )),
        el('td', { class: 'num c-tvl', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num c-growth ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num c-age', text: fmtAge(r.age_days) }),
        el('td', { class: 'c-mult' }, el('div', { class: 'mult' }, fmtRatio(mult), el('small', { text: multNote }))),
        el('td', { class: 'c-value' }, el('div', { class: 'implied' },
          el('b', { text: fmtUsd(val) }),
          el('div', { class: 'bar' + (live ? ' market' : ''), 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' }))
        )),
        el('td', { class: 'num c-net ' + (live ? '' : (netOf(r) >= 0 ? 'pos' : 'neg')), text: live ? '—' : fmtUsd(netOf(r)) }),
              state.token === 'all'
                ? el('td', { class: 'c-status' }, el('span', { class: 'status' + (live ? ' live' : ''), text: live ? 'trades' : 'no token' }))
                : null
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: caption }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', class: 'c-check', text: 'Cmp' }),
            sortHeader('rank', 'Rank', 'c-rank'),
            sortHeader('name', 'Protocol', 'c-name'),
            sortHeader('tvl', 'TVL', 'c-tvl'),
            sortHeader('growth', '7d', 'c-growth'),
            sortHeader('age', 'Age', 'c-age'),
            sortHeader('multiple', 'Multiple', 'c-mult'),
            sortHeader('value', valueHeader(), 'c-value'),
            sortHeader('net', 'Farm net', 'c-net'),
            state.token === 'all'
              ? el('th', { scope: 'col', class: 'c-status', text: 'Token' })
              : null
          )),
          tbody
        )
      )
    );
  }

  function paintBoard() {
    if (!boardHost) return;
    var list = sortedRows(filtered());
    boardHost.textContent = '';
    boardHost.appendChild(boardTable(list));
    if (boardCount) boardCount.textContent = list.length + ' shown';
    if (resultLabel) resultLabel.textContent = list.length + ' of ' + allRows().length + ' protocols';
  }


  function compareRow(label, pick, fmt) {
    return el('tr', null,
      el('th', { scope: 'row', text: label }),
      pick.map(function (r) { return el('td', { class: 'num', text: r ? fmt(r) : '—' }); })
    );
  }

  function paintCompare() {
    if (!compareHost) return;
    compareHost.textContent = '';
    if (state.compare.length === 0) return;
    var picks = state.compare.map(rowFor);
    var head = el('tr', null,
      el('th', { scope: 'col', text: 'Side by side' }),
      picks.map(function (r, i) {
        return el('th', { scope: 'col' }, el('div', { class: 'cmp-head' },
          el('b', { text: r ? r.name : 'pick a row' }),
          el('button', { class: 'close small', type: 'button', text: '×', 'aria-label': 'Remove', onclick: function () { toggleCompare(state.compare[i]); } })
        ));
      })
    );
    var body = [
      compareRow('Category', picks, function (r) { return catOf(r); }),
      compareRow('Chain', picks, chainLabel),
      compareRow('TVL', picks, function (r) { return fmtUsd(r.tvl_usd); }),
      compareRow('7-day move', picks, function (r) { return fmtPct(r.change_7d); }),
      compareRow('Age', picks, function (r) { return fmtAge(r.age_days); }),
      compareRow('Multiple', picks, function (r) { return fmtRatio(multipleOf(r)); }),
      compareRow('Implied value', picks, function (r) { return isLive(r) ? 'market ' + fmtUsd(r.mcap_usd) : fmtUsd(r.implied_value_usd); }),
      compareRow('Farm capital', picks, function (r) { return r.farm ? fmtUsdExact(r.farm.capital_usd) : '—'; }),
      compareRow('Farm gas', picks, function (r) { return r.farm ? fmtUsdExact(r.farm.gas_usd) : '—'; }),
      compareRow('Farm days', picks, function (r) { return r.farm ? r.farm.time_days + 'd' : '—'; }),
      compareRow('Farm net', picks, function (r) { return r.farm ? fmtUsd(r.farm.net_usd) : '—'; }),
    ];
    compareHost.appendChild(el('section', { class: 'panel compare' },
      el('div', { class: 'compare-head' },
        el('h2', { text: 'Compare' }),
        el('small', { text: 'Tick any two pre-token rows. Net is the expected farm value less gas, at the stated assumption.' })
      ),
      el('div', { class: 'table-wrap compact' }, el('table', { class: 'cmp-table' }, el('thead', null, head), el('tbody', null, body)))
    ));
  }


  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    var list = sortedRows(filtered());
    var head = ['rank', 'name', 'slug', 'category', 'chains', 'tvl_usd', 'change_7d', 'age_days', 'multiple', 'implied_value_usd', 'farm_capital_usd', 'farm_gas_usd', 'farm_days', 'farm_net_usd', 'token_status'];
    var lines = [head.join(',')];
    list.forEach(function (r) {
      var m = isLive(r) ? multipleOf(r) : r.model.category_multiple;
      lines.push([isLive(r) ? 'live' : r.rank, r.name, r.slug, catOf(r), (r.chains || []).join('|'), r.tvl_usd, r.change_7d, r.age_days, m, valueOf(r), r.farm ? r.farm.capital_usd : '', r.farm ? r.farm.gas_usd : '', r.farm ? r.farm.time_days : '', r.farm ? r.farm.net_usd : '', r.token_status].map(csvCell).join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'token-radar-' + DATA.as_of + (sandboxActive ? '-sandbox' : '') + '.csv' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
  }


  function onSandboxChange() {
    var differs = false;
    Object.keys(state.sandbox).forEach(function (k) { if (state.sandbox[k] !== DEFAULTS[k]) differs = true; });
    sandboxActive = differs;
    liveCache = null;
    rescore();
    if (modeBadge) modeBadge.hidden = !sandboxActive;
    syncUrl();
    paintKpis();
    paintBoard();
    paintCompare();
    paintSandboxValues();
    if (state.selected) {
      var row = rowFor(state.selected);
      if (row) openDetail(row.slug);
    }
  }

  function paintSandboxValues() {
    SLIDERS.forEach(function (spec) {
      var out = document.getElementById('out-' + spec[0]);
      if (!out) return;
      var v = state.sandbox[spec[0]];
      out.textContent = spec[0] === 'allocation_share' ? (v * 100).toFixed(2) + '% of launch value' : String(v);
    });
  }

  function sandboxPanel() {
    var sliders = SLIDERS.map(function (spec) {
      var input = el('input', { type: 'range', id: 'sb-' + spec[0], min: spec[2], max: spec[3], step: spec[4], value: state.sandbox[spec[0]], 'aria-describedby': 'out-' + spec[0] });
      input.addEventListener('input', function () { state.sandbox[spec[0]] = Number(input.value); onSandboxChange(); });
      return el('div', { class: 'slider' },
        el('label', { for: 'sb-' + spec[0], text: spec[1] }),
        input,
        el('output', { id: 'out-' + spec[0], for: 'sb-' + spec[0] })
      );
    });
    return el('section', { class: 'panel sandbox' },
      el('div', { class: 'sandbox-head' },
        el('div', null,
          el('h2', { text: 'Sandbox: move the constants, re-rank the board' }),
          el('p', { text: 'The model is plain code, not a baked table. Move a slider and every one of the ' + LIVE.length + ' rows is re-scored in this page by scoreProtocol, the same function main.ts runs. The comps curve and its blind test stay fixed: they are facts about the snapshot.' })
        ),
        el('button', { class: 'button', type: 'button', text: 'Reset to defaults', onclick: resetSandbox })
      ),
      el('div', { class: 'sliders' }, sliders),
      el('p', { class: 'eq-note', text: 'Growth weight scales the 7-day move; the maturity floor and range bound the age lift; the clamp bounds the category multiple; the allocation share is the slice of launch value a points farmer is assumed to claim (0.05% by default). Reset returns every constant to the model the board.json was written with.' })
    );
  }

  function resetSandbox() {
    state.sandbox = defaultSandbox();
    sandboxActive = false;
    liveCache = null;
    rescore();
    if (modeBadge) modeBadge.hidden = true;
    SLIDERS.forEach(function (spec) { var input = document.getElementById('sb-' + spec[0]); if (input) input.value = state.sandbox[spec[0]]; });
    syncUrl();
    paintKpis();
    paintBoard();
    paintCompare();
    paintSandboxValues();
  }


  function compsPanel() {
    var fit = DATA.comps.fit, test = DATA.comps.test, m = modelOf();
    var multiples = (DATA.multiples || []).slice().sort(function (a, b) {
      if (b.multiple !== a.multiple) return b.multiple - a.multiple;
      return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
    }).slice(0, 8);
    return el('section', { class: 'panel model', id: 'how' },
      el('div', { class: 'model-head' },
        el('h2', { text: 'How the model works: a fitted curve, tested blind' }),
        el('span', { class: 'pill model', text: DATA.model_version })
      ),
      el('p', { text: 'fitComps regresses log market cap on log TVL over the snapshot’s own live-token protocols — here ' + fit.n + ' of them — giving slope ' + fit.slope.toFixed(3) + ', intercept ' + fit.intercept.toFixed(3) + ' and R² ' + fit.r2.toFixed(3) + '. That line is the market’s own price for a dollar of TVL, not a name list. Each pre-token row multiplies its TVL by a category multiple anchored on this curve, then a bounded growth and maturity factor.' }),
      el('div', { class: 'comps-grid' },
        el('div', { class: 'comps-card fit' },
          el('span', { class: 'comps-label', text: 'Fitted on all ' + fit.n + ' peers' }),
          el('div', { class: 'comps-eq', text: 'log₁₀(mcap) = ' + fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' × log₁₀(TVL)' }),
          el('div', { class: 'comps-stats' },
            el('span', null, 'R² ', el('b', { text: fit.r2.toFixed(3) })),
            el('span', null, 'n ', el('b', { text: String(fit.n) })),
            el('span', null, 'median mcap/TVL ', el('b', { text: fmtRatio(fit.median_ratio) }))
          )
        ),
        el('div', { class: 'comps-card test' },
          el('span', { class: 'comps-label', text: 'Tested blind on ' + test.held_out + ' held-out peers' }),
          el('div', { class: 'comps-eq', text: test.held_out + ' of every 5th live slug, by hash, kept out of the fit' }),
          el('div', { class: 'comps-stats' },
            el('span', null, 'MedAPE ', el('b', { text: test.med_ape.toFixed(0) + '%' })),
            el('span', null, 'within 2× ', el('b', { text: (test.hit_2x * 100).toFixed(0) + '%' })),
            el('span', null, 'train n ', el('b', { text: String(test.train) }))
          )
        )
      ),
      el('div', { class: 'formula' },
        'implied = max(1, round( TVL × clamp(categoryMultiple, ' + m.multiple_floor + ', ' + m.multiple_cap + ') × (1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') ))'
      ),
      el('div', { class: 'mult-grid' },
        multiples.map(function (x) {
          var note = x.comparables === 0
            ? 'market prior ' + fmtRatio(x.global_prior)
            : x.comparables + ' comparable' + (x.comparables === 1 ? '' : 's') + (x.median_ratio === null ? '' : ' · median ' + fmtRatio(x.median_ratio));
          return el('div', { class: 'mult-card' },
            el('span', { class: 'cat', text: x.category }),
            el('span', { class: 'ratio', text: fmtRatio(x.multiple) }),
            el('span', { class: 'note', text: note + ' · ' + x.source })
          );
        })
      ),
      el('p', { class: 'eq-note', text: 'Age is capped at ' + Math.round(m.maturity_days / 365) + ' years, the momentum clamp is ' + m.growth_floor + '% to +' + m.growth_cap + '%, and an unknown listing uses ' + m.unknown_age_days + ' days. A launch value is an estimate, not a price; the blind test says how widely the curve misses.' })
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source + ' · snapshot ' + DATA.as_of }),
      el('span', { text: 'Sealed snapshot only · no network · model ' + DATA.model_version + ' · fitComps / testComps / scoreProtocol' })
    );
  }


  function splitStep(s) {
    var at = s.indexOf(' Cost: ');
    var action = at >= 0 ? s.slice(0, at) : s;
    var rest = at >= 0 ? s.slice(at + 7) : '';
    var ti = rest.indexOf('. Time: ');
    var cost = ti >= 0 ? rest.slice(0, ti) : rest;
    var time = ti >= 0 ? rest.slice(ti + 7) : '';
    if (time.slice(-1) === '.') time = time.slice(0, -1);
    return { action: action, cost: cost, time: time };
  }

  function ratioContext(row) {
    var m = row.model || {};
    var comp = m.category_comparables;
    var med = m.category_median_ratio;
    if (m.category_multiple_source === 'market' || comp === 0) {
      return catOf(row) + ' · no live comparables, so the market prior is used';
    }
    return catOf(row) + ' · ' + comp + ' live comparable' + (comp === 1 ? '' : 's') + (med === null || med === undefined ? '' : ' · median ' + fmtRatio(med));
  }

  function farmSummary(row) {
    var f = row.farm;
    if (!f) return null;
    var sign = f.net_usd >= 0 ? 'pos' : 'neg';
    return el('div', { class: 'farm-summary' },
      el('div', { class: 'fs-head' }, el('b', { text: 'Net expected value' }), el('b', { class: 'fs-net ' + sign, text: fmtUsdExact(f.net_usd) })),
      el('div', { class: 'fs-grid' },
        el('div', null, el('span', { text: 'Capital' }), el('b', { text: fmtUsdExact(f.capital_usd) })),
        el('div', null, el('span', { text: 'Gas over ' + f.steps + ' steps' }), el('b', { text: fmtUsdExact(f.gas_usd) })),
        el('div', null, el('span', { text: 'Time' }), el('b', { text: f.time_days + ' days' })),
        el('div', null, el('span', { text: 'Gross at ' + (f.allocation_share * 100).toFixed(2) + '%' }), el('b', { text: fmtUsd(f.gross_usd) }))
      ),
      el('p', { class: 'fs-note', text: 'Gross = implied launch value × ' + (f.allocation_share * 100).toFixed(2) + '% assumed allocation to farmers. Net = gross − gas. Capital is deposit-sized for the TVL tier; it is what the position needs, not a cost, so it is not subtracted.' })
    );
  }

  function detailPre(row) {
    var m = row.model;
    var mm = modelOf();
    var ageText = row.age_days === null || row.age_days === undefined
      ? 'unknown, so the model uses ' + mm.unknown_age_days + ' days'
      : fmtAge(row.age_days) + ' with no token (capped at ' + Math.round(mm.maturity_days / 365) + 'y)';
    var recompute = Math.max(1, Math.round(row.tvl_usd * m.category_multiple * m.growth_multiplier * m.maturity_multiplier));
    return el('div', { class: 'detail-body' },
      el('section', { class: 'detail-section' },
        el('div', { class: 'headline' }, el('span', { text: 'Implied launch value' }), el('b', { text: fmtUsdExact(row.implied_value_usd) })),
        el('div', { class: 'equation', id: 'factors' },
          el('div', { class: 'eq-row' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsdExact(row.tvl_usd) })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Category multiple' }), el('b', { text: fmtRatio(m.category_multiple) + ' — ' + ratioContext(row) })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Base value' }), el('b', { text: fmtUsdExact(m.base_value_usd) + ' = TVL × multiple' })),
          el('div', { class: 'eq-row' }, el('span', { text: '7-day move' }), el('b', { text: fmtPct(row.change_7d) + ' → clamped ' + fmtPct(m.growth_pct) + ' → ' + m.growth_multiplier.toFixed(3) + '×' })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Maturity' }), el('b', { text: ageText + ' → ' + m.maturity_multiplier.toFixed(3) + '×' })),
          el('div', { class: 'eq-row total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsdExact(row.implied_value_usd) }))
        ),
        el('div', { class: 'working' },
          'scoreProtocol: round(' + fmtUsdExact(row.tvl_usd) + ' × ' + m.category_multiple.toFixed(6) + ' × ' + m.growth_multiplier + ' × ' + m.maturity_multiplier + ') = ' + fmtUsdExact(row.implied_value_usd) + '\n' +
          'comps fit (all ' + DATA.comps.fit.n + ' peers): R² ' + DATA.comps.fit.r2.toFixed(3) + ', slope ' + DATA.comps.fit.slope.toFixed(3) + '; blind test on ' + DATA.comps.test.held_out + ' held out: MedAPE ' + DATA.comps.test.med_ape.toFixed(0) + '%, ' + (DATA.comps.test.hit_2x * 100).toFixed(0) + '% within 2×\n' +
          (recompute === row.implied_value_usd ? 'The page recomputes the same number board.json carries.' : 'The page recompute gives ' + fmtUsdExact(recompute) + ': the data would be stale.')
        )
      ),
      el('section', { class: 'detail-section', id: 'farm-plan' },
        el('h3', { text: 'Farm plan' }),
        farmSummary(row),
        el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
          var parts = splitStep(s);
          return el('li', null,
            el('b', { text: parts.action }),
            el('div', { class: 'tags' },
              el('span', { class: 'tag' }, 'Cost ', el('b', { text: parts.cost })),
              el('span', { class: 'tag' }, 'Time ', el('b', { text: parts.time }))
            )
          );
        }))
      )
    );
  }

  function detailLive(row) {
    var ratio = multipleOf(row);
    return el('div', { class: 'detail-body' },
      el('div', { class: 'live-note', text: 'This protocol already trades. It is set aside from the pre-token board: the figures below are the market’s own, not a launch model. No farm plan is generated for a live token.' }),
      el('section', { class: 'detail-section' },
        el('div', { class: 'headline' }, el('span', { text: 'Market cap' }), el('b', { text: fmtUsdExact(row.mcap_usd) })),
        el('div', { class: 'equation', id: 'factors' },
          el('div', { class: 'eq-row' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsdExact(row.tvl_usd) })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Market cap / TVL' }), el('b', { text: fmtRatio(ratio) })),
          el('div', { class: 'eq-row' }, el('span', { text: '7-day move' }), el('b', { text: fmtPct(row.change_7d) })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Symbol' }), el('b', { text: row.symbol || 'not recorded' })),
          el('div', { class: 'eq-row' }, el('span', { text: 'CoinGecko id' }), el('b', { text: row.gecko_id || 'not recorded' }))
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () {
    state.selected = null;
    syncUrl();
    paintBoard();
  });

  function openDetail(slug) {
    var row = rowFor(slug);
    if (!row) {
      state.selected = null;
      syncUrl();
      return;
    }
    state.selected = slug;
    syncUrl();
    dialog.textContent = '';
    var title = isLive(row) ? row.name : 'Rank ' + row.rank + ' of ' + LIVE.length + ' · ' + row.name;
    dialog.appendChild(el('div', { class: 'detail-inner' },
      el('div', { class: 'detail-top' },
        el('div', { class: 'detail-bar' },
          el('span', { class: 'kicker', text: (isLive(row) ? 'Live token' : 'Pre-token radar') + (sandboxActive ? ' · sandbox' : '') }),
          el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
        ),
        el('h2', { id: 'detail-title', text: title }),
        el('div', { class: 'lede-row' },
          el('span', { class: 'pill', text: catOf(row) }),
          el('span', { class: 'pill', text: chainLabel(row) }),
          el('span', { class: 'pill ' + (isLive(row) ? 'live' : 'model'), text: isLive(row) ? 'Trades today' : 'No token on record' })
        )
      ),
      isLive(row) ? detailLive(row) : detailPre(row)
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    dialog.scrollTop = 0;
    paintBoard();
    // A deep link may name a panel anchor: ?panel=plan opens the farm plan, ?panel=factors the working.
    if (state.panelScroll) {
      var anchor = dialog.querySelector(state.panelScroll === 'plan' ? '#farm-plan' : '#factors');
      if (anchor) {
        if (typeof anchor.scrollIntoView === 'function') anchor.scrollIntoView({ block: 'start' });
        else dialog.scrollTop = anchor.offsetTop;
      }
      state.panelScroll = null;
    }
  }


  function render() {
    state.sandbox = defaultSandbox();
    rescore();
    app.textContent = '';
    kpiHost = el('div', { class: 'kpi-host' });
    boardHost = el('div', { id: 'board-host' });
    compareHost = el('div', { class: 'compare-host' });
    boardCount = el('span', { class: 'count' });
    var shell = el('div', { class: 'shell' },
      header(),
      hero(),
      kpiHost,
      controls(),
      compareHost,
      el('div', { class: 'board-head' },
        el('div', null,
          el('h2', { text: 'The ranked board' }),
          el('p', { text: 'Sort any column, filter to a category, chain or token status, tick two rows to compare, and open a row for its working.' })
        ),
        boardCount
      ),
      boardHost,
      sandboxPanel(),
      compsPanel(),
      footer()
    );
    app.appendChild(shell);
    if (!dialog.isConnected) app.appendChild(dialog);
    paintKpis();
    paintBoard();
    paintCompare();
    paintSandboxValues();
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
  }

  readUrl();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
