import type { GameContext } from '../core/GameContext';
import type { Branch, BranchDayReport, GameState } from '../core/GameState';
import { BRANCH_SLOTS, BRANCH_UPGRADES, dailyWage, STAFF_RULES, WAGE_PLANS, wagePlanById } from '../data/branches';
import { eventById } from '../data/events';
import { LOCATIONS, locationById } from '../data/locations';
import { BRANCH_STATUS_LABEL, BRANCH_STATUS_TONE, branchNeedsAttention, branchStatus, branchStockTotal } from '../systems/BranchStatusSystem';
import { contractFree, hireCost, staffPerformance, wageDue } from '../systems/BranchStaffSystem';
import { shipFee } from '../systems/BranchSupplySystem';
import { branchDemand, branchEvent, branchOperational, canOpenBranch, occupiedLocations } from '../systems/BranchSystem';
import { totalQty } from '../systems/InventorySystem';
import { isDrink, sortRecipesForMenu } from '../systems/RecipeSystem';
import { salePriceOf } from '../systems/PricingSystem';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import { CATEGORY_LABEL } from './KitchenPanel';
import { itemIcon, stepper } from './itemIcon';
import type { ModalHandle, UIManager } from './UIManager';

/** Saringan daftar kirim stok (diingat selama permainan berjalan). */
let shipFilter: 'semua' | 'makanan' | 'minuman' = 'semua';

type View = { kind: 'list' } | { kind: 'detail'; slot: number } | { kind: 'location'; slot: number | null };

/**
 * Panel Cabang (0.14.0): daftar 3 slot cabang, detail cabang (status, karyawan & gaji, stok,
 * biaya, upgrade, buka/tutup, pindah lokasi), pilih lokasi, dan kirim stok dari toko utama.
 */
