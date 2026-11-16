import type { DashboardModel } from '../viewModel';
import type { RangeId } from '../../../core/time';
import { lineChartSvg, stackedBarSvg } from '../charts';

export interface WebviewRenderOptions {
  readonly onRangeChange: (range: RangeId) => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(title: string, className = 'chart-card'): HTMLElement {
  const wrapper = element('section', className);
  wrapper.appendChild(element('h2', 'chart-title', title));
  return wrapper;
}

function table(headers: string[], rows: Array<Array<string | number>>): HTMLTableElement {
  const root = element('table', 'data-table');
  const head = root.createTHead().insertRow();
  for (const label of headers) {
    const cell = document.createElement('th');
    cell.textContent = label;
    head.appendChild(cell);
  }
  const body = root.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach((value, index) => {
      const cell = tr.insertCell();
      cell.textContent = String(value);
      if (index > 0) cell.className = 'num';
    });
  }
  return root;
}

function attachCrosshair(container: HTMLElement, svg: SVGSVGElement): void {
  const crosshair = svg.querySelector<SVGLineElement>('.crosshair');
  const tooltip = element('div', 'chart-tooltip');
  tooltip.hidden = true;
  container.appendChild(tooltip);
  for (const hit of Array.from(svg.querySelectorAll<SVGCircleElement>('.hit'))) {
    hit.addEventListener('pointerenter', () => {
      const x = hit.dataset.cx ?? '0';
      if (crosshair) {
        crosshair.setAttribute('x1', x);
        crosshair.setAttribute('x2', x);
        crosshair.setAttribute('opacity', '1');
      }
      tooltip.textContent = `${hit.dataset.label ?? ''}: ${hit.dataset.value ?? ''}`;
      tooltip.style.left = `${Number(x) / 6.4}%`;
      tooltip.style.top = '8px';
      tooltip.hidden = false;
    });
    hit.addEventListener('pointerleave', () => {
      crosshair?.setAttribute('opacity', '0');
      tooltip.hidden = true;
    });
  }
}

function chartCard(title: string, svgText: string, tableNode: HTMLElement): HTMLElement {
  const card = section(title);
  const chart = element('div', 'chart-body');
  chart.innerHTML = svgText;
  const svg = chart.querySelector<SVGSVGElement>('svg');
  if (svg) attachCrosshair(chart, svg);
  card.appendChild(chart);
  const details = element('details');
  details.appendChild(element('summary', undefined, 'Table view'));
  details.appendChild(tableNode);
  card.appendChild(details);
  return card;
}

function isDarkTheme(): boolean {
  const classes = document.body.classList;
  return classes.contains('vscode-dark') || classes.contains('vscode-high-contrast');
}

export function renderDashboard(
  container: HTMLElement,
  model: DashboardModel,
  options: WebviewRenderOptions,
): void {
  container.replaceChildren();
  const hero = element('section', 'hero-section');
  hero.appendChild(element('div', 'hero-label', model.hero.label));
  hero.appendChild(element('div', 'hero', model.hero.value));
  hero.appendChild(element('div', 'provider-state', model.pricingLabel));
  container.appendChild(hero);

  const tiles = element('section', 'tiles');
  for (const tile of model.tiles) {
    const card = element('div', 'tile');
    card.appendChild(element('div', 'tile-label', tile.label));
    card.appendChild(element('div', 'tile-value', tile.value));
    tiles.appendChild(card);
  }
  container.appendChild(tiles);

  const filters = element('nav', 'filter-row');
  filters.setAttribute('aria-label', 'Usage range');
  for (const option of model.ranges) {
    const button = element('button', 'filter-button', option.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(option.id === model.range));
    if (option.id === model.range) button.classList.add('is-selected');
    button.addEventListener('click', () => options.onRangeChange(option.id));
    filters.appendChild(button);
  }
  container.appendChild(filters);

  const providers = element('section', 'providers');
  for (const provider of model.providers) {
    const card = element('article', 'provider-card');
    card.style.borderTopColor = isDarkTheme() ? provider.accent.dark : provider.accent.light;
    const title = element('h2', 'provider-name');
    const dot = element('span', 'provider-dot');
    dot.style.background = isDarkTheme() ? provider.accent.dark : provider.accent.light;
    title.appendChild(dot);
    title.appendChild(document.createTextNode(provider.name));
    card.appendChild(title);
    card.appendChild(element('div', 'provider-state', provider.state));
    for (const meter of provider.meters) {
      const row = element('div', 'meter');
      row.appendChild(element('div', 'meter-label', meter.label));
      const track = element('div', 'meter-track');
      const fill = element('div', 'meter-fill');
      fill.style.width = `${Math.max(0, Math.min(100, meter.percent ?? 0))}%`;
      fill.style.background = `var(--vscode-charts-${meter.tone === 'critical' ? 'red' : meter.tone === 'warning' ? 'yellow' : 'green'})`;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(element('div', 'meter-value', meter.percent === null ? '—' : `${Math.round(meter.percent)}%`));
      card.appendChild(row);
    }
    if (provider.message) card.appendChild(element('p', 'provider-error', provider.message));
    providers.appendChild(card);
  }
  container.appendChild(providers);

  if (model.usage.available) {
    container.appendChild(chartCard(
      `${model.labels.cost} · ${model.rangeLabel}`,
      lineChartSvg({ series: model.usage.cost, label: model.labels.cost, accent: isDarkTheme() ? '#3987e5' : '#2a78d6' }),
      table([model.labels.columnDate, model.labels.columnCost], model.usage.cost.map((point) => [point.x, point.y.toFixed(2)])),
    ));
    container.appendChild(chartCard(
      model.labels.tokens,
      lineChartSvg({ series: model.usage.tokens, label: model.labels.tokens, accent: isDarkTheme() ? '#199e70' : '#1baf7a' }),
      table([model.labels.columnDate, model.labels.columnTokens], model.usage.tokens.map((point) => [point.x, point.y])),
    ));
    container.appendChild(chartCard(
      model.labels.cache,
      stackedBarSvg({ categories: model.usage.categories, series: model.usage.tokenSeries, dark: isDarkTheme() }),
      table(
        [model.labels.columnDate, ...model.usage.tokenSeries.map((series) => series.label)],
        model.usage.categories.map((category, index) => [category, ...model.usage.tokenSeries.map((series) => series.values[index] ?? 0)]),
      ),
    ));
    if (model.usage.byModel.length > 0) {
      const card = section(model.labels.modelTable, 'table-card');
      card.appendChild(table(
        [model.labels.columnModel, model.labels.columnRequests, model.labels.columnTokens, model.labels.columnCost, model.labels.columnCurrency],
        model.usage.byModel.map((row) => [row.model, row.requests, row.totalTokens, row.cost.toFixed(2), row.currency]),
      ));
      container.appendChild(card);
    }
  }

  if (model.balances.length > 0) {
    const card = section(model.labels.balanceTable, 'table-card');
    card.appendChild(table([model.labels.columnCurrency, model.labels.columnTotal], model.balances.map((row) => [row.currency, row.total.toFixed(2)])));
    container.appendChild(card);
  }
  if (model.qwen.length > 0) {
    const matrix = section(model.labels.qwenTitle, 'qwen-matrix');
    for (const row of model.qwen) {
      const line = element('div', 'qwen-row');
      line.appendChild(element('span', undefined, row.label));
      line.appendChild(element('span', 'qwen-state', model.labels.qwenUnsupported));
      matrix.appendChild(line);
    }
    container.appendChild(matrix);
  }
}
