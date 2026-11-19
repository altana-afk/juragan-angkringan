"""
Uji end-to-end bahasa Inggris (Chrome + Playwright).

Alur: buka game dalam bahasa Indonesia → Pengaturan → pilih English → game dimuat ulang dalam bahasa Inggris →
buka semua layar (menu utama, panduan semua tab, belanja, dapur, gudang, usaha: upgrade/promosi/pengantaran/
cabang/statistik/bank, lokasi, cerita, berjualan sampai laporan, menu jeda, pencapaian) → ganti lagi ke
Bahasa Indonesia dari menu jeda dan pastikan progres tetap sama.

Di setiap layar, semua teks yang terlihat (plus aria-label, title, placeholder) diperiksa terhadap kata-kata
khas bahasa Indonesia. Nama diri (Pak Gito, Gang Melati, nasi kucing, angkringan, Juragan, ...) diabaikan.

Pakai:
    npm run build && npx vite preview --port 4173
    python tests/e2e/english.py [http://localhost:4173] [chrome]
"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
CTX = "window.__game.registry.get('gameContext')"
FF = """(mins) => { const s = window.__game.scene.getScene('AngkringanScene'); const sim = s.sales.sim; if (!sim) return 'nosim';
  const ev = sim.advance(mins); s.sales.layer.handleEvents(ev); if (ev.some(e => e.type==='ended')) s.sales.end(); return sim.minutes; }"""
COLLECT = """() => {
  const root = document.getElementById('ui-root');
  const parts = [root.innerText];
  for (const el of root.querySelectorAll('[aria-label],[title],[placeholder]'))
    for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v) parts.push(v); }
  return parts.join('\\n');
}"""

# Kata yang hampir pasti bahasa Indonesia (dicari sebagai kata utuh).
ID_WORDS = r"""yang dan untuk tidak belum sudah dengan porsi pelanggan bahan harga kamu atau saat dari bisa jika kalau
masak belanja pesanan cabang gudang tutup buka simpan pilih kembali lanjut lanjutkan semua kosong habis terjual hari lokasi
minuman makanan uang sewa gaji karyawan tempat hujan cerah berawan panas ramai sepi ini itu ada lagi akan masih sedang
persiapan berjualan pengaturan suara grafis tampilan panduan kabar keputusan pencapaian hadiah popularitas loyalitas
kepuasan laporan keuntungan rugi laba pendapatan tabungan pinjaman deposito bunga tempo minggu bulan kursi antre
terima tolak kirim batal selesai baru terbaru mengerti oke tambah kurangi hapus buang beli kosongkan cari kategori
bumbu sayur lauk karbo lainnya ongkir komisi kurir antar terlambat dingin hangat murah mahal wajar"""
ID_RE = re.compile(r'\b(' + '|'.join(sorted(set(ID_WORDS.split()), key=len, reverse=True)) + r')\b', re.IGNORECASE)
# Nama diri & istilah yang memang dipertahankan di versi Inggris.
ALLOWED = [r'Juragan Angkringan', r'Juragan', r'angkringan', r'Gang Melati', r'Gang Kenanga', r'Mbah Kardi', r'Kardi',
           r'Pak \w+', r'Bu \w+', r'Mas \w+', r'Mbak \w+', r'Om \w+', r'Bang \w+', r'Kak \w+', r'nasi kucing', r'Nasi kucing',
           r'Sri\b', r'Rp[\d.,]+[KMB]?', r'kopi tubruk', r'Griya Asri', r'Kepok', r'kepok', r'dangdut', r'keroncong',
           r'Bank Rakyat', r'tempe_\w+', r'juragan_sate', r'Sehat Hospital', r'bacem', r'Bacem']
ALLOWED_RE = re.compile('|'.join(ALLOWED))


def audit(text):
    hits = []
    for line in text.split('\n'):
        clean = ALLOWED_RE.sub(' ', line)
        m = ID_RE.search(clean)
        if m:
            hits.append(f'[{m.group(1)}] {line.strip()[:140]}')
    return hits


async def flow(browser, name, viewport, mobile):
    ctx = await browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1,
                                    locale='en-US')
    page = await ctx.new_page()
    errors, findings, visited = [], {}, []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'firebase' not in m.text.lower() and 'Failed to load resource' not in m.text else None)
    click = page.tap if mobile else page.click
    checks = {}

    async def snap(label):
        visited.append(label)
        text = await page.evaluate(COLLECT)
        if os.environ.get('I18N_DUMP'):  # simpan semua teks layar untuk ditinjau manual
            with open(os.environ['I18N_DUMP'], 'a', encoding='utf-8') as fh:
                fh.write(f'### {name} · {label}\n{text}\n')
        if os.environ.get('I18N_SHOTS'):  # tangkapan layar tiap langkah untuk cek tata letak
            await page.screenshot(path=os.path.join(os.environ['I18N_SHOTS'], f'{name}-{len(visited):02d}.png'))
        for h in audit(text):
            findings.setdefault(h, label)

    async def close_all():
        await page.evaluate("() => window.__game.registry.get('uiManager').closeAllModals()")
        await page.wait_for_timeout(250)

    # 1. Mulai dalam bahasa Indonesia, ganti ke English lewat Pengaturan di menu utama.
    await page.goto(BASE + '/?debug&lang=id')
    await page.wait_for_selector('.main-menu.is-visible', timeout=60000)
    if await page.is_visible('.sheet-changelog'):
        await click('.sheet-changelog .btn-primary'); await page.wait_for_timeout(300)
    await click('.main-menu button:has-text("Pengaturan")'); await page.wait_for_selector('.audio-modal')
    checks['judul_bahasa_dua_bahasa'] = await page.is_visible('.audio-modal h3:has-text("Bahasa · Language")')
    await click('.language-row label:has-text("English")'); await page.wait_for_selector('.language-confirm')
    checks['konfirmasi_dalam_bahasa_tujuan'] = 'Switch to English?' in await page.inner_text('.language-confirm')
    await click('.language-confirm .btn-primary')
    await page.wait_for_load_state('load'); await page.wait_for_selector('.main-menu.is-visible', timeout=60000)
    checks['html_lang_en'] = await page.evaluate("() => document.documentElement.lang") == 'en'
    checks['url_tanpa_lang'] = 'lang=' not in page.url
    await page.wait_for_timeout(600)
    if await page.is_visible('.sheet-changelog'):
        await snap('changelog')
        await click('.sheet-changelog .btn-primary'); await page.wait_for_timeout(300)
    await snap('main menu')
    checks['menu_utama_inggris'] = await page.is_visible('.main-menu button:has-text("Start Playing")')

    await click('.main-menu button:has-text("Settings")'); await page.wait_for_selector('.audio-modal'); await snap('settings')
    checks['english_terpilih'] = await page.is_checked('.language-row input[value="en"]')
    await close_all()

    await click('.main-menu button:has-text("Guide & Info")'); await page.wait_for_selector('.sheet-guide')
    tabs = await page.locator('.sheet-guide [role="tab"]').count()
    for i in range(tabs):
        await page.locator('.sheet-guide [role="tab"]').nth(i).click(); await page.wait_for_timeout(150)
        await snap(f'guide tab {i + 1}')
    checks['panduan_11_tab'] = tabs == 11
    await close_all()
    for label in ['About the game', 'Controls']:
        if await page.locator(f'.main-menu button:has-text("{label}")').count():
            await click(f'.main-menu button:has-text("{label}")'); await page.wait_for_timeout(300); await snap(label); await close_all()
    await click('.changelog-btn:not(.account-btn)'); await page.wait_for_selector('.sheet-changelog'); await snap('changelog (icon)')
    checks['changelog_inggris'] = 'Now in English' in await page.inner_text('.sheet-changelog')
    await close_all()

    # 2. Main.
    await click('.main-menu button:has-text("Start Playing")'); await page.wait_for_selector('.action-bar'); await page.wait_for_timeout(900)
    await snap('HUD + tutorial')
    await click('.hud-story'); await page.wait_for_selector('.sheet-story')
    for i in range(await page.locator('.sheet-story [data-tab]').count()):
        await page.locator('.sheet-story [data-tab]').nth(i).click(); await page.wait_for_timeout(150); await snap(f'story tab {i + 1}')
    await close_all()

    await click('.action-btn[aria-label="Shop"]'); await page.wait_for_selector('.sheet-shop'); await snap('shop')
    for ing, n in [('Rice', 2), ('Eggs', 1), ('Cooking oil', 1), ('Shallots & garlic', 1), ('Chilies', 2), ('Sweet soy sauce', 1),
                   ('Tea', 1), ('Sugar', 1), ('Boiled water', 1), ('Ice', 1), ('Tempeh', 1), ('Tofu', 1)]:
        for _ in range(n):
            await click(f'button[aria-label="Add {ing}"]')
    await snap('shop with cart')
    for chip in await page.locator('.sheet-shop .shop-chips button').all():
        await chip.click(); await page.wait_for_timeout(100); await snap('shop filter'); await chip.click()
    money_before = await page.evaluate(f"() => {CTX}.store.get().player.money")
    await click('.sheet-shop .panel-buttons .btn-primary'); await page.wait_for_timeout(300)
    checks['belanja_berhasil'] = await page.evaluate(f"() => {CTX}.store.get().player.money") < money_before
    await snap('shop after buy'); await close_all()

    if await page.is_visible('.board-storage'):
        await click('.board-storage'); await page.wait_for_timeout(400); await snap('storage'); await close_all()
    else:  # ponsel: papan stok dilipat, gudang dibuka lewat tautan di Belanja
        await click('.action-btn[aria-label="Shop"]'); await page.wait_for_selector('.sheet-shop')
        await page.locator('.sheet-shop [title="See what\'s in storage & throw out ingredients you don\'t need"]').first.click()
        await page.wait_for_timeout(400); await snap('storage'); await close_all()

    await click('.action-btn[aria-label="Prep"]'); await page.wait_for_selector('.sheet-kitchen'); await snap('kitchen')
    for r in ['Fried rice', 'Fried tempeh', 'Fried tofu', 'Iced tea', 'Hot tea']:
        await click(f'button[aria-label="Add {r} to the prep list"]')
    await click('button[aria-label="Raise the price of Iced tea"]'); await snap('kitchen with plan')
    await click('.sheet-kitchen .panel-buttons .btn-primary'); await page.wait_for_timeout(400); await snap('kitchen cooked')
    checks['masak_berhasil'] = await page.evaluate(f"() => Object.keys({CTX}.store.get().inventory.products).length > 0")
    await close_all()

    # Usaha: beri modal & syarat supaya semua panel punya isi.
    await page.evaluate(f"""() => {CTX}.store.update('uji', d => {{ d.player.money += 8000000; d.player.popularity = 80; }})""")
    for item in ['Upgrades', 'Promotion', 'Delivery', 'Branches', 'Stats', 'Bank']:
        await click('.action-usaha'); await page.wait_for_selector('.business-item')
        await click(f'.business-item:has-text("{item}")'); await page.wait_for_timeout(500)
        await snap(f'business: {item}')
        if item == 'Upgrades':
            for t in await page.locator('.sheet-upgrade .tab-btn').all():
                await t.click(); await page.wait_for_timeout(120); await snap('upgrade tab')
            await click('.sheet-upgrade .tab-btn:has-text("Cart")'); await page.wait_for_timeout(150); await snap('upgrade cart tab')
            # Gerobak dipasang lewat state (syarat hari/popularitas); alur beli sudah diuji di smoke.py.
            await page.evaluate(f"""() => {CTX}.store.update('uji', d => {{ d.upgrades.push('gerobak_standar', 'gerobak_modern'); }})""")
            await page.wait_for_timeout(1500)
        if item == 'Delivery':
            btn = page.locator('button:has-text("Use Ride-hail partnership")')
            if await btn.count():
                await btn.first.click(); await page.wait_for_timeout(300); await snap('delivery chosen')
        if item == 'Branches':
            open_btn = page.locator('button:has-text("Open Branch 1"):not([disabled])')
            if await open_btn.count():
                await open_btn.first.click(); await page.wait_for_timeout(400); await snap('branch: choose location')
                here = page.locator('button:has-text("Open here"):not([disabled])')
                if await here.count():
                    await here.first.click(); await page.wait_for_timeout(1500)
            await close_all()
            await click('.action-usaha'); await click('.business-item:has-text("Branches")'); await page.wait_for_timeout(400)
            manage = page.locator('button:has-text("Manage branch")')
            if await manage.count():
                await manage.first.click(); await page.wait_for_timeout(400); await snap('branch detail')
                hire = page.locator('button:has-text("Hire"):not([disabled])')
                if await hire.count():
                    await hire.first.click(); await page.wait_for_timeout(400); await snap('branch hired')
            checks['cabang_dibuka'] = await page.evaluate(f"() => {CTX}.store.get().branches.list.length > 0")
        if item == 'Stats':
            for t in await page.locator('.sheet-stats [role="tab"]').all():
                await t.click(); await page.wait_for_timeout(150); await snap('stats tab')
        if item == 'Bank':
            await click('.sheet-bank .bank-section:first-of-type .btn-primary'); await page.wait_for_timeout(300); await snap('bank deposit')
        await close_all()

    await click('.hud-location'); await page.wait_for_selector('.location-modal'); await snap('location'); await close_all()
    if await page.locator('.hud-day').count():
        await click('.hud-day'); await page.wait_for_timeout(300); await snap('day info'); await close_all()

    # Berjualan sampai tutup.
    await click('button[aria-label="Start Selling"]'); await page.wait_for_timeout(600); await snap('selling')
    # Obrolan dengan pelanggan bernama (sama seperti mengetuk gelembung "...").
    await page.evaluate("() => window.__game.scene.getScene('AngkringanScene').sales.talk({ named: { who: 'surti' } })")
    await page.wait_for_timeout(400)
    checks['dialog_terbuka'] = await page.locator('.dialogue-panel, [class*="dialog"]').count() > 0
    for _ in range(8):
        await snap('dialogue'); await page.keyboard.press('Enter'); await page.wait_for_timeout(250)
    for _ in range(40):
        r = await page.evaluate(FF, 5)
        if r == 'nosim':
            break
        if await page.locator('.action-btn[aria-label^="Orders"]').count() and _ == 20:
            await click('.action-btn[aria-label^="Orders"]'); await page.wait_for_timeout(300); await snap('orders panel'); await close_all()
    for _ in range(300):
        if await page.evaluate(FF, 5) == 'nosim':
            break
    await page.wait_for_selector('.sheet-report', timeout=15000); await snap('day report')
    checks['laporan_inggris'] = 'Net profit' in await page.inner_text('.sheet-report') or 'Net loss' in await page.inner_text('.sheet-report')
    await click('button:has-text("Continue to Day 2")'); await page.wait_for_timeout(900); await snap('day 2')
    await click('.action-usaha'); await click('.business-item:has-text("Stats")'); await page.wait_for_timeout(400)
    for t in await page.locator('.sheet-stats [role="tab"]').all():
        await t.click(); await page.wait_for_timeout(200); await snap('stats after day 1')
    await close_all()

    # Menu jeda, pencapaian, lalu ganti kembali ke Bahasa Indonesia.
    await page.keyboard.press('Escape'); await page.wait_for_selector('.pause-modal'); await snap('pause menu')
    await click('.pause-modal button:has-text("Achievements")'); await page.wait_for_timeout(300); await snap('achievements')
    await page.keyboard.press('Escape'); await page.wait_for_timeout(200)
    day_before = await page.evaluate(f"() => {CTX}.store.get().calendar.day")
    await click('.pause-modal button:has-text("Settings")'); await page.wait_for_selector('.audio-modal')
    await click('.language-row label:has-text("Bahasa Indonesia")'); await page.wait_for_selector('.language-confirm')
    checks['konfirmasi_balik_indonesia'] = 'Ganti ke Bahasa Indonesia?' in await page.inner_text('.language-confirm')
    await click('.language-confirm .btn-primary')
    await page.wait_for_load_state('load'); await page.wait_for_selector('.main-menu.is-visible', timeout=60000)
    checks['kembali_bahasa_indonesia'] = await page.is_visible('.main-menu button:has-text("Lanjutkan")')
    await click('.main-menu button:has-text("Lanjutkan")'); await page.wait_for_selector('.action-bar'); await page.wait_for_timeout(800)
    checks['progres_tetap'] = await page.evaluate(f"() => {CTX}.store.get().calendar.day") == day_before
    checks['nama_cabang_ikut_bahasa'] = await page.evaluate(f"() => {CTX}.store.get().branches.list.every(b => b.name.startsWith('Cabang'))")

    missing = await page.evaluate("() => window.__i18nMissing ? window.__i18nMissing() : []")
    checks['kunci_tanpa_terjemahan'] = missing
    checks['teks_indonesia_di_mode_inggris'] = [f'{h}   <- {where}' for h, where in findings.items()]
    checks['errors'] = errors
    checks['layar_diperiksa'] = len(visited)
    await ctx.close()
    return checks


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
                                          executable_path='/usr/bin/google-chrome' if len(sys.argv) > 2 else None)
        results = {}
        for name, vp, mobile in [('desktop', {'width': 1280, 'height': 800}, False), ('mobile', {'width': 360, 'height': 780}, True)]:
            results[name] = await flow(browser, name, vp, mobile)
        await browser.close()
    print(json.dumps(results, indent=1, ensure_ascii=False))
    ok = all(v is True or v == [] or k == 'layar_diperiksa' for r in results.values() for k, v in r.items())
    print('LULUS' if ok else 'GAGAL')
    sys.exit(0 if ok else 1)


asyncio.run(main())
