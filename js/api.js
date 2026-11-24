// API layer. Server mode talks to /api. If no server answers, it falls back to demo mode (data kept in this browser).
const API = (() => {
  const cfg = window.BISTRO_CONFIG || {};
  const base = cfg.API_BASE || '';
  let mode = 'server';
  const SB = cfg.SUPABASE_URL ? { url: cfg.SUPABASE_URL.replace(/\/$/, ''), key: cfg.SUPABASE_KEY } : null;
  async function sbGet(table, q = '') { const r = await fetch(SB.url + '/rest/v1/' + table + (q ? '?' + q : ''), { headers: { apikey: SB.key } }); if (!r.ok) throw new Error('db ' + table); return r.json(); }
  async function rpc(fn, args) { const r = await fetch(SB.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(String(j.message || 'error').replace(/^.*?(min_order|coupon_\w+|phone|name|address|area|empty|unavailable|online_unavailable).*$/, '$1')); e.status = r.status; throw e; } return j; }
  const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
  async function call(path, opt = {}) {
    const r = await fetch(base + path, { ...opt, headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'error'); e.status = r.status; throw e; }
    return j;
  }
  async function boot() {
    if (SB) {
      const [categories, products, areas, banners, offers, reviews, hours, st] = await Promise.all([sbGet('categories', 'order=sort'), sbGet('products', 'available=eq.1&order=id'), sbGet('areas', 'active=eq.1'), sbGet('banners', 'active=eq.1&order=id'), sbGet('offers', 'active=eq.1&order=id'), sbGet('reviews', 'show=eq.1&order=id.desc'), sbGet('hours', 'order=day'), sbGet('settings')]);
      mode = 'supabase';
      return { mode: 'server', categories, products, areas, banners, offers, reviews, hours, settings: Object.fromEntries(st.map(r => [r.k, r.v])) };
    }
    if (!cfg.FORCE_LOCAL) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
        const d = await call('/api/bootstrap', { signal: ctl.signal }); clearTimeout(t); mode = 'server'; return d;
      } catch (e) { /* fall through to demo mode */ }
    }
    mode = 'local';
    let d = LS.get('b27_db', null);
    if (!d) { d = await (await fetch('data/seed.json')).json(); d.hours = d.hours; LS.set('b27_db', d); }
    d.mode = 'local';
    d.products = d.products.filter(p => p.available !== 0);
    ['banners', 'offers', 'areas'].forEach(k => d[k] = (d[k] || []).filter(x => x.active !== 0));
    d.reviews = (d.reviews || []).filter(x => x.show !== 0);
    d.settings = Object.assign({}, d.settings);
    return d;
  }
  function priceLines(db, items) {
    return items.map(it => {
      const p = db.products.find(x => x.id == it.id); let price = p.price; const s = p.sizes.find(x => x.en === it.size);
      if (s) price += s.add; const ex = [];
      (it.extras || []).forEach(e => { const f = p.extras.find(x => x.en === e); if (f) { price += f.price; ex.push(f.en); } });
      return { p, size: s ? s.en : '', ex, qty: it.qty, unit: price, note: it.note || '' };
    });
  }
  async function coupon(code, subtotal) {
    if (mode === 'supabase') return rpc('check_coupon', { p_code: code, p_subtotal: subtotal });
    if (mode === 'server') return call('/api/coupon', { method: 'POST', body: JSON.stringify({ code, subtotal }) });
    const db = LS.get('b27_db'); const c = (db.coupons || []).find(x => x.code.toLowerCase() === String(code).trim().toLowerCase() && x.active);
    if (!c) return { ok: false, error: 'invalid' }; if (subtotal < c.min) return { ok: false, error: 'min', min: c.min };
    return { ok: true, code: c.code, discount: Math.min(c.type === 'percent' ? Math.round(subtotal * c.value) / 100 : c.value, subtotal) };
  }
  async function order(o) {
    if (mode === 'supabase') return rpc('place_order', { p: { ...o, area: o.area || null } });
    if (mode === 'server') return call('/api/orders', { method: 'POST', body: JSON.stringify(o) });
    const db = LS.get('b27_db'); const area = db.areas.find(a => a.id == o.area) || { ar: 'توصيل سريع', en: 'Fast delivery', fee: 0 }; const lines = priceLines(db, o.items);
    const subtotal = lines.reduce((a, l) => a + l.unit * l.qty, 0); let disc = 0, code = '';
    if (o.coupon) { const c = await coupon(o.coupon, subtotal); if (!c.ok) throw new Error('coupon_' + c.error); disc = c.discount; code = c.code; }
    const number = 'B27-' + Math.floor(100000 + Math.random() * 900000); const total = subtotal - disc + area.fee;
    const orders = LS.get('b27_orders', []);
    orders.unshift({ id: Date.now(), number, name: o.name, phone: o.phone, address: o.address, area_name: area.en + ' / ' + area.ar, notes: o.notes, payment: o.payment, subtotal, discount: disc, delivery_fee: area.fee, total, coupon: code, status: 'new', created_at: new Date().toISOString(),
      items: lines.map(l => ({ name_ar: l.p.name_ar, name_en: l.p.name_en, size: l.size, extras: l.ex, qty: l.qty, unit_price: l.unit, note: l.note })) });
    LS.set('b27_orders', orders);
    return { ok: true, number, subtotal, discount: disc, delivery_fee: area.fee, total, payment: o.payment };
  }
  async function track(number, phone) {
    if (mode === 'supabase') { const r = await rpc('track_order', { p_number: number, p_phone: phone }); if (r.error) { const e = new Error('not_found'); e.status = 404; throw e; } return r; }
    if (mode === 'server') return call('/api/track?number=' + encodeURIComponent(number) + '&phone=' + encodeURIComponent(phone));
    const o = LS.get('b27_orders', []).find(x => x.number === number.trim() && x.phone === phone.replace(/[\s-]/g, ''));
    if (!o) { const e = new Error('not_found'); e.status = 404; throw e; } return { number: o.number, status: o.status, total: o.total, created_at: o.created_at };
  }
  return { boot, coupon, order, track, LS, get mode() { return mode; } };
})();
