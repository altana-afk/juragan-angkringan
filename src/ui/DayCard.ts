import { eventById } from '../data/events';
import { crowdLabel, dayDemand, isWeekend } from '../systems/LocationSystem';
import type { GameState } from '../core/GameState';
import { WEATHER_EFFECTS } from '../systems/WeatherSystem';
import { formatDateLong } from '../utils/calendar';
import { el } from './dom';
import type { UIManager } from './UIManager';

/** Kartu judul singkat di awal hari: "Hari 6 · Sabtu, 11 Juli · Hujan". */
export function showDayCard(ui: UIManager, state: Readonly<GameState>): void {
  ui.layers.screen.querySelector('.day-card')?.remove();
  const card = el('div', {
    className: 'day-card',
    attrs: { role: 'status' },
    children: [
      el('div', {
        className: 'day-card-inner',
        children: [
          el('div', { className: 'day-card-title', text: `Hari ${state.calendar.day}` }),
          el('div', { className: 'day-card-sub', text: `${formatDateLong(state.calendar.day)} · ${WEATHER_EFFECTS[state.weather].label}` }),
          el('div', {
            className: 'day-card-sub',
            text: `${isWeekend(state.calendar.day) ? 'Akhir pekan' : 'Hari kerja'} · pengunjung ${crowdLabel(dayDemand(state).dayFactor)}`,
          }),
          state.event ? el('div', { className: 'day-card-event', text: `${eventById(state.event.id).icon} ${eventById(state.event.id).name}` }) : null,
        ],
      }),
    ],
  });
  ui.layers.screen.append(card);
  card.firstElementChild?.addEventListener('animationend', () => card.remove());
  window.setTimeout(() => card.remove(), 3000);
}
