import { describe, expect, it } from 'vitest';
import { CHART_HEIGHT, CHART_WIDTH, lineChartSvg, stackedBarSvg } from './charts';

const series = [
  { x: '2026-11-14', y: 10 },
  { x: '2026-11-15', y: 25 },
  { x: '2026-11-16', y: 5 },
];

const tokenSeries = [
  { label: 'Cache hit', color: '#2a78d6', darkColor: '#3987e5', values: [10] },
  { label: 'Cache miss', color: '#eb6834', darkColor: '#d95926', values: [4] },
  { label: 'Output', color: '#1baf7a', darkColor: '#199e70', values: [2] },
];

describe('lineChartSvg', () => {
  it('draws one polyline for a single series', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect(svg).toContain('<polyline');
    expect(svg).toContain('stroke-width="2"');
  });

  it('draws solid hairline gridlines', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect(svg).not.toContain('stroke-dasharray');
    expect(svg).toContain('stroke-width="1"');
  });

  it('draws a ten percent area wash', () => {
    expect(lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' })).toContain('opacity="0.1"');
  });

  it('escapes markup in labels', () => {
    const svg = lineChartSvg({ series, label: '<script>x</script>', accent: '#2a78d6' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('emits one hit target per point', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect((svg.match(/class="hit"/g) ?? [])).toHaveLength(3);
    expect(svg).toContain('data-value="25"');
  });
});

describe('stackedBarSvg', () => {
  it('draws the legend and series values', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries });
    expect(svg).toContain('Cache hit');
    expect(svg).toContain('Cache miss');
    expect(svg).toContain('Output');
    expect(svg).toContain('class="legend"');
  });

  it('uses dark series colours in dark mode', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries, dark: true });
    expect(svg).toContain('#3987e5');
    expect(svg).not.toContain('#2a78d6');
  });

  it('uses a two pixel gap and carries category data', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries });
    expect(svg).toContain('data-gap="2"');
    expect(svg).toContain('data-category="2026-11-15"');
    expect(svg).toContain('data-value="10"');
  });
});

describe('chart size', () => {
  it('has a positive view box', () => {
    expect(CHART_WIDTH).toBeGreaterThan(0);
    expect(CHART_HEIGHT).toBeGreaterThan(0);
  });
});
