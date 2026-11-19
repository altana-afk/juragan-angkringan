import { eventById } from '../data/events';
import { crowdLabel, dayDemand, isWeekend, locationOf } from '../systems/LocationSystem';
import { WEATHER_EFFECTS } from '../systems/WeatherSystem';
import { WEATHER_LABELS } from '../config/balanceConfig';
import type { GameContext } from '../core/GameContext';
import type { GamePhase, GameState, WeatherKind } from '../core/GameState';
import { getPopularityTier } from '../systems/PopularitySystem';
import { formatDateShort } from '../utils/calendar';
import { formatClock, formatRupiah, formatRupiahShort } from '../utils/formatting';
import { el, replayAnimation, setText, type UIComponent } from './dom';
import { icon, type IconName } from './icons';
import { storyBadgeCount } from './StoryPanel';
import { activeOnlineEvent } from '../systems/OnlineEventSystem';
import { unreadNews } from '../systems/StorySystem';
import { tr } from '../i18n/i18n';

const PHASE_LABELS: Record<GamePhase, string> = {
  persiapan: tr('Persiapan'),
  berjualan: tr('Berjualan'),
  evaluasi: tr('Evaluasi'),
};

const WEATHER_ICONS: Record<WeatherKind, IconName> = {
  cerah: 'sun',
  berawan: 'cloud',
  hujan: 'rain',
  panas: 'hot',
};

/**
 * HUD atas: uang, hari & tanggal, jam & fase, popularitas, cuaca, dan tombol menu.
 * Semua nilai dibaca dari GameStore — tidak ada angka dekoratif.
 */
export class HUD implements UIComponent {
  readonly root: HTMLElement;
  private readonly moneyValue = el('span', { className: 'hud-value' });
  private readonly moneyPill: HTMLElement;
  private readonly dayValue = el('span', { className: 'hud-value' });
  private readonly dateValue = el('span', { className: 'hud-sub' });
  private readonly clockValue = el('span', { className: 'hud-clock-value' });
  private readonly phaseValue = el('span', { className: 'hud-sub' });
  private readonly popLabel = el('span', { className: 'hud-sub' });
  private readonly popValue = el('span', { className: 'hud-value' });
  private readonly popFill = el('i', { className: 'hud-bar-fill' });
  private readonly popPill: HTMLElement;
  private readonly weatherIcon = el('img', { className: 'px-icon', attrs: { alt: '', 'aria-hidden': 'true' } });
  private readonly weatherValue = el('span', { className: 'hud-value hud-value-sm' });
  private readonly offState: () => void;
  private readonly eventChip: HTMLElement;
  private readonly locationChip: HTMLElement;
  /** Kursi terisi saat berjualan (pindah dari bar bawah di 0.13.0). */
  private readonly seatChip = el('span', { className: 'hud-event hud-seats', attrs: { title: tr('Kursi terisi'), hidden: '' } });
  private readonly storyBadge = el('span', { className: 'hud-badge' });
  private readonly storyButton: HTMLElement;
  private readonly offSeats: () => void;

