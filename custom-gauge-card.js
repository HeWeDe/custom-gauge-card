import { LitElement, html, css, svg } from "https://unpkg.com/lit-element/lit-element.js?module";

const DEFAULTS = {
  strokeWidth: 30,                // Dicke des farbigen Bogens (Gauge)
  needle_color: "black",          // Farbe der Hauptnadel (aktueller Wert)
  needle_opacity: 0.7,            // Transparenz der Hauptnadel (0 = unsichtbar, 1 = voll sichtbar)

  titel_font_size: 15,            // Schriftgröße für den Titel oben
  value_font_size: 20,            // Schriftgröße für den zentralen Wert (in der Mitte)
  rltext_font_size: 12,           // Schriftgröße für die Texte links/rechts unten
  tick_font_size: 10,             // Schriftgröße für die Ticks (Skalenbeschriftung)

  ticks_count: 10,                // Anzahl der Ticks (Skalenstriche + Beschriftung)
  tick_color: "rgb(120, 120, 120)", // Farbe der Tick-Linien
  tick_width: 1,                  // Strichstärke der Tick-Linien
  tick_stroke_inner: 0.5,         // Verhältnis zur Bogenbreite: wie weit der Tick nach innen geht
  tick_stroke_outer: 0.2,         // Verhältnis zur Bogenbreite: wie weit der Tick nach außen geht

  decimal_separator: ",",         // Trennzeichen bei Dezimalzahlen (z.B. Komma oder Punkt)
  decimals: 3,                    // Nachkommastellen für den **aktuellen Wert** (Mitte der Gauge)

  min_color: "blue",              // Farbe des Min-Markers (kleine Linie + Zahl)
  max_color: "red",               // Farbe des Max-Markers
  avg_color: "orange",            // Farbe des Durchschnitts-Markers

  stat_decimals: 1,               // Nachkommastellen für Min/Max/Avg-Werte (Marker-Beschriftung)
  markers_width: 2,               // Linienstärke der Min/Max/Avg-Marker
};

function handleClick(card, hass, config, ev) {
  const action =
    ev.type === "click"
      ? config.tap_action
      : ev.type === "dblclick"
      ? config.double_tap_action
      : ev.type === "contextmenu"
      ? config.hold_action
      : null;

  if (!action) return;
  ev.stopPropagation();
  ev.preventDefault();

  const event = new CustomEvent("hass-action", {
    detail: { config, action: action.action },
    bubbles: true,
    composed: true,
  });
  card.dispatchEvent(event);
}

class CustomGaugeCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
    };
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 16px;
        border: 1px solid var(--divider-color, #d3d3d3);
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--ha-card-background, white);
        position: relative;
      }
    `;
  }

  setConfig(config) {
    this.config = {
      tap_action: { action: "more-info" },
      ...DEFAULTS,
      ...config,
    };
  }

  render() {
    const gradient = this.config.gradient || {};
    const min = this.config.min ?? 0;
    const max = this.config.max ?? 100;
    const name = this.config.name || "";
    const entity = this.config?.entity;
    const state = this.hass?.states?.[entity]?.state ?? "–";
    const unit = this.hass?.states?.[entity]?.attributes?.unit_of_measurement ?? "";

    return html`
      <div
        style="position: relative; width: 100%; cursor: pointer;"
        @click=${(ev) => this._handleAction(ev)}
        @contextmenu=${(ev) => this._handleAction(ev)}
        @dblclick=${(ev) => this._handleAction(ev)}
      >
        ${this._renderGauge(gradient, min, max, name, entity, state, unit)}
      </div>
    `;
  }

  _renderGauge(gradient, min, max, name, entity, state, unit) {
    const radius = 90;
    const cx = 120;
    const cy = 130;
    const cfg = this.config;

    const formatNumber = (num, dec = cfg.decimals) => {
      const rounded = num.toFixed(dec);
      return cfg.decimal_separator === "," ? rounded.replace(".", ",") : rounded;
    };

    const value = parseFloat(state);
    const formattedValue = isNaN(value) ? state : formatNumber(value);
    const angle = this._valueToAngle(value, min, max);

    const needleLength = radius + cfg.strokeWidth / 2;
    const needleBaseOffset = radius * 0.6;
    const needleWidth = 10;
    const angleDeg = angle;

    const needlePoints = [
      `0,${-needleLength}`,
      `${-needleWidth / 2},${-needleBaseOffset}`,
      `${needleWidth / 2},${-needleBaseOffset}`,
    ].join(" ");

    const needle = svg`
      <g transform="translate(${cx}, ${cy}) rotate(${angleDeg})" style="transition: transform 0.6s ease;">
        <polygon points="${needlePoints}" fill="${cfg.needle_color}" opacity="${cfg.needle_opacity}" />
      </g>
    `;

    const ticks = [];
    for (let i = 0; i <= cfg.ticks_count; i++) {
      const val = min + (i * (max - min)) / cfg.ticks_count;
      const tickAngle = this._valueToAngle(val, min, max);
      const inner = this._polarToCartesian(cx, cy, radius - cfg.strokeWidth * cfg.tick_stroke_inner, tickAngle);
      const outer = this._polarToCartesian(cx, cy, radius + cfg.strokeWidth * cfg.tick_stroke_outer, tickAngle);
      const label = this._polarToCartesian(cx, cy, radius - cfg.strokeWidth / 2 - 10, tickAngle);
      const labelText = Number.isInteger(val) ? val.toString() : val.toFixed(1);

      if (i !== 0 && i !== cfg.ticks_count) {
        ticks.push(svg`<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" stroke="${cfg.tick_color}" stroke-width="${cfg.tick_width}" />`);
      }
      ticks.push(svg`<text x="${label.x}" y="${label.y}" text-anchor="middle" font-size="${cfg.tick_font_size}" dominant-baseline="middle">${labelText}</text>`);
    }

    const statMarkers = ["min", "max", "avg"].map((key) => {
      const ent = cfg[`${key}_entity`];
      const col = cfg[`${key}_color`] ?? DEFAULTS[`${key}_color`] ?? "gray";
      const s = this.hass?.states?.[ent]?.state;
      if (!ent || s === undefined) return null;
      const val = parseFloat(s);
      if (isNaN(val)) return null;
      const tickAngle = this._valueToAngle(val, min, max);
      const inner = this._polarToCartesian(cx, cy, radius - cfg.strokeWidth * 0.5, tickAngle);
      const outer = this._polarToCartesian(cx, cy, radius + cfg.strokeWidth * 0.5, tickAngle);
      const label = this._polarToCartesian(cx, cy, radius - cfg.strokeWidth / 2 +37, tickAngle);
      const pos = this._polarToCartesian(cx, cy, radius - cfg.strokeWidth * cfg.tick_stroke_inner, tickAngle);
      return svg`
        <g>
        <line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" stroke="${col}" stroke-width="${cfg.markers_width}" />
          <text x="${label.x}" y="${label.y}" text-anchor="middle" font-size="${cfg.tick_font_size}" fill="${col}" dominant-baseline="middle">${formatNumber(val, cfg.stat_decimals)}</text>
        </g>
      `;
    }).filter(Boolean);

    const ranges = this._getGradientRanges(min, max, gradient);
    const paths = ranges.map((range) => {
      const start = this._valueToAngle(range.from, min, max);
      const end = this._valueToAngle(range.to, min, max);
      return svg`<path d="${this._describeArc(cx, cy, radius, start, end)}" fill="none" stroke="${range.color}" stroke-width="${cfg.strokeWidth}" />`;
    });

    const leftPos = this._polarToCartesian(cx, cy, radius, -100);
    const rightPos = this._polarToCartesian(cx, cy, radius, 100);

    return html`
      <div style="position: relative; width: 100%; padding-bottom: 75%;">
        <svg viewBox="0 0 240 180" style="position: absolute; width: 100%; height: 100%; top: 7%; left: 0;">
          ${paths} ${ticks} ${needle} ${statMarkers}
          <text x="${cx}" y="${cfg.titel_font_size}" text-anchor="middle" font-size="${cfg.titel_font_size}" font-weight="bold">${name}</text>
          <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="${cfg.value_font_size}" font-weight="bold">${formattedValue} ${unit}</text>
          <text x="${leftPos.x}" y="${leftPos.y}" text-anchor="middle" font-size="${cfg.rltext_font_size}">${cfg.leftText}</text>
          <text x="${rightPos.x}" y="${rightPos.y}" text-anchor="middle" font-size="${cfg.rltext_font_size}">${cfg.rightText}</text>
        </svg>
      </div>
    `;
  }

  _handleAction(ev) {
    if (!this.config) return;
    handleClick(this, this.hass, this.config, ev);
  }

  _valueToAngle(value, min, max) {
    const clamped = Math.min(Math.max(value, min), max);
    const ratio = (clamped - min) / (max - min);
    return -90 + ratio * 180;
  }

  _describeArc(cx, cy, r, startAngle, endAngle) {
    const start = this._polarToCartesian(cx, cy, r, endAngle);
    const end = this._polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
    return ["M", start.x, start.y, "A", r, r, 0, largeArc, 0, end.x, end.y].join(" ");
  }

  _polarToCartesian(cx, cy, r, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  }

  _getGradientRanges(min, max, gradient) {
    const keys = Object.keys(gradient ?? {})
      .map(k => parseFloat(k))
      .filter(k => !isNaN(k))
      .sort((a, b) => a - b);
    const ranges = [];
    for (let i = 0; i < keys.length; i++) {
      const from = i === 0 ? min : keys[i - 1];
      const to = keys[i];
      ranges.push({ from, to, color: gradient[keys[i]] || "#888" });
    }
    if (keys.length && keys[keys.length - 1] < max) {
      ranges.push({ from: keys[keys.length - 1], to: max, color: gradient[-1] || "red" });
    }
    return ranges;
  }

  getCardSize() {
    return (this.config?.grid_options?.rows ?? 1) * 1;
  }
}

customElements.define("custom-gauge-card", CustomGaugeCard);
