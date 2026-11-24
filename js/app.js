(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = API.LS;
let db, lang = LS.get('b27_lang', 'ar'), cart = LS.get('b27_cart', []), favs = LS.get('b27_favs', []);
let coupon = null, menuState = { cat: 'all', q: '', sort: 'def' }, slide = 0, slideTimer;
const t = k => (I18N[lang][k] ?? I18N.ar[k] ?? k);
const L = (o, f) => o[f + '_' + lang] ?? o[lang] ?? o[f + '_ar'] ?? '';
const money = n => (Math.round(n * 100) / 100).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US') + ' ' + (lang === 'ar' ? 'ج.م' : 'EGP');
const prod = id => db.products.find(p => p.id == id);
function toast(m) { const e = $('#toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 1800); }
const save = () => { LS.set('b27_cart', cart); LS.set('b27_favs', favs); badges(); };
function badges() {
  const c = cart.reduce((a, l) => a + l.qty, 0);
  [['#cartCount', c], ['#favCount', favs.length]].forEach(([s, n]) => { const e = $(s); e.textContent = n; e.style.display = n ? 'grid' : 'none'; });
}
function unit(l) { const p = prod(l.id); if (!p) return 0; let x = p.price; const s = p.sizes.find(s => s.en === l.size); if (s) x += s.add; l.extras.forEach(e => { const f = p.extras.find(f => f.en === e); if (f) x += f.price; }); return x; }
const subtotal = () => cart.reduce((a, l) => a + unit(l) * l.qty, 0);
function img(p) { return p.img ? `<img loading="lazy" src="${esc(p.img)}" alt="${esc(L(p, 'name'))}">` : esc(p.emoji); }
function card(p) {
  const hasOpt = p.sizes.length || p.extras.length; const fav = favs.includes(p.id);
  return `<div class="card">${p.new ? `<span class="tag">${t('new')}</span>` : p.popular ? `<span class="tag">${t('popular')}</span>` : ''}
  <button class="fav ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="fav">${fav ? '♥' : '♡'}</button>
  <div class="ph" data-go="#/product/${p.id}">${img(p)}</div>
  <div class="b"><h3>${esc(L(p, 'name'))}</h3><p>${esc(L(p, 'desc'))}</p>
  <div class="r"><span class="price">${p.sizes.length ? t('from') + ' ' : ''}${money(p.price)}</span>
  <button class="btn sm" ${hasOpt ? `data-go="#/product/${p.id}"` : `data-add="${p.id}"`}>＋</button></div></div></div>`;
}
function openNow() {
  if (db.settings.open24 == '1') return true;
  const d = new Date(); const h = db.hours.find(x => x.day == d.getDay()); if (!h || h.closed) return false;
  const m = d.getHours() * 60 + d.getMinutes(), p = s => { const [a, b] = s.split(':'); return +a * 60 + +b; };
  const o = p(h.open), c = p(h.close); return c > o ? m >= o && m < c : (m >= o || m < c);
}
// ---------- pages ----------
const pages = {
  home() {
    const bn = db.banners.length ? db.banners : [{ img: 'img/hero.jpg', link: '#/menu' }];
    const pop = db.products.filter(p => p.popular).slice(0, 8);
    return `${db.settings.sample == '1' ? `<div class="demo">${t('demo_note')}</div>` : ''}
    <div class="hero slides" id="slides">${bn.map((b, i) => `<a class="s ${i ? '' : 'on'}" href="${esc(b.link || '#/menu')}"><img src="${esc(b.img)}" alt="BISTRO 27" style="aspect-ratio:16/9;min-height:0;opacity:1"></a>`).join('')}<div class="dots">${bn.map((_, i) => `<b class="${i ? '' : 'on'}" data-slide="${i}"></b>`).join('')}</div></div>
    <div class="center" style="padding:20px 0 0"><h1>${t('hero_t')}</h1><p style="color:var(--mut);margin:6px 0 10px">${t('hero_s')}</p><p style="margin-bottom:14px"><span class="badge">🛵 ${t('fast_delivery')}</span> <span class="badge">🕐 ${t('open24')}</span></p><a class="btn" href="#/menu">🛒 ${t('order_now')}</a></div>
    <h2 class="sec">${t('cats')}</h2><div class="catgrid">${db.categories.map(c => `<a class="cat" href="#/menu/${c.id}"><div class="e">${esc(c.emoji)}</div>${esc(L(c, ''))}</a>`).join('')}</div>
    <h2 class="sec">${t('featured')}</h2><div class="grid">${pop.map(card).join('')}</div>
    ${db.offers.length ? `<h2 class="sec">${t('offers')}</h2>${db.offers.slice(0, 2).map(offerHtml).join('')}` : ''}
    ${db.reviews.length ? `<h2 class="sec">${t('reviews')}</h2><div class="revs">${db.reviews.slice(0, 6).map(r => `<div class="panel rev"><div class="st">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div><p>${esc(L(r, 'text'))}</p><small style="color:var(--mut)">${esc(r.name)}</small></div>`).join('')}</div>` : ''}`;
  },
  menu(cat) {
    if (cat) menuState.cat = cat;
    return `<h2 class="sec">${t('menu')}</h2>
    <div class="bar"><input id="q" type="search" placeholder="${t('search')}" value="${esc(menuState.q)}"><select id="sort"><option value="def">${t('sort')}: ${t('sort_def')}</option><option value="low">${t('sort_low')}</option><option value="high">${t('sort_high')}</option><option value="pop">${t('sort_pop')}</option></select></div>
    <div class="chips"><span class="chip ${menuState.cat === 'all' ? 'on' : ''}" data-cat="all">${t('all')}</span>${db.categories.map(c => `<span class="chip ${menuState.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.emoji)} ${esc(L(c, ''))}</span>`).join('')}</div>
    <div class="grid" id="mgrid"></div>`;
  },
  product(id) {
    const p = prod(id); if (!p) return pages.notfound();
    return `<a href="#/menu" style="color:var(--mut)">${lang === 'ar' ? '→' : '←'} ${t('menu')}</a><div class="two pd" style="margin-top:12px"><div class="big">${img(p)}</div><div>
    <h1>${esc(L(p, 'name'))}</h1><p style="color:var(--mut);margin:8px 0">${esc(L(p, 'desc'))}</p><div class="price" style="font-size:1.4rem" id="pprice"></div>
    ${p.sizes.length ? `<label>${t('size')}</label>${p.sizes.map((s, i) => `<label class="opt"><input type="radio" name="size" value="${esc(s.en)}" ${i ? '' : 'checked'}><span>${esc(L(s, ''))}</span><span>${s.add ? '+' + money(s.add) : ''}</span></label>`).join('')}` : ''}
    ${p.extras.length ? `<label>${t('extras')}</label>${p.extras.map(e => `<label class="opt"><input type="checkbox" name="ex" value="${esc(e.en)}"><span>${esc(L(e, ''))}</span><span>+${money(e.price)}</span></label>`).join('')}` : ''}
    <label>${t('note')}</label><input id="pnote" maxlength="120">
    <div style="display:flex;gap:12px;align-items:center;margin-top:16px"><div class="qty"><button data-q="-1">−</button><b id="pq">1</b><button data-q="1">＋</button></div><button class="btn" style="flex:1" id="padd">${t('add')}</button></div></div></div>`;
  },
  cart() {
    if (!cart.length) return `<div class="center"><div style="font-size:4rem">🛒</div><h2>${t('empty_cart')}</h2><br><a class="btn" href="#/menu">${t('go_menu')}</a></div>`;
    return `<h2 class="sec">${t('cart')}</h2><div class="two w"><div class="panel">${cart.map((l, i) => { const p = prod(l.id); if (!p) return ''; return `<div class="line"><div class="em">${img(p)}</div><div class="i"><b>${esc(L(p, 'name'))}</b><small>${[l.size && esc((p.sizes.find(s => s.en === l.size) || {}).ar && L(p.sizes.find(s => s.en === l.size), '')), ...l.extras.map(e => esc(L(p.extras.find(x => x.en === e) || {}, '')))].filter(Boolean).join(' · ')}</small><span class="price">${money(unit(l))}</span></div>
    <div class="qty"><button data-cq="${i}" data-d="-1">−</button><b>${l.qty}</b><button data-cq="${i}" data-d="1">＋</button></div><button class="icon" data-rm="${i}" aria-label="${t('remove')}">✕</button></div>`; }).join('')}</div>
    <div class="panel">${sumHtml(0)}<label>${t('coupon')}</label><div style="display:flex;gap:8px"><input id="cpn" value="${esc(coupon?.code || '')}" style="text-transform:uppercase"><button class="btn sm" id="cpnBtn">${t('apply')}</button></div><div id="cpnMsg"></div><br><a class="btn block" href="#/checkout">${t('checkout')}</a></div></div>`;
  },
  checkout() {
    if (!cart.length) { location.hash = '#/cart'; return ''; }
    const s = LS.get('b27_cust', {});
    return `<h2 class="sec">${t('checkout')}</h2><div class="two w"><form class="panel" id="cf" novalidate>
    <label>${t('name')}</label><input name="name" autocomplete="name" value="${esc(s.name || '')}" required>
    <label>${t('phone')}</label><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" value="${esc(s.phone || '')}" required>
    ${db.areas.length ? `<label>${t('area')}</label><select name="area" id="areaSel"><option value="">${t('choose_area')}</option>${db.areas.map(a => `<option value="${a.id}" data-fee="${a.fee}" ${s.area == a.id ? 'selected' : ''}>${esc(L(a, ''))} (${money(a.fee)})</option>`).join('')}</select>` : `<div class="demo" style="margin-top:12px">🛵 ${t('fast_delivery')} · ${t('delivery_note')}</div>`}
    <label>${t('address')}</label><textarea name="address" rows="2" autocomplete="street-address">${esc(s.address || '')}</textarea>
    <label>${t('notes')}</label><input name="notes" maxlength="300">
    <label>${t('payment')}</label>
    <label class="opt"><input type="radio" name="payment" value="cod" checked><span>💵 ${t('cod')}</span></label>
    ${db.settings.online == '1' ? `<label class="opt"><input type="radio" name="payment" value="online"><span>📱 ${t('vcash')} (${esc(db.settings.vodafone || db.settings.phone || '')})</span></label><div class="demo" id="vcInfo" style="display:none">${t('vcash_how').replace('{n}', esc(db.settings.vodafone || db.settings.phone || ''))}${db.settings.pay_extra ? '<br>' + esc(db.settings.pay_extra) : ''}</div>` : ''}
    <div class="err" id="ferr"></div><br><button class="btn block" id="placeBtn" type="submit">${t('place_order')}</button></form>
    <div class="panel">${cart.map(l => { const p = prod(l.id); return p ? `<div class="line"><div class="i"><b>${l.qty}× ${esc(L(p, 'name'))}</b></div><span>${money(unit(l) * l.qty)}</span></div>` : ''; }).join('')}<div id="sumBox">${sumHtml(0)}</div></div></div>`;
  },
  done(num) {
    const o = LS.get('b27_last', {}); const wa = db.settings.whatsapp;
    const ar = lang === 'ar'; const lines = (o.lines || []).map(l => `• ${l.q}× ${l.n}${l.size ? ' (' + l.size + ')' : ''}${l.ex && l.ex.length ? ' + ' + l.ex.join(', ') : ''}${l.note ? ' [' + l.note + ']' : ''} = ${l.price}`).join('\n');
    const msg = `${ar ? 'طلب جديد من الموقع' : 'New website order'}\n${ar ? 'رقم الطلب' : 'Order'}: ${num}\n${lines}\n${ar ? 'الإجمالي' : 'Total'}: ${o.total || ''} ${ar ? 'ج.م' : 'EGP'}${o.discount ? ` (${ar ? 'بعد خصم' : 'after discount'} ${o.discount})` : ''}\n${ar ? 'الاسم' : 'Name'}: ${o.name || ''}\n${ar ? 'الموبايل' : 'Phone'}: ${o.phone || ''}\n${ar ? 'العنوان' : 'Address'}: ${o.address || ''}${o.notes ? `\n${ar ? 'ملاحظات' : 'Notes'}: ${o.notes}` : ''}\n${ar ? 'الدفع' : 'Payment'}: ${o.payment === 'online' ? (ar ? 'فودافون كاش (هبعت صورة التحويل)' : 'Vodafone Cash (I will send the transfer screenshot)') : (ar ? 'كاش عند الاستلام' : 'Cash on delivery')}`;
    return `<div class="center"><h1>${t('done_title')}</h1><p style="color:var(--mut)">${t('done_num')}</p><div class="bignum">${esc(num)}</div><p>${t('done_sub')}</p>${o.payment === 'online' ? `<div class="demo" style="max-width:520px;margin:10px auto">📱 ${t('vcash_how').replace('{n}', esc(db.settings.vodafone || db.settings.phone || ''))}</div>` : ''}<p class="price">${o.total ? t('total') + ': ' + money(o.total) : ''}</p><p style="color:var(--mut);margin:14px 0 6px">${t('send_wa_hint')}</p>
    <a class="btn" style="padding:14px 26px;background:#25d366;color:#fff" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(msg)}">💬 ${t('send_wa')}</a><br><br> <a class="btn ghost" href="#/track">${t('track')}</a> <a class="btn ghost" href="#/menu">${t('menu')}</a></div>`;
  },
  track() {
    return `<h2 class="sec">${t('track_title')}</h2><form class="panel" id="tf" style="max-width:480px"><label>${t('order_number')}</label><input name="number" placeholder="B27-123456"><label>${t('phone')}</label><input name="phone" type="tel"><button class="btn block">${t('find')}</button><div id="tres"></div></form>`;
  },
  offers() {
    return `<h2 class="sec">${t('offers_t')}</h2><img src="img/offers.jpg" alt="" style="border-radius:18px;margin-bottom:16px">${db.offers.map(offerHtml).join('') || ''}`;
  },
  about() { return `<h2 class="sec">${t('about_t')}</h2><div class="two"><img src="img/about.jpg" alt="BISTRO 27" style="border-radius:18px"><div class="panel"><p>${t('about_p')}</p><br><p class="price">${t('tagline')}</p></div></div>`; },
  contact() {
    const s = db.settings;
    return `<h2 class="sec">${t('contact_t')}</h2><div class="two"><div class="panel"><p>📍 <b>${t('addr')}:</b> ${esc(lang === 'ar' ? s.address_ar : s.address_en)}</p><br><p>📞 <a class="price" href="tel:${esc(s.phone)}">${esc(s.phone)}</a></p><br><a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(s.whatsapp)}">💬 ${t('whatsapp_us')}</a></div>
    <div class="panel hrs"><h3>${t('hours')} <span class="badge ${openNow() ? '' : 'c'}">${openNow() ? t('open_now') : t('closed_now')}</span></h3><br>${db.settings.open24 == '1' ? `<div><span>${t('open24')}</span><span>🕐</span></div>` : db.hours.map(h => `<div><span>${t('days')[h.day]}</span><span>${h.closed ? '—' : esc(h.open + ' - ' + h.close)}</span></div>`).join('')}</div></div>`;
  },
  faq() { return `<h2 class="sec">${t('faq')}</h2>${I18N[lang].faq_list.map(([q, a]) => `<details class="panel" style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:700">${esc(q)}</summary><p style="margin-top:8px;color:var(--mut)">${esc(a)}</p></details>`).join('')}`; },
  privacy() { return `<h2 class="sec">${t('privacy')}</h2><div class="panel">${I18N[lang].privacy_p.map(x => `<p style="margin-bottom:10px">• ${esc(x)}</p>`).join('')}</div>`; },
  terms() { return `<h2 class="sec">${t('terms')}</h2><div class="panel">${I18N[lang].terms_p.map(x => `<p style="margin-bottom:10px">• ${esc(x)}</p>`).join('')}</div>`; },
  favorites() { const l = db.products.filter(p => favs.includes(p.id)); return `<h2 class="sec">${t('favorites')}</h2>${l.length ? `<div class="grid">${l.map(card).join('')}</div>` : `<div class="center">${t('fav_empty')}</div>`}`; },
  notfound() { return `<div class="center"><h2>404</h2><a class="btn" href="#/">${t('home')}</a></div>`; },
};
function offerHtml(o) {
  return `<div class="offer"><div style="font-size:2.2rem">🔥</div><div style="flex:1"><b>${esc(L(o, 'title'))}</b><p style="color:var(--mut)">${esc(L(o, 'desc'))}</p></div>${o.code ? `<span class="code" data-copy="${esc(o.code)}">${esc(o.code)}</span>` : `<a class="btn sm" href="${o.product ? '#/product/' + o.product : '#/menu'}">${t('order_now')}</a>`}</div>`;
}
function sumHtml(fee) {
  const sub = subtotal(); const d = coupon ? coupon.discount : 0;
  return `<div class="sum"><div><span>${t('subtotal')}</span><span>${money(sub)}</span></div>${d ? `<div><span>${t('discount')}</span><span>-${money(d)}</span></div>` : ''}${fee ? `<div><span>${t('delivery')}</span><span>${money(fee)}</span></div>` : (db.areas.length ? '' : `<div><span>${t('delivery')}</span><span style="font-size:.8rem;color:var(--mut)">${t('fast_delivery')}</span></div>`)}<div class="t"><span>${t('total')}</span><span>${money(sub - d + fee)}</span></div></div>`;
}
// ---------- render + routing ----------
function renderNav() {
  const items = [['#/', 'home'], ['#/menu', 'menu'], ['#/offers', 'offers'], ['#/about', 'about'], ['#/contact', 'contact']];
  const cur = location.hash || '#/';
  $('#nav').innerHTML = items.map(([h, k]) => `<a href="${h}" class="${cur === h || (h !== '#/' && cur.startsWith(h)) ? 'on' : ''}">${t(k)}</a>`).join('');
  $('#drawer').innerHTML = items.concat([['#/track', 'track'], ['#/faq', 'faq']]).map(([h, k]) => `<a href="${h}">${t(k)}</a>`).join('');
  $('#langBtn').textContent = t('lang');
  const s = db.settings; $('#waFloat').href = 'https://wa.me/' + s.whatsapp;
  $('#footer').innerHTML = `<p><a href="#/faq">${t('faq')}</a><a href="#/privacy">${t('privacy')}</a><a href="#/terms">${t('terms')}</a><a href="#/track">${t('track')}</a></p><p style="margin-top:8px">© BISTRO 27 · ${t('footer_rights')}</p>`;
}
function route() {
  clearInterval(slideTimer); $('#drawer').classList.remove('open');
  const h = (location.hash || '#/').slice(2).split('/'); const name = h[0] || 'home'; const f = pages[name] || pages.notfound;
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  $('#app').innerHTML = f(h[1]); renderNav(); window.scrollTo(0, 0);
  if (name === 'menu') { fillMenu(); }
  if (name === 'product') bindProduct(h[1]);
  if (name === 'home' && document.querySelectorAll('#slides .s').length > 1) slideTimer = setInterval(() => showSlide(slide + 1), 4500);
  if (name === 'checkout') bindCheckout();
  if (name === 'track') bindTrack();
  const titles = { menu: t('menu'), offers: t('offers'), about: t('about'), contact: t('contact'), cart: t('cart') };
  document.title = (titles[name] ? titles[name] + ' | ' : '') + 'BISTRO 27 | Good Food, Good Mood';
}
function showSlide(i) { const s = document.querySelectorAll('#slides .s'), d = document.querySelectorAll('#slides .dots b'); if (!s.length) return; slide = (i + s.length) % s.length; s.forEach((e, k) => e.classList.toggle('on', k === slide)); d.forEach((e, k) => e.classList.toggle('on', k === slide)); }
function fillMenu() {
  let l = db.products.filter(p => (menuState.cat === 'all' || p.cat === menuState.cat));
  const q = menuState.q.trim().toLowerCase(); if (q) l = l.filter(p => (p.name_ar + p.name_en + p.desc_ar + p.desc_en).toLowerCase().includes(q));
  if (menuState.sort === 'low') l.sort((a, b) => a.price - b.price); else if (menuState.sort === 'high') l.sort((a, b) => b.price - a.price); else if (menuState.sort === 'pop') l.sort((a, b) => b.popular - a.popular);
  $('#mgrid').innerHTML = l.map(card).join('') || `<p class="center" style="grid-column:1/-1">${t('no_results')}</p>`;
  $('#sort').value = menuState.sort;
}
function bindProduct(id) {
  const p = prod(id); if (!p) return; let q = 1;
  const calc = () => { if (!$('#pprice')) return; const l = cur(); $('#pprice').textContent = money(unit(l) * q); };
  const cur = () => ({ id: p.id, size: (document.querySelector('[name=size]:checked') || {}).value || '', extras: [...document.querySelectorAll('[name=ex]:checked')].map(x => x.value), qty: q, note: $('#pnote').value });
  $('#app').addEventListener('change', calc); calc();
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { q = Math.max(1, Math.min(50, q + +b.dataset.q)); $('#pq').textContent = q; calc(); });
  $('#padd').onclick = () => { addLine(cur()); toast(t('added')); };
}
function addLine(l) {
  const same = cart.find(x => x.id == l.id && x.size === l.size && x.note === l.note && x.extras.slice().sort().join() === l.extras.slice().sort().join());
  if (same) same.qty = Math.min(50, same.qty + l.qty); else cart.push({ ...l, id: +l.id }); save();
}
function bindCheckout() {
  document.querySelectorAll('input[name=payment]').forEach(r => r.addEventListener('change', () => { const v = document.getElementById('vcInfo'); if (v) v.style.display = document.querySelector('input[name=payment]:checked').value === 'online' ? 'block' : 'none'; }));
  const sel = $('#areaSel'); const upd = () => { const fee = sel ? +(sel.selectedOptions[0]?.dataset.fee || 0) : 0; $('#sumBox').innerHTML = sumHtml(fee); };
  if (sel) sel.onchange = upd; upd();
  $('#cf').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const err = $('#ferr'); err.textContent = '';
    const phone = (f.phone || '').replace(/[\s-]/g, '');
    if ((f.name || '').trim().length < 2) return err.textContent = t('e_name');
    if (!/^\+?\d{10,14}$/.test(phone)) return err.textContent = t('e_phone');
    if (db.areas.length && !f.area) return err.textContent = t('e_area');
    if ((f.address || '').trim().length < 5) return err.textContent = t('e_address');
    const btn = $('#placeBtn'); btn.disabled = true;
    try {
      const r = await API.order({ ...f, phone, items: cart.map(l => ({ id: l.id, size: l.size, extras: l.extras, qty: l.qty, note: l.note })), coupon: coupon?.code || '' });
      LS.set('b27_cust', { name: f.name, phone, area: f.area, address: f.address }); LS.set('b27_last', { ...r, name: f.name, phone, address: f.address, notes: f.notes || '', lines: cart.map(l => { const p = prod(l.id); return p ? { n: lang === 'ar' ? p.name_ar : p.name_en, q: l.qty, size: l.size, ex: l.extras, note: l.note, price: unit(l) * l.qty } : null; }).filter(Boolean) });
      cart = []; coupon = null; save(); location.hash = '#/done/' + r.number;
    } catch (x) { btn.disabled = false; err.textContent = x.message === 'min_order' ? t('e_min') + ' ' + money(db.settings.min_order) : t('e_generic'); }
  };
}
function bindTrack() {
  $('#tf').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const box = $('#tres');
    try {
      const r = await API.track(f.number || '', f.phone || ''); const order = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'completed']; const i = order.indexOf(r.status);
      box.innerHTML = `<br><p>${esc(r.number)} · <b>${money(r.total)}</b></p>` + (r.status === 'cancelled' ? `<div class="steps"><div class="on" style="background:var(--bad)">${t('st_cancelled')}</div></div>` : `<div class="steps">${order.map((s, k) => `<div class="${k <= i ? 'on' : ''}">${t('st_' + s)}</div>`).join('')}</div>`);
    } catch { box.innerHTML = `<p class="err">${t('no_results')}</p>`; }
  };
}
// ---------- events ----------
document.addEventListener('click', async e => {
  const g = e.target.closest('[data-go]'); if (g) { location.hash = g.dataset.go; return; }
  const a = e.target.closest('[data-add]'); if (a) { addLine({ id: +a.dataset.add, size: '', extras: [], qty: 1, note: '' }); toast(t('added')); return; }
  const f = e.target.closest('[data-fav]'); if (f) { const id = +f.dataset.fav; favs = favs.includes(id) ? favs.filter(x => x !== id) : favs.concat(id); save(); f.classList.toggle('on'); f.textContent = favs.includes(id) ? '♥' : '♡'; if (location.hash === '#/favorites') route(); return; }
  const c = e.target.closest('[data-cat]'); if (c) { menuState.cat = c.dataset.cat; document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); fillMenu(); return; }
  const cq = e.target.closest('[data-cq]'); if (cq) { const l = cart[+cq.dataset.cq]; l.qty = Math.max(1, Math.min(50, l.qty + +cq.dataset.d)); save(); route(); return; }
  const rm = e.target.closest('[data-rm]'); if (rm) { cart.splice(+rm.dataset.rm, 1); save(); route(); return; }
  const sl = e.target.closest('[data-slide]'); if (sl) { showSlide(+sl.dataset.slide); e.preventDefault(); return; }
  const cp = e.target.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); } catch { } toast(t('copied')); return; }
  if (e.target.id === 'cpnBtn') {
    const code = $('#cpn').value.trim(); const m = $('#cpnMsg'); if (!code) { coupon = null; route(); return; }
    const r = await API.coupon(code, subtotal());
    if (r.ok) { coupon = { code: r.code, discount: r.discount }; route(); setTimeout(() => { $('#cpnMsg').innerHTML = `<span class="okmsg">${t('coupon_ok')}</span>`; }, 0); }
    else { coupon = null; m.innerHTML = `<span class="err">${r.error === 'min' ? t('coupon_min') + ' ' + money(r.min) : t('coupon_invalid')}</span>`; }
  }
  if (e.target.closest('#burger')) $('#drawer').classList.toggle('open');
});
document.addEventListener('input', e => { if (e.target.id === 'q') { menuState.q = e.target.value; fillMenu(); } });
document.addEventListener('change', e => { if (e.target.id === 'sort') { menuState.sort = e.target.value; fillMenu(); } });
$('#langBtn').onclick = () => { lang = lang === 'ar' ? 'en' : 'ar'; LS.set('b27_lang', lang); route(); };
window.addEventListener('hashchange', route);
API.boot().then(d => { db = d; badges(); route(); }).catch(() => { $('#app').innerHTML = '<div class="center">Error loading. Refresh.</div>'; });
})();