  constructor(ctx: GameContext, parent: HTMLElement) {
    this.moneyPill = el('button', {
      className: 'hud-pill hud-money',
      attrs: { type: 'button', title: tr('Uang kas — ketuk untuk membuka Bank') },
      onClick: () => ctx.bus.emit('ui:open-panel', { panel: 'bank' }),
      children: [icon('coin'), el('div', { className: 'hud-stack', children: [el('span', { className: 'hud-sub', text: tr('Kas') }), this.moneyValue] })],
    });
    const dayPill = el('div', {
      className: 'hud-pill hud-day',
      attrs: { title: tr('Hari permainan') },
      children: [icon('calendar'), el('div', { className: 'hud-stack', children: [this.dayValue, this.dateValue] })],
    });
    const clockPill = el('div', {
      className: 'hud-pill hud-clock',
      attrs: { title: tr('Jam permainan') },
      children: [icon('clock'), el('div', { className: 'hud-stack', children: [this.clockValue, this.phaseValue] })],
    });
    this.eventChip = el('button', {
      className: 'hud-event',
      attrs: { type: 'button' },
      onClick: () => ctx.bus.emit('ui:open-panel', { panel: 'event' }),
    });
    this.locationChip = el('button', {
      className: 'hud-event hud-location',
      attrs: { type: 'button', title: tr('Lokasi angkringan — ketuk untuk pindah lokasi (saat persiapan)') },
      onClick: () => ctx.bus.emit('ui:open-panel', { panel: 'location' }),
    });
    const clock = el('div', {
      className: 'hud-center',
      children: [clockPill, el('div', { className: 'hud-chips', children: [this.locationChip, this.eventChip, this.seatChip] })],
    });
    this.popPill = el('div', {
      className: 'hud-pill hud-pop',
      attrs: { title: tr('Popularitas angkringan (0–100)') },
      children: [
        icon('star'),
        el('div', {
          className: 'hud-stack hud-pop-stack',
          children: [
            el('div', { className: 'hud-pop-row', children: [this.popLabel, this.popValue] }),
            el('div', { className: 'hud-bar', attrs: { role: 'presentation' }, children: [this.popFill] }),
          ],
        }),
      ],
    });
    const weather = el('div', {
      className: 'hud-pill hud-weather',
      attrs: { title: tr('Cuaca hari ini') },
      children: [this.weatherIcon, this.weatherValue],
    });
    this.offSeats = ctx.bus.on('sales:status', ({ seatsTaken, seatsTotal }) => {
      this.seatChip.hidden = ctx.store.get().phase !== 'berjualan';
      setText(this.seatChip, tr('🪑 {seatsTaken}/{seatsTotal}', { seatsTaken, seatsTotal }));
      this.seatChip.title = tr('Kursi terisi {seatsTaken} dari {seatsTotal}', { seatsTaken, seatsTotal });
    });
    this.storyButton = el('button', {
      className: 'hud-btn hud-story',
      attrs: { type: 'button', 'aria-label': tr('Kabar Kampung'), title: tr('Kabar Kampung (N)') },
      children: [el('span', { className: 'hud-story-icon', text: '📰', attrs: { 'aria-hidden': 'true' } }), this.storyBadge],
      onClick: () => ctx.bus.emit('ui:open-panel', { panel: 'story' }),
    });
    const menuButton = el('button', {
      className: 'hud-btn hud-menu',
      attrs: { type: 'button', 'aria-label': tr('Buka menu'), title: tr('Menu (Esc)') },
      children: [icon('menu')],
      onClick: () => ctx.bus.emit('ui:open-pause-menu'),
    });

    this.root = el('header', {
      className: 'hud',
      children: [
        el('div', { className: 'hud-group hud-left', children: [this.moneyPill, dayPill] }),
        clock,
        el('div', { className: 'hud-group hud-right', children: [this.popPill, weather, this.storyButton, menuButton] }),
      ],
    });
    parent.append(this.root);
    this.render(ctx.store.get(), null);
    this.offState = ctx.bus.on('state:changed', ({ state, prev }) => this.render(state, prev));
  }

