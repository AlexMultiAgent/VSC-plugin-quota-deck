import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  contributes: {
    commands: Array<{ command: string; icon?: string }>;
    viewsContainers?: {
      activitybar?: Array<{ id: string; title: string; icon: string }>;
    };
    views?: Record<string, Array<{ id: string; name: string }>>;
    menus?: {
      'view/title'?: Array<{ command: string; when: string }>;
    };
  };
};

describe('Activity Bar contribution', () => {
  it('registers the QuotaDeck overview container and view', () => {
    expect(manifest.contributes.viewsContainers?.activitybar ?? []).toContainEqual({
      id: 'quotaDeck',
      title: '%viewsContainer.quotaDeck.title%',
      icon: 'media/activity-bar.svg',
    });
    expect(manifest.contributes.views?.quotaDeck ?? []).toContainEqual({
      id: 'quotaDeck.overview',
      name: '%view.quotaDeck.overview.name%',
    });
  });

  it('registers refresh, dashboard, and settings title actions', () => {
    const actions = (manifest.contributes.menus?.['view/title'] ?? [])
      .filter((entry) => entry.when === 'view == quotaDeck.overview')
      .map((entry) => entry.command);
    expect(actions).toEqual([
      'quotaDeck.refresh',
      'quotaDeck.openDashboard',
      'quotaDeck.openSettings',
    ]);
    expect(
      manifest.contributes.commands.find(
        (entry) => entry.command === 'quotaDeck.openSettings',
      )?.icon,
    ).toBe('$(gear)');
  });

  it('ships a theme-aware SVG without executable or external content', () => {
    const iconPath = resolve(root, 'media/activity-bar.svg');
    expect(existsSync(iconPath)).toBe(true);
    const svg = existsSync(iconPath) ? readFileSync(iconPath, 'utf8') : '';
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('currentColor');
    expect(svg.replace('http://www.w3.org/2000/svg', ''))
      .not.toMatch(/<script\b|https?:|\bfile:/i);
  });
});
