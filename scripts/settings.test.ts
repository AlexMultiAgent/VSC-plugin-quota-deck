import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ConfigurationProperty {
  readonly scope?: string;
  readonly markdownDescription?: string;
  readonly enumDescriptions?: string[];
  readonly uniqueItems?: boolean;
}

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  contributes: {
    configuration: {
      title: string;
      properties: Record<string, ConfigurationProperty>;
    };
  };
};

const properties = manifest.contributes.configuration.properties;

describe('plugin settings contribution', () => {
  it('registers every runtime setting under an extension-window scope', () => {
    expect(Object.keys(properties).sort()).toEqual([
      'quotaDeck.language',
      'quotaDeck.pauseWhenUnfocused',
      'quotaDeck.refreshIntervalMinutes',
      'quotaDeck.statusBar.mode',
      'quotaDeck.statusBar.primaryProvider',
      'quotaDeck.statusBar.providerOrder',
      'quotaDeck.statusBar.warningThresholdPercent',
      'quotaDeck.timeZone',
    ]);
    for (const property of Object.values(properties)) {
      expect(property.scope).toBe('window');
      expect(property.markdownDescription).toMatch(/^%config\..+\.description%$/);
    }
  });

  it('describes both status bar modes and enforces unique provider order entries', () => {
    expect(properties['quotaDeck.statusBar.mode']?.enumDescriptions).toHaveLength(2);
    expect(properties['quotaDeck.statusBar.providerOrder']?.uniqueItems).toBe(true);
  });
});
