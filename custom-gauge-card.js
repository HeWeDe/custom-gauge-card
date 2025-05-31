/**
 * Custom Gauge Card for Home Assistant
 * Version: 1.1.0
 * date: 2025-05-30
 * Repository: https://github.com/HeWeDe/custom-gauge-card
 * Author: HeWeDe (https://github.com/HeWeDe)
 * License: MIT
 */
import { LitElement, html, css, svg } from "https://unpkg.com/lit-element/lit-element.js?module";
const DEFAULTS = {
  strokeWidth: 30,                // Thickness of the colored arc (gauge)
  needle_color: "black",          // Color of the main needle (current value)
  needle_opacity: 0.7,            // Opacity of the main needle (0 = invisible, 1 = fully visible)

  titel_font_size: 15,            // Font size for the title at the top
  value_font_size: 18,            // Font size for the central value (middle of the gauge)
  rltext_font_size: 12,           // Font size for the left/right bottom texts
  tick_font_size: 10,             // Font size for the tick labels (scale)

  ticks_count: 10,                // Number of ticks (scale lines + labels)
  tick_color: "rgb(120, 120, 120)", // Color of the tick lines
  tick_width: 1,                  // Stroke width of the tick lines
  tick_stroke_inner: 0.5,         // Relative to arc width: how far the tick goes inward
  tick_stroke_outer: 0.2,         // Relative to arc width: how far the tick goes outward

  decimal_separator: ",",         // Decimal separator for numbers (e.g., comma or period)
  decimals: 3,                    // Decimal places for the **current value** (center of the gauge)

  min_color: "blue",              // Color of the min marker (small line + value)
  max_color: "darkred",           // Color of the max marker
  avg_color: "darkorange",        // Color of the average marker

  stat_decimals: 1,               // Decimal places for min/max/avg values (marker labels)
  markers_width: 2,               // Line thickness for min/max/avg markers
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
  static styles = css`
  ha-card {
    padding: 16px;
    height: 100%; /* wichtig */
  }
  .card-content {
    min-height: 300px; /* z. B. ca. 4 Grid-Zeilen */
  }
`;
  setConfig(config) {
    if (!config.entity) {
      throw new Error("You need to define an entity");
    }
    this.config = {
      tap_action: { action: "more-info" },
      ...DEFAULTS,
      ...config,
    };
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return {
      rows: 4,
      columns: 12,
      min_rows: 2,
      max_rows: 6,
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
      <ha-card
          style="cursor: pointer;"
          @click=${(ev) => this._handleAction(ev)}
          @contextmenu=${(ev) => this._handleAction(ev)}
          @dblclick=${(ev) => this._handleAction(ev)}
        >
          <div>
          ${this._renderGauge(gradient, min, max, name, entity, state, unit)}
        </div>
      </ha-card>
    `;
  }

  _renderGauge(gradient, min, max, name, entity, state, unit) {
    const radius = 90;
    const cx = 120;
    const cy = 140;
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

    const extraNeedles = (cfg.needles ?? []).map((n) => {
      const s = this.hass?.states?.[n.entity]?.state;
      if (!s || s === undefined) return null;
      const v = parseFloat(s);
      if (isNaN(v)) return null;

      const a = this._valueToAngle(v, min, max);
      const needleLength = radius + cfg.strokeWidth / 2;
      const needleBaseOffset = radius * 0.6;
      const needleWidth = 10;

      const points = [
        `0,${-needleLength}`,
        `${-needleWidth / 2},${-needleBaseOffset}`,
        `${needleWidth / 2},${-needleBaseOffset}`,
      ].join(" ");

      const color = n.color || 'gray';
      const opacity = n.opacity ?? 0.5;

      const showValue = n.show_value ?? false;
      const decimals = n.decimal ?? cfg.stat_decimals;
      const valueText = formatNumber(v, decimals);
      const label = this._polarToCartesian(cx, cy, radius + cfg.strokeWidth / 2 + 18, a);

      return svg`
        <g>
          <g transform="translate(${cx}, ${cy}) rotate(${a})" style="transition: transform 0.6s ease;">
            <polygon points="${points}" fill="${color}" opacity="${opacity}" />
          </g>
          ${showValue
            ? svg`<text x="${label.x}" y="${label.y}" text-anchor="middle" font-size="${cfg.tick_font_size}" fill="${color}" dominant-baseline="middle">${valueText}</text>`
            : null}
        </g>
      `;
    }).filter(Boolean);

    const needleInfoTexts = (cfg.needles ?? []).map((n, i) => {
      const state = this.hass?.states?.[n.entity]?.state;
      if (state === undefined || !n.show_value) return null;

      const val = parseFloat(state);
      if (isNaN(val)) return null;

      const label = n.label ?? n.entity;
      const color = n.color ?? "gray";
      const dec = n.decimal ?? 1;
      const yOffset = 10 + i * 14;
      const xOffset = -10;
      return svg`
        <text x="${xOffset}" y="${yOffset}" font-size="${cfg.tick_font_size}" fill="${color}" text-anchor="start">
          ${label}: ${formatNumber(val, dec)}
        </text>
      `;
    });


    const ticks = [];
    for (let i = 0; i <= cfg.ticks_count; i++) {
      const val = min + (i * (max - min)) / cfg.ticks_count;
      const tickAngle = this._valueToAngle(val, min, max);
      const inner = this._polarToCartesian(cx, cy, radius - cfg.strokeWidth * cfg.tick_stroke_inner, tickAngle);
      const outer = this._polarToCartesian(cx, cy, radius + cfg.strokeWidth * cfg.tick_stroke_outer, tickAngle);
      const label = this._polarToCartesian(cx, cy, radius - cfg.strokeWidth / 2 - 12, tickAngle);
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
      const label = this._polarToCartesian(cx, cy, radius + cfg.strokeWidth / 2 + 10, tickAngle);
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
        <svg viewBox="0 0 240 180" style="position: absolute; width: 100%; height: 100%; top: 7%; left: 0;">
          ${paths} ${ticks} ${statMarkers} ${extraNeedles} ${needleInfoTexts} ${needle}
          <text x="${cx}" y="${cfg.titel_font_size*0.75}" text-anchor="middle" font-size="${cfg.titel_font_size}" font-weight="bold">${name}</text>
          <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="${cfg.value_font_size}" font-weight="bold">${formattedValue} ${unit}</text>
          <text x="${leftPos.x}" y="${leftPos.y}" text-anchor="middle" font-size="${cfg.rltext_font_size}">${cfg.leftText}</text>
          <text x="${rightPos.x}" y="${rightPos.y}" text-anchor="middle" font-size="${cfg.rltext_font_size}">${cfg.rightText}</text>
        </svg>
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
