"""
Uji asap end-to-end (Chrome + Playwright) untuk Juragan Angkringan.

Menjalankan alur nyata di desktop (1280x800) & ponsel (390x844):
menu → tutorial → belanja → masak → atur harga → berjualan sampai tutup → laporan → hari 2 →
upgrade (dunia dibangun ulang) → pengaturan → kembali ke menu → lanjutkan,
lalu memeriksa: tidak ada error console, listener event tidak bocor, panel tidak terbuka sendiri.

Pakai:
    npm run build && npx vite preview --port 4173
    pip install playwright && playwright install chromium
    python tests/e2e/smoke.py [http://localhost:4173]
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173') + '/?debug'
FF = """(mins) => { const s = window.__game.scene.getScene('AngkringanScene'); const sim = s.sales.sim; if (!sim) return 'nosim';
  const ev = sim.advance(mins); s.sales.layer.handleEvents(ev); if (ev.some(e => e.type==='ended')) s.sales.end(); return sim.minutes; }"""
PROBE = """() => { const g=window.__game; const c=g.registry.get('gameContext'); return { listeners: c.bus.totalListeners(),
  modals: document.querySelectorAll('.modal').length, money: c.store.get().player.money, day: c.store.get().calendar.day }; }"""


async def flow(browser, name, viewport, mobile):
    ctx = await browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    page = await ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    click = page.tap if mobile else page.click
    checks = {}

    await page.goto(URL)
    await page.wait_for_selector('.main-menu.is-visible', timeout=60000)
    # catatan pembaruan muncul sendiri sekali, lalu ditutup
    await page.wait_for_selector('.sheet-changelog', timeout=5000)
    checks['changelog_muncul_sekali'] = await page.is_visible('.sheet-changelog')
    await click('.sheet-changelog .btn-primary'); await page.wait_for_timeout(300)
    checks['changelog_titik_hilang'] = not await page.is_visible('.changelog-dot')
    await click('text=Mulai Bermain'); await page.wait_for_selector('.action-bar'); await page.wait_for_timeout(900)
    base = await page.evaluate(PROBE)
    checks['tutorial_tampil'] = await page.is_visible('.tutorial-coach.is-visible')

    await click('.action-btn:has-text("Belanja")'); await page.wait_for_selector('.sheet-shop')
    for ing, n in [('Beras', 2), ('Telur', 1), ('Minyak goreng', 1), ('Bawang', 1), ('Cabai', 2), ('Kecap', 1),
                   ('Teh', 1), ('Gula', 1), ('Air matang', 1), ('Es batu', 1), ('Tempe', 1), ('Tahu', 1)]:
        for _ in range(n):
            await click(f'button[aria-label="Tambah {ing}"]')
    await click('.sheet-shop .panel-buttons .btn-primary'); await page.wait_for_timeout(300)
    await click('.sheet-shop .modal-close'); await page.wait_for_timeout(300)
    checks['uang_berkurang'] = (await page.evaluate(PROBE))['money'] < base['money']

    await click('.action-btn:has-text("Persiapan")'); await page.wait_for_selector('.sheet-kitchen')
    for r in ['Nasi goreng', 'Tempe goreng', 'Tahu goreng', 'Es teh', 'Teh hangat']:
        await click(f'button[aria-label="Tambah {r} ke daftar persiapan"]')
    await click('button[aria-label="Naikkan harga Es teh"]')
    await click('.sheet-kitchen .panel-buttons .btn-primary'); await page.wait_for_timeout(400)
    await click('.sheet-kitchen .modal-close'); await page.wait_for_timeout(300)

    await click('button[aria-label="Mulai Berjualan"]'); await page.wait_for_timeout(500)
    for _ in range(300):
        if await page.evaluate(FF, 5) == 'nosim':
            break
    await page.wait_for_selector('.sheet-report', timeout=15000)
    checks['laporan'] = 'Laba' in await page.inner_text('.report')
    await click('text=Lanjutkan ke Hari 2'); await page.wait_for_timeout(700)
    checks['hari_2'] = (await page.evaluate(PROBE))['day'] == 2

    # upgrade → dunia dibangun ulang
    await page.evaluate("""() => window.__game.registry.get('gameContext').store.update('uji', d => { d.player.money += 2000000; })""")
    await click('.action-btn:has-text("Upgrade")'); await page.wait_for_selector('.sheet-upgrade')
    await click('.sheet-upgrade .tab-btn:has-text("Kapasitas")')
    await click('.sheet-upgrade .item-row:has-text("Bangku tambahan") button')
    await page.wait_for_timeout(1500); await page.wait_for_selector('.sheet-upgrade', timeout=20000)
    await page.evaluate("() => window.__game.registry.get('uiManager').closeAllModals()")
    checks['upgrade_terpasang'] = await page.evaluate("() => window.__game.registry.get('gameContext').store.get().upgrades.includes('bangku_tambahan')")

    # bank: deposito lalu tarik
    await click('.action-btn:has-text("Bank")'); await page.wait_for_selector('.sheet-bank')
    await click('.sheet-bank .bank-section:first-of-type .btn-primary'); await page.wait_for_timeout(300)
    checks['deposito'] = await page.evaluate("() => window.__game.registry.get('gameContext').store.get().bank.deposits.length === 1")
    await click('.sheet-bank button[aria-label^="Tarik deposito"]'); await page.wait_for_selector('.modal:has-text("Tarik deposito?")')
    await click('.modal:has-text("Tarik deposito?") .btn-primary'); await page.wait_for_timeout(300)
    checks['tarik_deposito'] = await page.evaluate("() => window.__game.registry.get('gameContext').store.get().bank.deposits.length === 0")
    await page.evaluate("() => window.__game.registry.get('uiManager').closeAllModals()")

    # pindah lokasi saat persiapan
    await page.evaluate("() => window.__game.registry.get('uiManager').closeAllModals()")
    await click('.hud-location'); await page.wait_for_selector('.location-modal')
    await click('button[aria-label="Pindah ke Pinggir Pasar"]'); await page.wait_for_selector('.modal:has-text("Pindah ke Pinggir Pasar?")')
    await click('.modal:has-text("Pindah ke Pinggir Pasar?") .btn-primary'); await page.wait_for_timeout(2500)
    checks['pindah_lokasi'] = await page.evaluate("() => window.__game.registry.get('gameContext').store.get().mapId === 'pasar'")

    # pengaturan dari menu jeda
    await page.keyboard.press('Escape'); await page.wait_for_selector('.pause-modal')
    await click('text=Pengaturan'); await page.wait_for_selector('.audio-modal')
    await click('.audio-modal .btn-primary'); await page.wait_for_timeout(200)

    # ke menu & lanjutkan
    await click('text=Kembali ke menu utama'); await click('text=Ya, keluar')
    await page.wait_for_selector('.main-menu.is-visible', timeout=20000); await page.wait_for_timeout(600)
    checks['changelog_tidak_muncul_lagi'] = not await page.is_visible('.sheet-changelog')
    await click('.changelog-btn'); await page.wait_for_selector('.sheet-changelog')
    checks['changelog_lewat_ikon'] = await page.locator('.changelog-entry').count() >= 13
    await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
    await click('text=Lanjutkan'); await page.wait_for_selector('.action-bar'); await page.wait_for_timeout(1200)
    after = await page.evaluate(PROBE)
    checks['tidak_ada_panel_sendiri'] = after['modals'] == 0
    checks['listener_stabil'] = after['listeners'] <= base['listeners'] + 1
    checks['errors'] = errors
    await ctx.close()
    return checks


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
                                          executable_path='/usr/bin/google-chrome' if len(sys.argv) > 2 else None)
        results = {}
        for name, vp, mobile in [('desktop', {'width': 1280, 'height': 800}, False), ('mobile', {'width': 390, 'height': 844}, True)]:
            results[name] = await flow(browser, name, vp, mobile)
        await browser.close()
    print(json.dumps(results, indent=1, ensure_ascii=False))
    ok = all(v is True or v == [] for r in results.values() for v in r.values())
    print('LULUS' if ok else 'GAGAL')
    sys.exit(0 if ok else 1)


asyncio.run(main())
