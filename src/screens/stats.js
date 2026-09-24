/**
 * ChaletWeShare — Statistics Screen
 * Bauhaus Horizontal Bar Charts tracking weekend & holiday stays per sibling.
 * Resets every calendar year (January 1st).
 */

import { reservationEngine } from '../engine/reservationEngine.js';
import { renderAvatarMarkup } from '../data/avatars.js';
import { escapeHtml } from '../utils/htmlUtils.js';

export class StatsScreen {
  /**
   * @param {HTMLElement} mountEl
   * @param {Object} user - Active profile
   */
  constructor(mountEl, user) {
    this.mountEl = mountEl;
    this.user = user;
    this.currentYear = new Date().getFullYear();
    this.availableYears = [];
    this.statsData = null;
    this.isLoading = true;
  }

  async render() {
    this.mountEl.innerHTML = `
      <div class="stats-screen" style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--color-surface); border: var(--border); padding: 12px; box-shadow: var(--shadow-brutal-sm);">
          <div>
            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent);">
              Auslastung & Statistik
            </span>
            <h2 style="margin: 0; font-size: 1.15rem;">STATISTIK</h2>
          </div>
          <div id="stats-year-buttons" style="display: flex; gap: 4px;">
            <!-- Dynamically populated year buttons -->
          </div>
        </div>

        <!-- Info / Rules Card -->
        <div class="card" style="border-left: 6px solid var(--color-accent);">
          <div id="stats-year-title" style="font-weight: 800; font-size: 0.9rem; margin-bottom: 2px;">
            Jahressaldo ${this.currentYear}
          </div>
          <p style="font-size: 0.8rem; color: var(--color-text-muted);">
            Zählt alle gebuchten Übernachtungen und Wochenend-Tage (Sa/So). Setzt sich jedes Jahr am <strong>1. Januar</strong> automatisch zurück.
          </p>
        </div>

        <!-- Loading / Chart Container -->
        <div id="stats-chart-container" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="skeleton skeleton-card" style="box-shadow: var(--shadow-brutal-sm);"></div>
          <div class="skeleton skeleton-card" style="box-shadow: var(--shadow-brutal-sm);"></div>
          <div class="skeleton skeleton-card" style="box-shadow: var(--shadow-brutal-sm); width: 70%;"></div>
        </div>
      </div>
    `;

    await this.loadData(this.currentYear);
  }

  async loadData(year) {
    this.isLoading = true;
    this.statsData = await reservationEngine.fetchStats(year || this.currentYear);
    if (this.statsData) {
      if (this.statsData.year) {
        this.currentYear = this.statsData.year;
      }
      if (Array.isArray(this.statsData.available_years) && this.statsData.available_years.length > 0) {
        this.availableYears = this.statsData.available_years;
      } else if (!this.availableYears.length) {
        this.availableYears = [this.currentYear];
      }
    }
    this.isLoading = false;
    this._renderYearButtons();
    this._renderChart();
  }

  _renderYearButtons() {
    const container = this.mountEl.querySelector('#stats-year-buttons');
    const title = this.mountEl.querySelector('#stats-year-title');
    if (title && this.currentYear) {
      title.textContent = `Jahressaldo ${this.currentYear}`;
    }
    if (!container) return;

    container.innerHTML = this.availableYears.map(yr => `
      <button class="btn btn--sm ${this.currentYear === yr ? 'btn--black' : ''}" data-year="${yr}" style="font-family: var(--font-mono);" aria-label="Statistik für Jahr ${yr} anzeigen" aria-pressed="${this.currentYear === yr}">
        ${yr}
      </button>
    `).join('');

    container.querySelectorAll('button[data-year]').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedYear = parseInt(btn.getAttribute('data-year'), 10);
        if (selectedYear !== this.currentYear) {
          this.currentYear = selectedYear;
          const chartContainer = this.mountEl.querySelector('#stats-chart-container');
          if (chartContainer) {
            chartContainer.innerHTML = `
              <div class="skeleton skeleton-card" style="box-shadow: var(--shadow-brutal-sm);"></div>
              <div class="skeleton skeleton-card" style="box-shadow: var(--shadow-brutal-sm);"></div>
              <div class="skeleton skeleton-card" style="box-shadow: var(--shadow-brutal-sm); width: 70%;"></div>
            `;
          }
          this._renderYearButtons();
          this.loadData(this.currentYear);
        }
      });
    });
  }

  _renderChart() {
    const container = this.mountEl.querySelector('#stats-chart-container');
    if (!container) return;

    const list = this.statsData?.stats || [];
    const maxDays = Math.max(this.statsData?.max_days || 1, 1);

    if (list.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; color: var(--color-text-muted);">
          Noch keine registrierten Geschwister oder Buchungen für ${this.currentYear}.
        </div>
      `;
      return;
    }

    container.innerHTML = list
      .map((item, index) => {
        const isMe = item.user_id == this.user.id || item.name === this.user.name;
        const total = item.total_days || 0;
        const weekend = item.weekend_days || 0;
        const pct = Math.min(Math.round((total / maxDays) * 100), 100);

        return `
          <div class="card" style="padding: 12px; border: ${isMe ? '3px solid var(--color-accent)' : 'var(--border)'}; background: var(--color-surface); box-shadow: var(--shadow-brutal-sm);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; color: var(--color-text-muted); width: 18px;">
                  #${index + 1}
                </span>
                ${renderAvatarMarkup(item.avatar || 'swan', 32)}
                <div>
                  <span style="font-weight: 800; font-size: 0.95rem;">${escapeHtml(item.name)}</span>
                  ${isMe ? '<span style="font-family: var(--font-mono); font-size: 0.65rem; font-weight: 800; background: var(--color-accent); color: #fff; padding: 1px 4px; margin-left: 6px;">DU</span>' : ''}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-family: var(--font-mono); font-weight: 900; font-size: 1rem; color: var(--color-text);">
                  ${total} <span style="font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted);">Tage</span>
                </div>
                <div style="font-family: var(--font-mono); font-size: 0.75rem; color: #D60076; font-weight: 800;">
                  ${weekend} WE-Tage
                </div>
              </div>
            </div>

            <!-- Brutalist Progress Bar -->
            <div role="progressbar" aria-valuenow="${total}" aria-valuemin="0" aria-valuemax="${maxDays}" aria-label="Aufenthaltstage für ${escapeHtml(item.name)}: ${total} Tage" style="width: 100%; height: 16px; background: #FFFFFF; border: 2px solid var(--color-border); position: relative; overflow: hidden;">
              <div style="width: ${total > 0 ? Math.max(pct, 4) : 0}%; height: 100%; background: ${isMe ? 'var(--color-accent)' : 'var(--color-booked)'}; transition: width 400ms cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }
}
