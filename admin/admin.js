(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base = (window.BISTRO_CONFIG && window.BISTRO_CONFIG.API_BASE) || '';
let token = sessionStorage.getItem('b27_admin') || '', tab = 'orders', seenNew = null, timer;
const ST = { new: 'جديد', confirmed: 'تم التأكيد', preparing: 'قيد التحضير', out_for_delivery: 'في الطريق', completed: 'مكتمل', cancelled: 'ملغي' };
const money = n => (Math.round(n * 100) / 100).toLocaleString('ar-EG') + ' ج.م';
const toast = m => { const e = $('#toast'); e.textContent = m; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 1800); };
const CFG0 = window.BISTRO_CONFIG || {}; const SBM = !!CFG0.SUPABASE_URL; const SBU = (CFG0.SUPABASE_URL || '').replace(/\/$/, ''), SBK = CFG0.SUPABASE_KEY;
let LOCAL = false;
async function sbReq(path, method = 'GET', body, extra = {}) {
  const h = { apikey: SBK, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...extra };
  const r = await fetch(SBU + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  if (r.status === 401 || (r.status === 400 && (await r.clone().text()).includes('JWT'))) { logout(); throw new Error('auth'); }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { }
  if (!r.ok) throw new Error((j && (j.message || j.msg || j.error)) || 'error'); return j;
}
const SBPK = { categories: 'id', products: 'id', areas: 'id', coupons: 'code', banners: 'id', offers: 'id', reviews: 'id', hours: 'day' };
async function sbApi(path, method, body) {
  const parts = path.split('?')[0].split('/'); const t = parts[0];
  if (t === 'stats') {
    const o = await sbReq('/rest/v1/orders?select=status,total,created_at&order=id.desc&limit=2000'); const it = await sbReq('/rest/v1/order_items?select=name_ar,name_en,qty&limit=5000');
    const ok = o.filter(x => x.status !== 'cancelled'); const today = ok.filter(x => new Date(x.created_at).toDateString() === new Date().toDateString()); const m = {};
    it.forEach(i => { m[i.name_ar] = m[i.name_ar] || { name_ar: i.name_ar, name_en: i.name_en, q: 0 }; m[i.name_ar].q += i.qty; });
    return { orders: o.length, new: o.filter(x => x.status === 'new').length, revenue: ok.reduce((a, x) => a + Number(x.total), 0), today: { s: today.reduce((a, x) => a + Number(x.total), 0), c: today.length }, top: Object.values(m).sort((a, b) => b.q - a.q).slice(0, 5) };
  }
  if (t === 'orders') {
    if (method === 'GET') { const st = path.split('status=')[1]; const rows = await sbReq('/rest/v1/orders?select=*,order_items(*)&order=id.desc&limit=300' + (st ? '&status=eq.' + st : '')); return rows.map(o => ({ ...o, items: o.order_items || [] })); }
    if (method === 'POST') { await sbReq('/rest/v1/orders?id=eq.' + parts[1], 'PATCH', { status: body.status }); return { ok: true }; }
    if (method === 'DELETE') { await sbReq('/rest/v1/orders?id=eq.' + parts[1], 'DELETE'); return { ok: true }; }
  }
  if (t === 'settings') {
    if (method === 'POST') await sbReq('/rest/v1/settings?on_conflict=k', 'POST', Object.entries(body).map(([k, v]) => ({ k, v: String(v) })), { Prefer: 'resolution=merge-duplicates' });
    return Object.fromEntries((await sbReq('/rest/v1/settings?select=k,v')).map(r => [r.k, r.v]));
  }
  if (t === 'email') { await sbReq('/auth/v1/user', 'PUT', { email: String(body.email).trim() }); return { ok: true }; }
  if (t === 'password') { if (String(body.password).length < 8) throw new Error('Password must be 8+ characters'); await sbReq('/auth/v1/user', 'PUT', { password: body.password }); return { ok: true }; }
  if (t === 'upload') {
    const blob = await (await fetch(body.data)).blob(); const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.jpg';
    const r = await fetch(SBU + '/storage/v1/object/images/' + name, { method: 'POST', headers: { apikey: SBK, Authorization: 'Bearer ' + token, 'Content-Type': 'image/jpeg' }, body: blob }); if (!r.ok) throw new Error('upload');
    return { url: SBU + '/storage/v1/object/public/images/' + name };
  }
  const pk = SBPK[t]; if (!pk) throw new Error('Not found');
  if (method === 'GET') return sbReq('/rest/v1/' + t + '?select=*&order=' + pk);
  if (method === 'POST' && !parts[1]) { const r = await sbReq('/rest/v1/' + t, 'POST', body, { Prefer: 'return=representation' }); return { ok: true, id: r && r[0] && r[0][pk] }; }
  if (method === 'POST') { const b = { ...body }; delete b[pk]; await sbReq('/rest/v1/' + t + '?' + pk + '=eq.' + encodeURIComponent(decodeURIComponent(parts[1])), 'PATCH', b); return { ok: true }; }
  if (method === 'DELETE') { await sbReq('/rest/v1/' + t + '?' + pk + '=eq.' + encodeURIComponent(decodeURIComponent(parts[1])), 'DELETE'); return { ok: true }; }
}
const LSj = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
async function localDB() { let d = LSj.get('b27_db', null); if (!d) { d = await (await fetch('../data/seed.json')).json(); LSj.set('b27_db', d); } return d; }
const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('b27' + t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const PKS = { categories: 'id', products: 'id', areas: 'id', coupons: 'code', banners: 'id', offers: 'id', reviews: 'id', hours: 'day' };
// No-server mode: everything lives in this browser (demo only).
async function localApi(path, method, body) {
  const parts = path.split('?')[0].split('/'); const db = await localDB(); const orders = LSj.get('b27_orders', []);
  const t = parts[0];
  if (t === 'stats') { const ok = orders.filter(o => o.status !== 'cancelled'); const td = ok.filter(o => o.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)); const m = {}; orders.forEach(o => o.items.forEach(i => { m[i.name_ar] = m[i.name_ar] || { name_ar: i.name_ar, name_en: i.name_en, q: 0 }; m[i.name_ar].q += i.qty; }));
    return { orders: orders.length, new: orders.filter(o => o.status === 'new').length, revenue: ok.reduce((a, o) => a + o.total, 0), today: { s: td.reduce((a, o) => a + o.total, 0), c: td.length }, top: Object.values(m).sort((a, b) => b.q - a.q).slice(0, 5) }; }
  if (t === 'orders') {
    if (method === 'GET') { const st = (path.split('status=')[1] || ''); return orders.filter(o => !st || o.status === st); }
    const o = orders.find(x => String(x.id) === parts[1]);
    if (method === 'POST' && o) { o.status = body.status; LSj.set('b27_orders', orders); return { ok: true }; }
    if (method === 'DELETE') { LSj.set('b27_orders', orders.filter(x => String(x.id) !== parts[1])); return { ok: true }; }
  }
  if (t === 'settings') { if (method === 'POST') { Object.assign(db.settings, body); LSj.set('b27_db', db); } return db.settings; }
  if (t === 'password') { if (String(body.password).length < 8) throw new Error('Password must be 8+ characters'); LSj.set('b27_pw', await sha(body.password)); return { ok: true }; }
  if (t === 'upload') return { url: body.data };
  const pk = PKS[t]; if (!pk) throw new Error('Not found');
  const list = db[t] || (db[t] = []);
  if (method === 'GET') return list.map(r => ({ ...r }));
  if (method === 'POST' && !parts[1]) { const row = { ...body }; if (pk === 'id' && typeof list[0]?.id === 'number') row.id = Math.max(0, ...list.map(r => r.id)) + 1; if (t === 'products') { row.sizes = row.sizes || []; row.extras = row.extras || []; } list.push(row); LSj.set('b27_db', db); return { ok: true, id: row[pk] }; }
  if (method === 'POST') { const r = list.find(x => String(x[pk]) === decodeURIComponent(parts[1])); if (r) Object.assign(r, body, { [pk]: r[pk] }); LSj.set('b27_db', db); return { ok: true }; }
  if (method === 'DELETE') { db[t] = list.filter(x => String(x[pk]) !== decodeURIComponent(parts[1])); LSj.set('b27_db', db); return { ok: true }; }
}
async function api(path, method = 'GET', body) {
  if (SBM) return sbApi(path, method, body);
  if (LOCAL) return localApi(path, method, body);
  const r = await fetch(base + '/api/admin/' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== 'login') { logout(); throw new Error('auth'); }
  if (!r.ok) throw new Error(j.error || 'error'); return j;
}
async function detectMode() { if (SBM) { LOCAL = false; return; } try { const r = await fetch(base + '/api/health', { cache: 'no-store' }); LOCAL = !(r.ok && (await r.json()).ok); } catch { LOCAL = true; } }
function logout() { token = ''; sessionStorage.removeItem('b27_admin'); clearInterval(timer); loginView(); }
function loginView() {
  $('#root').innerHTML = `<form class="login" id="lf"><img src="../img/logo.jpg" alt=""><h2>لوحة تحكم BISTRO 27${SBM ? ' (server)' : ''}</h2>${LOCAL ? '<p style="color:var(--gold2);font-size:.85rem">نسخة بدون سيرفر: البيانات محفوظة في هذا المتصفح فقط</p>' : ''}<label>${SBM ? 'البريد الإلكتروني' : 'اسم المستخدم'}</label><input name="u" autocomplete="username" ${SBM ? 'type="email"' : 'value="admin"'}><label>كلمة المرور</label><input name="p" type="password" autocomplete="current-password"><br><br><button class="btn" style="width:100%">دخول</button><div class="err" id="le"></div></form>`;
  $('#lf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); try { if (SBM) { const r = await fetch(SBU + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: String(f.get('u')).trim(), password: f.get('p') }) }); const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('البريد أو كلمة المرور غير صحيحة'); token = j.access_token; sessionStorage.setItem('b27_admin', token); shell(); return; } if (LOCAL) { const ph = LSj.get('b27_pw', await sha('bistro27admin')); if (f.get('u') !== 'admin' || await sha(f.get('p')) !== ph) throw new Error('بيانات الدخول غير صحيحة'); token = 'local'; sessionStorage.setItem('b27_admin', token); shell(); return; } const r = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: f.get('u'), password: f.get('p') }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); token = j.token; sessionStorage.setItem('b27_admin', token); shell(); } catch (x) { $('#le').textContent = x.message === 'Failed to fetch' ? 'السيرفر مش شغال' : x.message; } };
}
const TABS = [['orders', 'الطلبات'], ['dash', 'الإحصائيات'], ['products', 'المنتجات'], ['categories', 'الأقسام'], ['banners', 'البنرات'], ['offers', 'العروض'], ['coupons', 'الكوبونات'], ['areas', 'التوصيل'], ['reviews', 'التقييمات'], ['hours', 'المواعيد'], ['settings', 'الإعدادات']];
function shell() {
  $('#root').innerHTML = `<div class="bar"><b>BISTRO 27${SBM ? ' (server)' : ''} ⚙️</b>${TABS.map(([k, n]) => `<span class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}<i id="nb-${k}" style="display:none"></i></span>`).join('')}<a class="tab" href="../" target="_blank">الموقع ↗</a><span class="tab" id="out">خروج</span></div><main id="main"></main><div id="modal"></div>`;
  $('#out').onclick = logout; render(); clearInterval(timer); timer = setInterval(poll, 20000); poll();
}
document.addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); render(); } });
async function poll() {
  try {
    const s = await api('stats'); const nb = $('#nb-orders'); if (nb) { nb.textContent = s.new; nb.style.display = s.new ? 'inline' : 'none'; }
    if (seenNew !== null && s.orders > seenNew) { beep(); toast('طلب جديد! 🔔'); if (tab === 'orders') render(); }
    seenNew = s.orders;
  } catch { }
}
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); setTimeout(() => { o.stop(); c.close(); }, 350); } catch { } }
const imgSrc = u => !u ? '' : /^(https?:|data:|\/)/.test(u) ? u : '../' + u;
function render() { ({ orders: ordersView, dash: dashView, settings: settingsView }[tab] || (() => crud(tab)))(); }
// ----- orders -----
let ofilter = '';
async function ordersView() {
  const rows = await api('orders' + (ofilter ? '?status=' + ofilter : ''));
  $('#main').innerHTML = `<h2>الطلبات</h2><div class="row" style="margin-bottom:10px"><span class="tab ${!ofilter ? 'on' : ''}" data-of="">الكل</span>${Object.entries(ST).map(([k, n]) => `<span class="tab ${ofilter === k ? 'on' : ''}" data-of="${k}">${n}</span>`).join('')}</div>
  ${rows.map(o => `<div class="panel ord ${o.status}"><div class="row"><b>${esc(o.number)}</b><span class="badge s-${o.status}">${ST[o.status]}</span><small>${new Date(o.created_at).toLocaleString('ar-EG')}</small><span class="grow"></span><b style="color:var(--gold2)">${money(o.total)}</b></div>
  <p style="margin-top:6px">👤 ${esc(o.name)} · 📞 <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · 📍 ${esc(o.area_name)}</p><small>${esc(o.address)}${o.notes ? ' | ' + esc(o.notes) : ''}</small>
  <div style="margin:8px 0">${o.items.map(i => `<div>• ${i.qty}× ${esc(i.name_ar)} ${i.size ? '(' + esc(i.size) + ')' : ''} ${i.extras.length ? '+ ' + esc(i.extras.join(', ')) : ''} <small>${money(i.unit_price * i.qty)}${i.note ? ' - ' + esc(i.note) : ''}</small></div>`).join('')}</div>
  <small>المجموع ${money(o.subtotal)} ${o.discount ? '· خصم ' + money(o.discount) + ' (' + esc(o.coupon) + ')' : ''} · توصيل ${money(o.delivery_fee)} · ${o.payment === 'cod' ? 'كاش عند الاستلام' : 'أونلاين'}</small>
  <div class="row" style="margin-top:10px"><select data-st="${o.id}" style="width:auto">${Object.entries(ST).map(([k, n]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${n}</option>`).join('')}</select><a class="btn sm ghost" target="_blank" href="https://wa.me/${esc(waNum(o.phone))}?text=${encodeURIComponent('أهلاً ' + o.name + '، بخصوص طلبك رقم ' + o.number + ' من BISTRO 27')}">واتساب العميل</a><button class="btn sm red" data-del="${o.id}">حذف</button></div></div>`).join('') || '<div class="panel">لا توجد طلبات</div>'}`;
}
const waNum = p => p.startsWith('+') ? p.slice(1) : p.startsWith('0') ? '2' + p : p;
document.addEventListener('click', async e => {
  const f = e.target.closest('[data-of]'); if (f) { ofilter = f.dataset.of; ordersView(); return; }
  const d = e.target.closest('[data-del]'); if (d && confirm('حذف الطلب نهائياً؟')) { await api('orders/' + d.dataset.del, 'DELETE'); ordersView(); }
});
document.addEventListener('change', async e => { const s = e.target.closest('[data-st]'); if (s) { await api('orders/' + s.dataset.st, 'POST', { status: s.value }); toast('تم تحديث الحالة'); ordersView(); poll(); } });
// ----- dashboard -----
async function dashView() {
  const s = await api('stats');
  $('#main').innerHTML = `<h2>الإحصائيات</h2><div class="stats"><div class="stat"><b>${s.orders}</b><span>كل الطلبات</span></div><div class="stat"><b>${s.new}</b><span>طلبات جديدة</span></div><div class="stat"><b>${money(s.today.s)}</b><span>مبيعات اليوم (${s.today.c} طلب)</span></div><div class="stat"><b>${money(s.revenue)}</b><span>إجمالي المبيعات</span></div></div>
  <div class="panel"><h3>الأكثر مبيعاً</h3>${s.top.map(t => `<div class="item"><span class="grow">${esc(t.name_ar)}</span><b>${t.q}</b></div>`).join('') || '<small>لسه مفيش طلبات</small>'}</div>`;
}
// ----- generic CRUD -----
const CFG = {
  products: { title: 'المنتجات', pk: 'id', label: p => p.name_ar + ' · ' + money(p.price), sub: p => (p.available ? '' : 'غير متاح · ') + p.cat, thumb: p => p.img ? `<img src="${esc(imgSrc(p.img))}">` : esc(p.emoji),
    fields: [['name_ar', 'الاسم (عربي)'], ['name_en', 'Name (English)'], ['desc_ar', 'الوصف (عربي)', 'area'], ['desc_en', 'Description (English)', 'area'], ['price', 'السعر', 'number'], ['cat', 'القسم', 'cat'], ['emoji', 'إيموجي (لو مفيش صورة)'], ['img', 'صورة المنتج', 'image'], ['sizes', 'الأحجام (سطر لكل حجم: عربي|English|زيادة السعر)', 'opts'], ['extras', 'الإضافات (سطر لكل إضافة: عربي|English|السعر)', 'opts'], ['popular', 'الأكثر طلباً', 'bool'], ['new', 'جديد', 'bool'], ['available', 'متاح', 'bool']], blank: { cat: 'burger', price: 0, emoji: '🍽️', sizes: [], extras: [], available: 1, popular: 0, new: 0, img: '' } },
  categories: { title: 'الأقسام', pk: 'id', label: c => c.emoji + ' ' + c.ar, sub: c => c.en, fields: [['id', 'المعرف (إنجليزي بدون مسافات)'], ['ar', 'الاسم عربي'], ['en', 'English name'], ['emoji', 'إيموجي'], ['sort', 'الترتيب', 'number']], blank: { sort: 99, emoji: '🍽️' }, idEditable: true },
  banners: { title: 'البنرات', pk: 'id', label: b => 'بنر #' + b.id, sub: b => b.link, thumb: b => `<img src="${esc(imgSrc(b.img))}">`, fields: [['img', 'الصورة', 'image'], ['link', 'الرابط (مثل #/menu)'], ['active', 'ظاهر', 'bool']], blank: { active: 1, link: '#/menu' } },
  offers: { title: 'العروض', pk: 'id', label: o => o.title_ar, sub: o => o.code || '', fields: [['title_ar', 'العنوان عربي'], ['title_en', 'Title'], ['desc_ar', 'الوصف عربي', 'area'], ['desc_en', 'Description', 'area'], ['code', 'كود الخصم (اختياري)'], ['product', 'رقم منتج (اختياري)', 'number'], ['active', 'ظاهر', 'bool']], blank: { active: 1, product: 0, code: '' } },
  coupons: { title: 'الكوبونات', pk: 'code', label: c => c.code, sub: c => (c.type === 'percent' ? c.value + '%' : money(c.value)) + ' · حد أدنى ' + money(c.min), fields: [['code', 'الكود'], ['type', 'النوع', 'ctype'], ['value', 'القيمة', 'number'], ['min', 'الحد الأدنى للطلب', 'number'], ['active', 'مفعّل', 'bool']], blank: { type: 'percent', value: 10, min: 0, active: 1 }, idEditable: true },
  areas: { title: 'مناطق ورسوم التوصيل', pk: 'id', label: a => a.ar, sub: a => money(a.fee), fields: [['ar', 'المنطقة عربي'], ['en', 'Area'], ['fee', 'رسوم التوصيل', 'number'], ['active', 'مفعّلة', 'bool']], blank: { fee: 30, active: 1 } },
  reviews: { title: 'التقييمات', pk: 'id', label: r => r.name + ' ' + '★'.repeat(r.rating), sub: r => r.text_ar, fields: [['name', 'الاسم'], ['rating', 'التقييم (1-5)', 'number'], ['text_ar', 'التعليق عربي', 'area'], ['text_en', 'Comment', 'area'], ['show', 'ظاهر', 'bool']], blank: { rating: 5, show: 1 } },
  hours: { title: 'مواعيد العمل', pk: 'day', label: h => ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][h.day], sub: h => h.closed ? 'مغلق' : h.open + ' - ' + h.close, fields: [['open', 'يفتح (HH:MM)'], ['close', 'يقفل (HH:MM)'], ['closed', 'مغلق طول اليوم', 'bool']], noAdd: true, noDel: true },
};
let cache = {};
async function crud(name) {
  const c = CFG[name]; const rows = await api(name); cache[name] = rows; const cats = name === 'products' ? await api('categories') : [];
  if (name === 'products') cache.cats = cats;
  $('#main').innerHTML = `<div class="row"><h2 class="grow">${c.title} (${rows.length})</h2>${c.noAdd ? '' : `<button class="btn" id="addBtn">＋ إضافة</button>`}</div><div class="panel">${rows.map(r => `<div class="item"><div class="th">${c.thumb ? c.thumb(r) : ''}</div><div class="grow"><b>${esc(c.label(r))}</b><br><small>${esc(c.sub ? c.sub(r) : '')}</small></div><button class="btn sm ghost" data-edit="${esc(r[c.pk])}">تعديل</button>${c.noDel ? '' : `<button class="btn sm red" data-rmrow="${esc(r[c.pk])}">حذف</button>`}</div>`).join('') || '<small>فاضي</small>'}</div>`;
  const add = $('#addBtn'); if (add) add.onclick = () => form(name, null);
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => form(name, rows.find(r => String(r[c.pk]) === b.dataset.edit)));
  document.querySelectorAll('[data-rmrow]').forEach(b => b.onclick = async () => { if (!confirm('حذف نهائي؟')) return; try { await api(name + '/' + encodeURIComponent(b.dataset.rmrow), 'DELETE'); toast('تم الحذف'); crud(name); } catch { toast('لا يمكن الحذف (مرتبط ببيانات أخرى)'); } });
}
const optsToText = a => (a || []).map(o => [o.ar, o.en, o.add ?? o.price ?? 0].join('|')).join('\n');
const textToOpts = (t, key) => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [ar, en, n] = l.split('|').map(x => x.trim()); return { ar, en: en || ar, [key]: Number(n) || 0 }; });
function form(name, row) {
  const c = CFG[name]; const v = row || { ...(c.blank || {}) };
  const inp = ([k, label, type]) => {
    const val = v[k] ?? '';
    if (type === 'area') return `<label>${label}</label><textarea name="${k}" rows="2">${esc(val)}</textarea>`;
    if (type === 'number') return `<label>${label}</label><input name="${k}" type="number" step="any" value="${esc(val)}">`;
    if (type === 'bool') return `<label class="row" style="color:var(--ink)"><input type="checkbox" name="${k}" ${v[k] ? 'checked' : ''} style="width:auto"> ${label}</label>`;
    if (type === 'cat') return `<label>${label}</label><select name="${k}">${(cache.cats || []).map(x => `<option value="${esc(x.id)}" ${x.id === v[k] ? 'selected' : ''}>${esc(x.emoji + ' ' + x.ar)}</option>`).join('')}</select>`;
    if (type === 'ctype') return `<label>${label}</label><select name="${k}"><option value="percent" ${v[k] === 'percent' ? 'selected' : ''}>نسبة %</option><option value="fixed" ${v[k] === 'fixed' ? 'selected' : ''}>مبلغ ثابت</option></select>`;
    if (type === 'opts') return `<label>${label}</label><textarea name="${k}" rows="3" placeholder="صغير|Small|0">${esc(optsToText(v[k]))}</textarea>`;
    if (type === 'image') return `<label>${label}</label><div class="row"><div class="item th" style="width:70px;height:70px" id="imgprev">${v[k] ? `<img src="${esc(imgSrc(v[k]))}">` : '🖼️'}</div><div class="grow"><input type="file" accept="image/*" id="imgfile"><input name="${k}" id="imgurl" placeholder="أو رابط صورة" value="${esc(val)}" style="margin-top:6px"></div></div>`;
    const ro = row && c.idEditable && k === c.pk ? 'readonly' : '';
    return `<label>${label}</label><input name="${k}" value="${esc(val)}" ${ro}>`;
  };
  $('#modal').innerHTML = `<div class="modal"><form class="box" id="ef"><h3>${row ? 'تعديل' : 'إضافة'} - ${c.title}</h3>${c.fields.map(inp).join('')}<div class="err" id="fe"></div><div class="row" style="margin-top:14px"><button class="btn grow">حفظ</button><button type="button" class="btn ghost" id="cx">إلغاء</button></div></form></div>`;
  $('#cx').onclick = () => $('#modal').innerHTML = '';
  const file = $('#imgfile'); if (file) file.onchange = async () => {
    const f = file.files[0]; if (!f) return; try {
      const bmp = await createImageBitmap(f); const sc = Math.min(1, 900 / Math.max(bmp.width, bmp.height)); const cv = document.createElement('canvas'); cv.width = bmp.width * sc; cv.height = bmp.height * sc; cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const r = await api('upload', 'POST', { data: cv.toDataURL('image/jpeg', .85) }); $('#imgurl').value = r.url; $('#imgprev').innerHTML = `<img src="${esc(imgSrc(r.url))}">`; toast('تم رفع الصورة');
    } catch { toast('فشل رفع الصورة'); }
  };
  $('#ef').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target); const body = {};
    for (const [k, , type] of c.fields) {
      if (type === 'bool') body[k] = fd.get(k) ? 1 : 0; else if (type === 'number') body[k] = Number(fd.get(k)) || 0;
      else if (type === 'opts') body[k] = textToOpts(fd.get(k) || '', k === 'sizes' ? 'add' : 'price'); else body[k] = fd.get(k);
    }
    try { await api(name + (row ? '/' + encodeURIComponent(row[c.pk]) : ''), 'POST', body); $('#modal').innerHTML = ''; toast('تم الحفظ ✅'); crud(name); }
    catch (x) { $('#fe').textContent = 'تعذر الحفظ: ' + x.message; }
  };
}
// ----- settings -----
const SET = [['name', 'اسم المطعم'], ['whatsapp', 'رقم واتساب (بصيغة دولية بدون +، مثال 201012345678)'], ['phone', 'رقم الهاتف'], ['address_ar', 'العنوان عربي'], ['address_en', 'Address'], ['email', 'البريد (إيميل التواصل)'], ['vodafone', 'رقم فودافون كاش'], ['pay_extra', 'ملاحظة طرق دفع إضافية (مثال: إنستاباي على الرقم ...)'], ['min_order', 'الحد الأدنى للطلب (جنيه)']];
async function settingsView() {
  const s = await api('settings');
  $('#main').innerHTML = `<h2>الإعدادات</h2><form class="panel" id="sf">${SET.map(([k, l]) => `<label>${l}</label><input name="${k}" value="${esc(s[k] || '')}">`).join('')}<label class="row" style="color:var(--ink)"><input type="checkbox" name="online" style="width:auto" ${s.online === '1' ? 'checked' : ''}> تفعيل الدفع بفودافون كاش</label><br><button class="btn">حفظ الإعدادات</button></form>
  ${SBM ? `<form class="panel" id="ef"><h3>تغيير إيميل تسجيل الدخول</h3><label>الإيميل الجديد</label><input name="e" type="email"><br><button class="btn">تغيير</button><div class="err" id="ee"></div></form>` : ''}<form class="panel" id="pf"><h3>تغيير كلمة مرور الأدمن</h3><label>كلمة المرور الجديدة (8 أحرف على الأقل)</label><input name="p" type="password" autocomplete="new-password"><br><button class="btn">تغيير</button><div class="err" id="pe"></div></form>`;
  $('#sf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const b = {}; SET.forEach(([k]) => b[k] = f.get(k)); b.online = f.get('online') ? '1' : '0'; b.sample = '0'; await api('settings', 'POST', b); toast('تم الحفظ ✅'); };
  if ($('#ef')) $('#ef').onsubmit = async e => { e.preventDefault(); try { await api('email', 'POST', { email: new FormData(e.target).get('e') }); toast('اتغير الإيميل. لو طلب تأكيد افتح الرسالة اللي وصلتلك'); e.target.reset(); } catch (x) { $('#ee').textContent = x.message; } };
  $('#pf').onsubmit = async e => { e.preventDefault(); try { await api('password', 'POST', { password: new FormData(e.target).get('p') }); toast('تم تغيير كلمة المرور'); e.target.reset(); } catch (x) { $('#pe').textContent = x.message; } };
}
detectMode().then(() => { if (token && (SBM || LOCAL === (token === 'local'))) shell(); else loginView(); });
})();
