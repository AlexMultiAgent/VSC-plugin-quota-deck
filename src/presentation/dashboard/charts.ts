export interface Point {
  readonly x: string;
  readonly y: number;
}

export interface Series {
  readonly label: string;
  readonly color: string;
  readonly darkColor: string;
  readonly values: number[];
}

export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 220;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const LEGEND_BAND = 20;
const PAD_TOP = 12 + LEGEND_BAND;
const PAD_BOTTOM = 28;

function plotWidth(): number {
  return CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
}

function plotHeight(): number {
  return CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
}

function baseline(): number {
  return PAD_TOP + plotHeight();
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function scaleY(value: number, max: number): number {
  return PAD_TOP + plotHeight() - (value / max) * plotHeight();
}

export function lineChartSvg(options: {
  readonly series: readonly Point[];
  readonly label: string;
  readonly accent: string;
}): string {
  const points = options.series;
  if (points.length === 0) return `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}"></svg>`;
  const max = niceMax(Math.max(...points.map((point) => point.y), 1));
  const step = points.length > 1 ? plotWidth() / (points.length - 1) : 0;
  const coordinates = points.map((point, index) => ({ x: PAD_LEFT + index * step, y: scaleY(point.y, max) }));
  const line = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const floor = baseline();
  const area = `${PAD_LEFT},${floor} ${line} ${coordinates[coordinates.length - 1]!.x.toFixed(1)},${floor}`;
  const gridlines = [0, 0.5, 1]
    .map((fraction) => {
      const y = PAD_TOP + plotHeight() * fraction;
      return `<line class="grid" x1="${PAD_LEFT}" y1="${y.toFixed(1)}" x2="${CHART_WIDTH - PAD_RIGHT}" y2="${y.toFixed(1)}" stroke-width="1" />`;
    })
    .join('');
  const crosshair = `<line class="crosshair" x1="0" y1="${PAD_TOP.toFixed(1)}" x2="0" y2="${floor.toFixed(1)}" stroke="var(--vscode-descriptionForeground)" stroke-width="1" opacity="0" />`;
  const hits = coordinates
    .map((point, index) => {
      const source = points[index]!;
      return `<circle class="hit" data-cx="${point.x.toFixed(1)}" data-label="${escapeSvgText(source.x)}" data-value="${source.y}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="10" fill="transparent" />`;
    })
    .join('');
  const end = coordinates[coordinates.length - 1]!;
  return (
    `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeSvgText(options.label)}">` +
    gridlines +
    `<polygon class="area" points="${area}" fill="${options.accent}" opacity="0.1" />` +
    `<polyline class="line" points="${line}" fill="none" stroke="${options.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` +
    crosshair +
    hits +
    `<circle class="marker" cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="4" fill="${options.accent}" stroke="var(--vscode-editor-background)" stroke-width="2" />` +
    `<text class="axis-label" x="${PAD_LEFT}" y="${CHART_HEIGHT - 8}" text-anchor="start">${escapeSvgText(points[0]!.x)}</text>` +
    `<text class="axis-label" x="${CHART_WIDTH - PAD_RIGHT}" y="${CHART_HEIGHT - 8}" text-anchor="end">${escapeSvgText(points[points.length - 1]!.x)}</text>` +
    `<text class="axis-label" x="4" y="${PAD_TOP + 4}" text-anchor="start">${max}</text>` +
    `<text class="axis-label" x="4" y="${floor}" text-anchor="start">0</text>` +
    '</svg>'
  );
}

export function stackedBarSvg(options: {
  readonly categories: readonly string[];
  readonly series: readonly Series[];
  readonly dark?: boolean;
}): string {
  const dark = options.dark === true;
  if (options.series.length === 0) return `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}"></svg>`;
  const totals = options.categories.map((_, index) =>
    options.series.reduce((sum, entry) => sum + (entry.values[index] ?? 0), 0),
  );
  const max = niceMax(Math.max(...totals, 1));
  const barWidth = Math.min(24, (plotWidth() / Math.max(options.categories.length, 1)) * 0.6);
  const gap = 2;
  const bars = options.categories
    .map((category, index) => {
      const x = PAD_LEFT + (index + 0.5) * (plotWidth() / Math.max(options.categories.length, 1));
      let cursor = baseline();
      return options.series
        .map((entry) => {
          const value = entry.values[index] ?? 0;
          if (value === 0) return '';
          const height = (value / max) * plotHeight();
          const y = cursor - height;
          const drawn = Math.max(0, height - gap);
          cursor = y - gap;
          const color = dark ? entry.darkColor : entry.color;
          return `<rect x="${(x - barWidth / 2).toFixed(1)}" y="${(y + gap).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${drawn.toFixed(1)}" rx="4" fill="${color}" data-gap="2" data-label="${escapeSvgText(entry.label)}" data-value="${value}" data-category="${escapeSvgText(category)}" />`;
        })
        .join('');
    })
    .join('');
  const legend = options.series.length >= 2
    ? `<g class="legend">${options.series.map((entry, index) => {
        const x = PAD_LEFT + index * 120;
        const color = dark ? entry.darkColor : entry.color;
        return `<rect x="${x.toFixed(1)}" y="4" width="10" height="10" rx="2" fill="${color}" /><text x="${(x + 16).toFixed(1)}" y="13" class="legend-label">${escapeSvgText(entry.label)}</text>`;
      }).join('')}</g>`
    : '';
  return `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="Usage by day">${bars}${legend}</svg>`;
}
