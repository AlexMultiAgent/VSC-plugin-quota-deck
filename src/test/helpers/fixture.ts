import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_ROOT = join(process.cwd(), 'src', 'test', 'fixtures');

function capabilityDirectory(capabilityId: string): string {
  return capabilityId.includes('.') ? capabilityId.slice(capabilityId.indexOf('.') + 1) : capabilityId;
}

export function fixturePath(providerId: string, capabilityId: string, caseName: string): string {
  return join(FIXTURE_ROOT, providerId, capabilityDirectory(capabilityId), `${caseName}.json`);
}

export function loadFixture(providerId: string, capabilityId: string, caseName: string): unknown {
  const path = fixturePath(providerId, capabilityId, caseName);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new Error(`fixture not found: ${path}`);
    }
    throw error;
  }
}