  private render(state: Readonly<GameState>, prev: Readonly<GameState> | null): void {
    const { money, popularity } = state.player;
    // Di layar sempit, nominal besar diringkas (Rp1,25 jt) agar HUD tidak meluber.
    const compact = window.innerWidth < 380 && Math.abs(money) >= 1_000_000;
    setText(this.moneyValue, compact ? formatRupiahShort(money) : formatRupiah(money));
    this.moneyPill.title = tr('Uang kas: {money}', { money: formatRupiah(money) });
    this.moneyPill.classList.toggle('is-negative', money < 0);
    if (prev && prev.player.money !== money) {
      replayAnimation(this.moneyPill, money > prev.player.money ? 'bump-up' : 'bump-down');
      this.showMoneyDelta(money - prev.player.money);
    }

    setText(this.dayValue, tr('Hari {day}', { day: state.calendar.day }));
    const demand = dayDemand(state);
    const wk = isWeekend(state.calendar.day);
    this.dayValue.parentElement?.parentElement?.setAttribute(
      'title',
      tr('{0} di {name}: pengunjung {crowd} (×{factor})', { 0: wk ? tr('Akhir pekan') : tr('Hari kerja'), name: locationOf(state).name, crowd: crowdLabel(demand.dayFactor), factor: demand.dayFactor.toFixed(2) }),
    );
    setText(this.locationChip, tr('📍 {name}', { name: locationOf(state).name }));
    this.locationChip.classList.toggle('can-move', state.phase === 'persiapan' && state.lastMoveDay !== state.calendar.day);
    const ev = state.event ? eventById(state.event.id) : null;
    const online = activeOnlineEvent(state);
    this.eventChip.hidden = !ev && !online;
    // Dua event (harian + online) → "2 event"; ketuk untuk membuka daftar.
    if (ev && online) setText(this.eventChip, tr('🎉 2 event{0}', { 0: state.event?.bulk?.status === 'menunggu' ? ' !' : '' }));
    else if (ev) setText(this.eventChip, tr('{icon} {name}{2}', { icon: ev.icon, name: ev.name, 2: state.event?.bulk?.status === 'menunggu' ? ' !' : '' }));
    else if (online) setText(this.eventChip, tr('{icon} {name}', { icon: online.icon, name: online.name }));
    this.eventChip.title = [ev?.name, online?.name].filter(Boolean).join(' · ');
    if (state.phase !== 'berjualan') this.seatChip.hidden = true;
    setText(this.dateValue, formatDateShort(state.calendar.day));
    setText(this.clockValue, formatClock(state.calendar.clockMinutes));
    setText(this.phaseValue, PHASE_LABELS[state.phase]);

    const tier = getPopularityTier(popularity);
    setText(this.popLabel, tier.label);
    setText(this.popValue, String(Math.round(popularity)));
    this.popFill.style.width = `${Math.max(0, Math.min(100, popularity))}%`;
    this.popPill.dataset.tier = tier.id;
    this.popPill.title = tr('Popularitas {popularity}/100 — {label}: {description}', { popularity: Math.round(popularity), label: tier.label, description: tier.description });
    if (prev && prev.player.popularity !== popularity) replayAnimation(this.popPill, popularity > prev.player.popularity ? 'bump-up' : 'bump-down');

    const badge = storyBadgeCount(state);
    const unread = unreadNews(state).length;
    setText(this.storyBadge, badge > 9 ? '9+' : String(badge));
    this.storyBadge.hidden = badge === 0;
    this.storyButton.classList.toggle('has-news', unread > 0);
    this.storyButton.title = tr('Kabar Kampung ({unread} belum dibaca) — tombol N', { unread });
    this.storyButton.setAttribute('aria-label', tr('Kabar Kampung, {unread} belum dibaca', { unread }));
    if (prev && unread > unreadNews(prev).length) replayAnimation(this.storyButton, 'bump-up');

    const weatherIcon = icon(WEATHER_ICONS[state.weather]).src;
    if (this.weatherIcon.src !== weatherIcon) this.weatherIcon.src = weatherIcon;
    setText(this.weatherValue, WEATHER_LABELS[state.weather]);
    const wpill = this.weatherValue.parentElement;
    if (wpill) wpill.title = tr('Cuaca: {label}. {hint}', { label: WEATHER_EFFECTS[state.weather].label, hint: WEATHER_EFFECTS[state.weather].hint });
  }

  /** Angka perubahan kas melayang di bawah HUD uang (+Rp5.000 / −Rp120.000). */
  private showMoneyDelta(delta: number): void {
    // Hanya satu angka aktif; penjualan beruntun diakumulasikan.
    const now = performance.now();
    if (this.deltaEl && now - this.deltaAt < 900) {
      this.deltaSum += delta;
      this.deltaEl.remove();
    } else this.deltaSum = delta;
    this.deltaAt = now;
    const sum = this.deltaSum;
    const node = el('span', {
      className: `money-delta ${sum >= 0 ? 'is-up' : 'is-down'}`,
      text: `${sum >= 0 ? '+' : '−'}${formatRupiah(Math.abs(sum))}`,
      attrs: { 'aria-hidden': 'true' },
    });
    this.moneyPill.append(node);
    this.deltaEl = node;
    node.addEventListener('animationend', () => {
      node.remove();
      if (this.deltaEl === node) this.deltaEl = null;
    });
  }

  private deltaEl: HTMLElement | null = null;
  private deltaAt = 0;
  private deltaSum = 0;

  destroy(): void {
    this.offState();
    this.offSeats();
    this.root.remove();
  }
}