export function openBranchPanel(ctx: GameContext, ui: UIManager, startSlot: number | null = null): ModalHandle {
  const body = el('div', { className: 'branch-body' });
  let view: View = startSlot === null ? { kind: 'list' } : { kind: 'detail', slot: startSlot };
  /** Jumlah yang akan dikirim per produk (tidak disimpan di state sampai tombol Kirim). */
  const shipPlan = new Map<string, number>();
  let handle: ModalHandle | null = null;

  const go = (next: View): void => {
    view = next;
    shipPlan.clear();
    render();
    body.parentElement?.scrollTo?.({ top: 0 });
  };
  const notify = (r: { ok: boolean; message: string }): void => ctx.notify(r.message, r.ok ? 'success' : 'error');

  const render = (): void => {
    const s = ctx.store.get();
    const nodes = view.kind === 'list' ? listView(s) : view.kind === 'detail' ? detailView(s, view.slot) : locationView(s, view.slot);
    body.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null));
  };

  // ---------- Daftar slot ----------
  const listView = (s: Readonly<GameState>): (HTMLElement | null)[] => {
    const check = canOpenBranch(s);
    const total = s.branches.list.reduce((sum, b) => sum + branchOperational(b) + wageDue(s, b), 0);
    return [
      el('p', {
        className: 'guide-text',
        text: 'Cabang berjualan sendiri di latar belakang selama jam jualan toko utama. Cabang butuh karyawan dan produk siap jual yang kamu kirim dari sini.',
      }),
      s.branches.list.length
        ? el('p', {
            className: 'panel-note',
            text: `Biaya harian semua cabang ±${formatRupiah(total)} (sewa, operasional & gaji).`,
          })
        : null,
      el('div', {
        className: 'branch-slots',
        children: BRANCH_SLOTS.map((def) => {
          const b = s.branches.list.find((x) => x.slot === def.slot);
          if (b) return branchCard(s, b);
          const isNext = def.slot === s.branches.list.length;
          return el('article', {
            className: `branch-card is-empty${isNext ? '' : ' is-locked'}`,
            children: [
              el('div', {
                className: 'branch-card-head',
                children: [
                  el('strong', { text: def.name }),
                  el('span', {
                    className: 'guide-badge',
                    text: isNext ? 'Belum dibuka' : '🔒 Terkunci',
                  }),
                ],
              }),
              el('ul', {
                className: 'branch-reqs',
                children: [
                  req(`Level usaha ${def.minLevel}`, isNext ? !check.reasons.some((r) => r.includes('level usaha')) : false),
                  req(`Popularitas ${def.minPopularity}`, s.player.popularity >= def.minPopularity),
                  req(`Kas ${formatRupiah(def.openCost)}`, s.player.money >= def.openCost),
                ],
              }),
              isNext
                ? el('button', {
                    className: 'btn btn-primary',
                    text: `Buka ${def.name} · ${formatRupiah(def.openCost)}`,
                    attrs: {
                      type: 'button',
                      ...(check.ok && s.phase === 'persiapan' ? {} : { disabled: '' }),
                    },
                    onClick: () => go({ kind: 'location', slot: null }),
                  })
                : el('p', {
                    className: 'muted branch-small',
                    text: `Buka ${BRANCH_SLOTS[def.slot - 1]?.name ?? 'cabang sebelumnya'} dulu.`,
                  }),
              isNext && !check.ok
                ? el('p', {
                    className: 'panel-warning branch-small',
                    text: check.reasons.join(' '),
                  })
                : null,
            ],
          });
        }),
      }),
    ];
  };

  const req = (text: string, ok: boolean): HTMLElement =>
    el('li', {
      className: ok ? 'is-ok' : 'is-missing',
      text: `${ok ? '✓' : '✗'} ${text}`,
    });

  const statusChip = (b: Readonly<Branch>): HTMLElement => {
    const st = branchStatus(b);
    return el('span', {
      className: `branch-status tone-${BRANCH_STATUS_TONE[st]}`,
      text: BRANCH_STATUS_LABEL[st],
    });
  };

  const branchCard = (s: Readonly<GameState>, b: Readonly<Branch>): HTMLElement => {
    const loc = locationById(b.mapId);
    return el('article', {
      className: `branch-card${branchNeedsAttention(b) ? ' has-dot' : ''}`,
      children: [
        el('div', {
          className: 'branch-card-head',
          children: [el('strong', { text: b.name }), statusChip(b)],
        }),
        el('div', {
          className: 'branch-line',
          text: `📍 ${loc.name} · ⭐ popularitas ${Math.round(b.popularity)}`,
        }),
        el('div', {
          className: 'branch-line',
          text: b.staff ? `👤 ${b.staff.name} · gaji ${wagePlanById(b.staff.plan).name.toLowerCase()}` : '👤 Belum ada karyawan',
        }),
        el('div', {
          className: 'branch-line',
          text: `📦 ${branchStockTotal(b)} porsi siap jual · biaya ±${formatRupiah(branchOperational(b) + wageDue(s, b))}/hari`,
        }),
        branchNeedsAttention(b)
          ? el('p', {
              className: 'panel-warning branch-small',
              text: !b.staff ? 'Rekrut karyawan supaya cabang bisa berjualan.' : 'Kirim produk supaya cabang bisa berjualan.',
            })
          : null,
        el('button', {
          className: 'btn btn-secondary',
          text: 'Kelola cabang',
          attrs: { type: 'button' },
          onClick: () => go({ kind: 'detail', slot: b.slot }),
        }),
      ],
    });
  };

  // ---------- Detail ----------
  const detailView = (s: Readonly<GameState>, slot: number): (HTMLElement | null)[] => {
    const b = s.branches.list.find((x) => x.slot === slot);
    if (!b) return listView(s);
    const loc = locationById(b.mapId);
    const prep = s.phase === 'persiapan';
    const evId = b.open ? branchEvent(s, ctx.catalog, b) : null;
    const back = el('button', {
      className: 'link-btn branch-back',
      text: '← Semua cabang',
      attrs: { type: 'button' },
      onClick: () => go({ kind: 'list' }),
    });
    const st = branchStatus(b);

    const header = el('div', {
      className: 'branch-detail-head',
      children: [
        el('div', {
          className: 'branch-detail-title',
          children: [el('strong', { text: `${b.name} · ${loc.name}` }), statusChip(b)],
        }),
        el('div', {
          className: 'branch-actions',
          children: [
            el('button', {
              className: `btn ${b.open ? 'btn-secondary' : 'btn-primary'}`,
              text: b.open ? 'Tutup sementara' : 'Buka lagi',
              attrs: { type: 'button', ...(prep ? {} : { disabled: '' }) },
              onClick: () => notify(ctx.actions.setBranchOpen(slot, !b.open)),
            }),
            el('button', {
              className: 'btn btn-secondary',
              text: 'Pindah lokasi',
              attrs: {
                type: 'button',
                ...(prep && b.lastMoveDay !== s.calendar.day ? {} : { disabled: '' }),
              },
              onClick: () => go({ kind: 'location', slot }),
            }),
          ],
        }),
      ],
    });

    const facts = el('ul', {
      className: 'about-list',
      children: [
        `Event hari ini di ${loc.name}: ${evId ? `${eventById(evId).icon} ${eventById(evId).name}` : 'tidak ada'}`,
        `Biaya operasional: ${formatRupiah(branchOperational(b))}/hari (sewa ${formatRupiah(b.open ? loc.rent : 0)} + dasar)${b.open ? '' : ' — tutup, tidak dibayar'}`,
        st === 'penuh' ? `Perkiraan laku hari ini: ±${Math.round(branchDemand(s, ctx.catalog, b))} porsi (dibatasi stok)` : null,
        `Popularitas cabang: ${Math.round(b.popularity)}/100`,
      ]
        .filter((t): t is string => t !== null)
        .map((t) => el('li', { text: t })),
    });

    return [
      back,
      header,
      prep
        ? null
        : el('p', {
            className: 'panel-note',
            text: 'Saat berjualan, cabang hanya bisa dilihat. Ubah pengaturan saat persiapan.',
          }),
      facts,
      staffSection(s, b, prep),
      stockSection(s, b, prep),
      upgradeSection(s, b, prep),
    ];
  };

  const staffSection = (s: Readonly<GameState>, b: Readonly<Branch>, prep: boolean): HTMLElement => {
    const parts: (HTMLElement | null)[] = [el('h3', { className: 'section-title', text: 'Karyawan & gaji' })];
    if (!b.staff) {
      const cost = hireCost(b);
      parts.push(
        el('p', {
          className: 'panel-note',
          text: cost ? `Merekrut lagi kena biaya ${formatRupiah(cost)}.` : 'Karyawan pertama tanpa biaya rekrut.',
        }),
      );
      parts.push(
        el('div', {
          className: 'branch-plans',
          children: WAGE_PLANS.map((p) =>
            el('div', {
              className: 'branch-plan',
              children: [
                el('strong', { text: p.name }),
                el('span', {
                  className: 'branch-plan-price',
                  text: `${formatRupiah(p.amount)} / ${p.periodDays === 1 ? 'hari' : p.periodDays === 7 ? 'minggu' : 'bulan'}`,
                }),
                el('span', {
                  className: 'muted branch-small',
                  text: `±${formatRupiah(dailyWage(p.id))} per hari · ${p.description}`,
                }),
                el('button', {
                  className: 'btn btn-primary btn-sm',
                  text: 'Rekrut',
                  attrs: { type: 'button', ...(prep ? {} : { disabled: '' }) },
                  onClick: () => notify(ctx.actions.hireBranchStaff(b.slot, p.id)),
                }),
              ],
            }),
          ),
        }),
      );
    } else {
      const staff = b.staff;
      const free = contractFree(s, b);
      parts.push(
        el('div', {
          className: 'branch-staff',
          children: [
            el('div', {
              className: 'branch-line',
              children: [
                el('strong', { text: `👤 ${staff.name}` }),
                el('span', {
                  text: ` · gaji ${wagePlanById(staff.plan).name.toLowerCase()} ${formatRupiah(dailyWage(staff.plan))}/hari`,
                }),
              ],
            }),
            el('div', {
              className: 'branch-line',
              text: `Kinerja ${Math.round(staffPerformance(b) * 100)}%${staff.lateStreak ? ` · gaji telat ${staff.lateStreak}× berturut-turut (keluar jika ${STAFF_RULES.quitAfterLate}×)` : ''}`,
            }),
            staff.plan !== 'harian'
              ? el('div', {
                  className: 'branch-line muted',
                  text: free ? 'Masa ikatan sudah selesai.' : `Terikat sampai hari ${staff.boundUntil}.`,
                })
              : null,
            staff.lateStreak
              ? el('p', {
                  className: 'panel-warning branch-small',
                  text: 'Gaji telat: penyajian memburuk, stok kurang diawasi, selisih kas naik. Jaga kas cukup saat tutup.',
                })
              : null,
          ],
        }),
      );
      parts.push(
        el('div', {
          className: 'branch-actions',
          children: [
            ...WAGE_PLANS.filter((p) => p.id !== staff.plan).map((p) =>
              el('button', {
                className: 'btn btn-secondary btn-sm',
                text: `Ganti ke ${p.name.toLowerCase()}`,
                attrs: {
                  type: 'button',
                  ...(prep && free ? {} : { disabled: '' }),
                },
                onClick: () => notify(ctx.actions.changeBranchWage(b.slot, p.id)),
              }),
            ),
            el('button', {
              className: 'btn btn-secondary btn-sm',
              text: 'Berhentikan',
              attrs: {
                type: 'button',
                ...(prep && free ? {} : { disabled: '' }),
              },
              onClick: () => notify(ctx.actions.dismissBranchStaff(b.slot)),
            }),
          ],
        }),
      );
    }
    return el('section', { className: 'branch-section', children: parts });
  };

  const stockSection = (s: Readonly<GameState>, b: Readonly<Branch>, prep: boolean): HTMLElement => {
    const stockRows = Object.entries(b.stock)
      .map(([id, batches]) => [id, totalQty(batches)] as const)
      .filter(([, q]) => q > 0);
    const parts: (HTMLElement | null)[] = [
      el('h3', {
        className: 'section-title',
        text: `Stok cabang · ${branchStockTotal(b)} porsi`,
      }),
      stockRows.length
        ? el('div', {
            className: 'product-stock',
            children: stockRows.map(([id, q]) =>
              el('span', {
                className: 'stock-chip',
                children: [itemIcon(ctx.catalog.recipe(id).icon), el('span', { text: `${ctx.catalog.recipe(id).name} ×${q}` })],
              }),
            ),
          })
        : el('p', { className: 'muted', text: 'Belum ada produk di cabang.' }),
    ];
    // Kirim stok dari toko utama.
    const fee = shipFee(s, b);
    const filter = el('div', {
      className: 'menu-filter',
      attrs: { role: 'group', 'aria-label': 'Saring produk' },
      children: (
        [
          ['semua', 'Semua'],
          ['makanan', 'Makanan'],
          ['minuman', 'Minuman'],
        ] as const
      ).map(([id, label]) =>
        el('button', {
          className: `filter-btn${shipFilter === id ? ' is-active' : ''}`,
          text: label,
          attrs: { type: 'button', 'aria-pressed': String(shipFilter === id) },
          onClick: () => {
            if (shipFilter === id) return;
            shipFilter = id;
            render();
            body.querySelector('.branch-ship-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }),
      ),
    });
    parts.push(
      el('div', {
        className: 'menu-head branch-ship-head',
        children: [
          el('h3', {
            className: 'section-title',
            text: 'Kirim stok dari toko utama',
          }),
          b.open ? filter : null,
        ],
      }),
    );
    if (!b.open) {
      parts.push(
        el('p', {
          className: 'panel-warning',
          text: 'Cabang sedang tutup — buka lagi dulu sebelum mengirim stok.',
        }),
      );
      return el('section', { className: 'branch-section', children: parts });
    }
    const allAvail = sortRecipesForMenu(ctx.catalog.recipes, s.unlockedRecipes).filter((r) => totalQty(s.inventory.products[r.id]) > 0);
    const avail = allAvail.filter((r) => shipFilter === 'semua' || (shipFilter === 'minuman') === isDrink(r));
    if (!allAvail.length) {
      parts.push(
        el('p', {
          className: 'muted',
          text: 'Toko utama belum punya produk siap jual. Masak dulu di Persiapan.',
        }),
      );
      return el('section', { className: 'branch-section', children: parts });
    }
    parts.push(
      el('p', {
        className: 'panel-note',
        text: `${fee ? `Ongkos kirim ${formatRupiah(fee)} sekali kirim` : 'Gratis ongkir (kurir sendiri / motor cabang)'}. Produk yang kedaluwarsa malam ini akan terbuang di cabang.`,
      }),
    );
    const total = el('strong');
    const sendBtn = el('button', {
      className: 'btn btn-primary',
      attrs: { type: 'button' },
    });
    const refreshTotal = (): void => {
      const n = [...shipPlan.values()].reduce((a, q) => a + q, 0);
      total.textContent = `${n} porsi dipilih`;
      sendBtn.textContent = n ? `Kirim ${n} porsi` : 'Kirim';
      sendBtn.disabled = !prep || n === 0;
    };
    sendBtn.addEventListener('click', () => {
      const r = ctx.actions.shipToBranch(b.slot, Object.fromEntries(shipPlan));
      notify(r);
      if (r.ok) {
        shipPlan.clear();
        render();
      }
    });
    const card = (r: (typeof avail)[number]): HTMLElement => {
      const have = totalQty(s.inventory.products[r.id]);
      const st = stepper(
        r.name,
        shipPlan.get(r.id) ?? 0,
        (v) => {
          shipPlan.set(r.id, v);
          st.set(v);
          refreshTotal();
        },
        have,
      );
      return el('div', {
        className: 'recipe-card',
        children: [
          itemIcon(r.icon),
          el('div', {
            className: 'recipe-info',
            children: [
              el('div', { className: 'item-name', text: r.name }),
              el('div', {
                className: 'item-meta',
                text: CATEGORY_LABEL[r.category],
              }),
              el('div', {
                className: 'item-meta',
                text: `Harga ${formatRupiah(salePriceOf(s, r))}`,
              }),
              el('div', {
                className: 'item-meta',
                text: `Di toko utama: ${have}`,
              }),
            ],
          }),
          el('div', {
            className: 'branch-ship-ctrl',
            children: [
              st.root,
              el('button', {
                className: 'link-btn',
                text: 'Semua',
                attrs: { type: 'button' },
                onClick: () => {
                  shipPlan.set(r.id, have);
                  st.set(have);
                  refreshTotal();
                },
              }),
            ],
          }),
        ],
      });
    };
    const group = (title: string, list: typeof avail): HTMLElement[] =>
      list.length
        ? [
            el('div', {
              className: 'recipe-group-title',
              text: `${title} · ${list.length}`,
            }),
            ...list.map(card),
          ]
        : [];
    parts.push(
      el('div', {
        className: 'recipe-grid',
        children: avail.length
          ? [
              ...group(
                'Makanan',
                avail.filter((r) => !isDrink(r)),
              ),
              ...group('Minuman', avail.filter(isDrink)),
            ]
          : [
              el('p', {
                className: 'muted',
                text: shipFilter === 'minuman' ? 'Tidak ada minuman siap jual di toko utama.' : 'Tidak ada makanan siap jual di toko utama.',
              }),
            ],
      }),
    );
    parts.push(el('div', { className: 'branch-ship-foot', children: [total, sendBtn] }));
    refreshTotal();
    return el('section', { className: 'branch-section', children: parts });
  };

  const upgradeSection = (s: Readonly<GameState>, b: Readonly<Branch>, prep: boolean): HTMLElement =>
    el('section', {
      className: 'branch-section',
      children: [
        el('h3', { className: 'section-title', text: 'Upgrade cabang' }),
        ...BRANCH_UPGRADES.map((u) => {
          const owned = b.upgrades.includes(u.id);
          return el('div', {
            className: `branch-upgrade${owned ? ' is-owned' : ''}`,
            children: [
              el('span', {
                className: 'branch-upgrade-icon',
                text: u.icon,
                attrs: { 'aria-hidden': 'true' },
              }),
              el('div', {
                className: 'branch-upgrade-info',
                children: [
                  el('strong', { text: u.name }),
                  el('span', {
                    className: 'muted branch-small',
                    text: u.description,
                  }),
                ],
              }),
              owned
                ? el('span', {
                    className: 'guide-badge tone-good',
                    text: 'Terpasang',
                  })
                : el('button', {
                    className: 'btn btn-secondary btn-sm',
                    text: formatRupiah(u.cost),
                    attrs: {
                      type: 'button',
                      'aria-label': `Beli ${u.name} ${formatRupiah(u.cost)}`,
                      ...(prep && s.player.money >= u.cost ? {} : { disabled: '' }),
                    },
                    onClick: () => notify(ctx.actions.buyBranchUpgrade(b.slot, u.id)),
                  }),
            ],
          });
        }),
      ],
    });

  // ---------- Pilih lokasi (buka cabang baru / pindah) ----------
  const locationView = (s: Readonly<GameState>, slot: number | null): (HTMLElement | null)[] => {
    const used = occupiedLocations(s, slot);
    const b = slot === null ? null : (s.branches.list.find((x) => x.slot === slot) ?? null);
    const def = slot === null ? BRANCH_SLOTS[s.branches.list.length] : null;
    return [
      el('button', {
        className: 'link-btn branch-back',
        text: '← Kembali',
        attrs: { type: 'button' },
        onClick: () => go(slot === null ? { kind: 'list' } : { kind: 'detail', slot }),
      }),
      el('p', {
        className: 'guide-text',
        text: b
          ? `Pilih lokasi baru untuk ${b.name}. Popularitas cabang turun sebagian karena pelanggan tetap tertinggal.`
          : `Pilih lokasi ${def?.name ?? 'cabang'}. Satu lokasi hanya untuk satu angkringan yang buka.`,
      }),
      el('div', {
        className: 'branch-locations',
        children: LOCATIONS.map((loc) => {
          const owner = used.get(loc.id) ?? null;
          const current = b?.mapId === loc.id;
          const ev = branchEvent(s, ctx.catalog, {
            ...(b ?? ({} as Branch)),
            mapId: loc.id,
          } as Branch);
          const price = b ? loc.moveCost : (def?.openCost ?? 0);
          const blocked = owner !== null || current;
          return el('article', {
            className: `guide-card branch-location${blocked ? ' is-dim' : ''}`,
            children: [
              el('div', {
                className: 'guide-card-body',
                children: [
                  el('div', {
                    className: 'guide-card-head',
                    children: [
                      el('strong', { text: loc.name }),
                      owner
                        ? el('span', {
                            className: 'guide-badge',
                            text: `Dipakai ${owner}`,
                          })
                        : current
                          ? el('span', {
                              className: 'guide-badge',
                              text: 'Lokasi sekarang',
                            })
                          : null,
                    ],
                  }),
                  el('p', { className: 'guide-line', text: loc.tagline }),
                  el('p', {
                    className: 'guide-line muted',
                    text: `Sewa ${formatRupiah(loc.rent)}/hari${ev ? ` · event hari ini: ${eventById(ev).icon} ${eventById(ev).name}` : ''}`,
                  }),
                  el('button', {
                    className: 'btn btn-primary btn-sm',
                    text: b ? `Pindah ke sini · ${formatRupiah(price)}` : `Buka di sini · ${formatRupiah(price)}`,
                    attrs: {
                      type: 'button',
                      ...(blocked || s.phase !== 'persiapan' ? { disabled: '' } : {}),
                    },
                    onClick: () => {
                      if (b) {
                        const r = ctx.actions.moveBranch(b.slot, loc.id);
                        notify(r);
                        if (r.ok) go({ kind: 'detail', slot: b.slot });
                        return;
                      }
                      const r = ctx.actions.openBranch(loc.id);
                      notify(r);
                      if (r.ok) {
                        go({ kind: 'detail', slot: r.value.slot });
                        if (!ctx.store.get().branches.flags.hint)
                          ctx.bus.emit('story:hint', {
                            show: true,
                            kind: 'branch',
                          });
                      }
                    },
                  }),
                ],
              }),
            ],
          });
        }),
      }),
    ];
  };

  const off = ctx.bus.on('state:changed', () => {
    if (handle) render();
  });
  render();
  handle = ui.openModal({
    title: 'Cabang',
    className: 'sheet sheet-branch',
    closeButton: true,
    body,
    actions: [{ label: 'Tutup', variant: 'primary' }],
    onClose: () => {
      off();
      handle = null;
    },
  });
  return handle;
}

/** Rincian cabang dari laporan harian: terjual, tersisa, terbuang per produk. */
export function openBranchReportDetail(ctx: GameContext, ui: UIManager, reports: readonly BranchDayReport[]): ModalHandle {
  const body = el('div', {
    className: 'branch-body',
    children: reports.map((r) => {
      const ids = [...new Set([...Object.keys(r.received), ...Object.keys(r.sold), ...Object.keys(r.wasted)])];
      return el('section', {
        className: 'branch-section',
        children: [
          el('h3', {
            className: 'section-title',
            text: `${r.name} · ${locationById(r.mapId).name}`,
          }),
          el('p', {
            className: 'panel-note',
            text: `${BRANCH_STATUS_LABEL[r.status]} · ${r.portions} porsi · pendapatan ${formatRupiah(r.revenue)} · selisih kas ${formatRupiah(r.shrink)} · operasional ${formatRupiah(r.operational)} · gaji ${formatRupiah(r.wage)}${r.wageLate ? ' (telat!)' : ''} · bersih ${r.net < 0 ? '−' : '+'}${formatRupiah(Math.abs(r.net))}`,
          }),
          ids.length
            ? el('div', {
                className: 'branch-table',
                attrs: { role: 'table', 'aria-label': `Rincian ${r.name}` },
                children: [
                  el('div', {
                    className: 'branch-tr branch-th',
                    attrs: { role: 'row' },
                    children: ['Produk', 'Diterima', 'Terjual', 'Tersisa', 'Terbuang'].map((h) => el('span', { text: h, attrs: { role: 'columnheader' } })),
                  }),
                  ...ids.map((id) =>
                    el('div', {
                      className: 'branch-tr',
                      attrs: { role: 'row' },
                      children: [
                        el('span', {
                          className: 'branch-td-name',
                          text: ctx.catalog.recipe(id).name,
                          attrs: { role: 'cell' },
                        }),
                        ...(
                          [
                            ['Diterima', r.received[id] ?? 0],
                            ['Terjual', r.sold[id] ?? 0],
                            ['Tersisa', r.left[id] ?? 0],
                            ['Terbuang', r.wasted[id] ?? 0],
                          ] as const
                        ).map(([label, v]) =>
                          el('span', {
                            className: label === 'Terbuang' && v ? 'is-bad' : '',
                            attrs: { role: 'cell', 'data-label': label },
                            text: String(v),
                          }),
                        ),
                      ],
                    }),
                  ),
                ],
              })
            : el('p', {
                className: 'muted',
                text: 'Tidak ada produk hari ini.',
              }),
        ],
      });
    }),
  });
  return ui.openModal({
    title: 'Rincian cabang',
    className: 'sheet sheet-branch',
    closeButton: true,
    body,
    actions: [{ label: 'Tutup', variant: 'primary' }],
  });
}
