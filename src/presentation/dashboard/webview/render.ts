import {
  groupHistoryTiles,
  type DashboardModel,
  type ProviderDetail,
  type QuotaMeter,
} from '../viewModel';
import type { RangeId } from '../../../core/time';

export interface WebviewRenderOptions {
  readonly onRangeChange: (range: RangeId) => void;
  readonly onConfigure: () => void;
  readonly onRefresh: () => void;
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

interface ProviderSection {
  readonly label: string | undefined;
  readonly meters: QuotaMeter[];
  readonly details: ProviderDetail[];
}

/**
 * Merge meters and details that share a group label into one visual section,
 * so a provider such as Qwen does not repeat a "Token Plan" heading.
 */
function buildSections(
  meters: readonly QuotaMeter[],
  details: readonly ProviderDetail[],
): ProviderSection[] {
  const sections: ProviderSection[] = [];
  const add = (label: string | undefined): ProviderSection => {
    const existing = sections.find((section) => section.label === label);
    if (existing !== undefined) return existing;
    const section: ProviderSection = { label, meters: [], details: [] };
    sections.push(section);
    return section;
  };
  for (const meter of meters) add(meter.group).meters.push(meter);
  for (const detail of details) add(detail.group).details.push(detail);
  return sections;
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
  const actions = element('div', 'action-row');
  if (model.lastUpdated !== null) {
    actions.appendChild(element('span', 'action-updated', model.lastUpdated));
  }
  const refresh = element('button', 'action-button', model.labels.refreshNow);
  refresh.type = 'button';
  refresh.addEventListener('click', () => options.onRefresh());
  const configure = element('button', 'action-button', model.labels.configureProviders);
  configure.type = 'button';
  configure.addEventListener('click', () => options.onConfigure());
  actions.appendChild(refresh);
  actions.appendChild(configure);
  container.appendChild(actions);

  if (model.hero !== null) {
    const hero = element('section', 'hero-section');
    hero.appendChild(element('div', 'hero-label', model.hero.label));
    hero.appendChild(element('div', 'hero', model.hero.value));
    if (model.hero.sourceLabel !== null) {
      hero.appendChild(element('div', 'hero-source', model.hero.sourceLabel));
    }
    container.appendChild(hero);
  }

  const providers = element('section', 'providers');
  for (const provider of model.providers) {
    const card = element('article', 'provider-card');
    card.style.borderTopColor = isDarkTheme() ? provider.accent.dark : provider.accent.light;
    const header = element('header', 'provider-header');
    const title = element('h2', 'provider-name');
    const dot = element('span', 'provider-dot');
    dot.style.background = isDarkTheme() ? provider.accent.dark : provider.accent.light;
    title.appendChild(dot);
    title.appendChild(document.createTextNode(provider.name));
    header.appendChild(title);
    const badges = element('div', 'provider-badges');
    badges.appendChild(element('span', 'provider-state', provider.stateLabel));
    if (provider.hoursLabel !== null) {
      badges.appendChild(element('span', 'provider-state is-hours', provider.hoursLabel));
    }
    header.appendChild(badges);
    card.appendChild(header);
    if (provider.accountValue !== null) {
      const account = element('div', 'provider-account');
      account.appendChild(element('span', 'provider-account-label', provider.accountValue.label));
      account.appendChild(element('strong', 'provider-account-value', provider.accountValue.value));
      card.appendChild(account);
    }
    for (const section of buildSections(provider.meters, provider.details)) {
      const block = element('section', 'provider-section');
      if (section.label !== undefined) {
        block.appendChild(element('h3', 'provider-section-title', section.label));
      }
      if (section.meters.length > 0) {
        const meters = element('div', 'meter-list');
        for (const meter of section.meters) {
          const row = element('div', 'meter');
          const meterHead = element('div', 'meter-head');
          meterHead.appendChild(element('div', 'meter-label', meter.label));
          meterHead.appendChild(
            element(
              'div',
              `meter-value is-${meter.tone}`,
              meter.valueLabel ??
                (meter.percent === null ? '—' : `${Math.round(meter.percent)}%`),
            ),
          );
          row.appendChild(meterHead);
          if (meter.unlimited !== true) {
            const track = element('div', 'meter-track');
            const fill = element('div', 'meter-fill');
            fill.style.width = `${Math.max(0, Math.min(100, meter.percent ?? 0))}%`;
            fill.style.background = `var(--vscode-charts-${meter.tone === 'critical' ? 'red' : meter.tone === 'warning' ? 'orange' : 'green'})`;
            track.appendChild(fill);
            row.appendChild(track);
          }
          if (meter.resetLabel !== null) {
            row.appendChild(element('div', 'meter-reset', meter.resetLabel));
          }
          meters.appendChild(row);
        }
        block.appendChild(meters);
      }
      if (section.details.length > 0) {
        const details = element('dl', 'provider-details');
        for (const detail of section.details) {
          const row = element('div', 'provider-detail');
          row.appendChild(element('dt', undefined, detail.label));
          row.appendChild(element('dd', undefined, detail.value));
          details.appendChild(row);
        }
        block.appendChild(details);
      }
      card.appendChild(block);
    }
    if (provider.note) card.appendChild(element('p', 'provider-note', provider.note));
    if (provider.message) card.appendChild(element('p', 'provider-error', provider.message));
    providers.appendChild(card);
  }
  container.appendChild(providers);

  if (model.hasHistoryData) {
    const history = element('section', 'history-section');
    history.appendChild(element('h2', 'history-title', model.labels.historyUsage));
    const filters = element('nav', 'filter-row');
    filters.setAttribute('aria-label', model.labels.historyRange);
    for (const option of model.ranges) {
      const button = element('button', 'filter-button', option.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(option.id === model.range));
      if (option.id === model.range) button.classList.add('is-selected');
      button.addEventListener('click', () => options.onRangeChange(option.id));
      filters.appendChild(button);
    }
    history.appendChild(filters);
    history.appendChild(element('p', 'filter-note', model.labels.liveQuotaNote));
    for (const group of groupHistoryTiles(model.historyTiles)) {
      const groupNode = element('section', 'history-group');
      groupNode.appendChild(
        element('h3', 'history-group-title', `${group.scope} · ${model.rangeLabel}`),
      );
      const tiles = element('div', 'history-tiles');
      if (group.tiles.length === 1) tiles.classList.add('is-single');
      for (const tile of group.tiles) {
        const card = element('div', 'tile');
        card.appendChild(element('div', 'tile-label', tile.label));
        card.appendChild(element('div', 'tile-value', tile.value));
        tiles.appendChild(card);
      }
      groupNode.appendChild(tiles);
      history.appendChild(groupNode);
    }
    container.appendChild(history);
  }
}
