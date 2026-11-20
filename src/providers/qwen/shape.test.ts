import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/helpers/fixture';
import {
  QwenConsoleAuthError,
  QwenConsoleForbiddenError,
  readQwenAccountBalance,
  readQwenConsoleToken,
  readQwenTokenPlan,
  readQwenTokenPlanSubscription,
} from './shape';

describe('readQwenAccountBalance', () => {
  function response(): any {
    return JSON.parse(
      JSON.stringify(loadFixture('qwen', 'qwen.accountBalance', 'standard')),
    ).response;
  }

  it('parses the captured fund-account amounts', () => {
    const body = response();
    body.data.AvailableAmount = '-12.34';
    body.data.CashAmount = '-18.34';
    body.data.CreditAmount = '5.00';
    body.data.QuotaAmount = '1000.00';

    expect(readQwenAccountBalance(body)).toEqual({
      availableAmount: -12.34,
      availableCashAmount: -18.34,
      creditAmount: 5,
      availableCreditAmount: 0,
      quotaLimit: 1000,
      quotaConsumedAmount: 0,
      unclearedAmount: 0,
      unpaidAmount: 0,
      fundAccountStatus: 'VALID',
      currency: 'CNY',
    });
  });

  it('parses the captured zero balance without inventing values', () => {
    expect(readQwenAccountBalance(response())).toEqual({
      availableAmount: 0,
      availableCashAmount: 0,
      creditAmount: 0,
      availableCreditAmount: 0,
      quotaLimit: 0,
      quotaConsumedAmount: 0,
      unclearedAmount: 0,
      unpaidAmount: 0,
      fundAccountStatus: 'VALID',
      currency: 'CNY',
    });
  });

  it('allows an omitted quota limit', () => {
    const body = response();
    delete body.data.QuotaAmount;
    expect(readQwenAccountBalance(body).quotaLimit).toBeNull();
  });

  it('rejects a business failure even when the HTTP request succeeded', () => {
    const body = response();
    body.code = '401';
    expect(() => readQwenAccountBalance(body)).toThrow();
  });

  it('rejects a missing cash amount instead of substituting zero', () => {
    const body = response();
    delete body.data.CashAmount;
    expect(() => readQwenAccountBalance(body)).toThrow();
  });

  it('rejects a non-numeric amount instead of rendering it as zero', () => {
    const body = response();
    body.data.AvailableAmount = 'unavailable';
    expect(() => readQwenAccountBalance(body)).toThrow();
  });
});

type Captured = { response: any; steps?: any[] };

function capture(capability: 'qwen.tokenPlan' | 'qwen.tokenPlanSubscription'): Captured {
  return JSON.parse(
    JSON.stringify(loadFixture('qwen', capability, 'standard')),
  ) as Captured;
}

function usageResponse(fields: Record<string, unknown>): any {
  const fixture = capture('qwen.tokenPlan');
  const entity = fixture.response.data.DataV2.data.data;
  delete entity.per1MonthPercentage;
  delete entity.per1MonthResetTime;
  delete entity.per1WeekPercentage;
  delete entity.per1WeekResetTime;
  Object.assign(entity, fields);
  return fixture.response;
}

function subscriptionResponse(data: unknown): any {
  const fixture = capture('qwen.tokenPlanSubscription');
  fixture.response.data.DataV2.data.data = data;
  return fixture.response;
}

function gatewayError(errorCode: string): any {
  const fixture = capture('qwen.tokenPlan');
  fixture.response.data.success = false;
  fixture.response.data.errorCode = errorCode;
  return fixture.response;
}

describe('readQwenConsoleToken', () => {
  it('reads the token from the captured issuance response', () => {
    const fixture = capture('qwen.tokenPlan');
    expect(readQwenConsoleToken(fixture.steps?.[0])).toBe('<redacted>');
  });

  it('reads a token from a wrapped Data object', () => {
    expect(readQwenConsoleToken({ data: { cliAccessToken: 'token' } })).toBe('token');
  });

  it('rejects a response without a token', () => {
    expect(() => readQwenConsoleToken({})).toThrow();
  });
});

describe('readQwenTokenPlan', () => {
  it('maps the monthly window from the captured envelope', () => {
    expect(
      readQwenTokenPlan(
        usageResponse({ per1MonthPercentage: 0.62, per1MonthResetTime: 1790000000000 }),
      ),
    ).toEqual({
      windows: [{ cycle: 'monthly', usedRatio: 0.62, resetAt: 1790000000000 }],
    });
  });

  it('maps the legacy weekly window', () => {
    expect(readQwenTokenPlan(usageResponse({ per1WeekPercentage: 0.25 }))).toEqual({
      windows: [{ cycle: 'weekly', usedRatio: 0.25, resetAt: null }],
    });
  });

  it('keeps monthly and weekly independent when both are present', () => {
    expect(
      readQwenTokenPlan(
        usageResponse({
          per1MonthPercentage: 0.5,
          per1WeekPercentage: 0.75,
          per1WeekResetTime: 1780000000000,
        }),
      ),
    ).toEqual({
      windows: [
        { cycle: 'monthly', usedRatio: 0.5, resetAt: null },
        { cycle: 'weekly', usedRatio: 0.75, resetAt: 1780000000000 },
      ],
    });
  });

  it('returns no windows when the payload has no percentage', () => {
    expect(readQwenTokenPlan(usageResponse({}))).toEqual({ windows: [] });
  });

  it('rejects a percentage outside 0..1 instead of clamping it', () => {
    expect(() => readQwenTokenPlan(usageResponse({ per1MonthPercentage: 62 }))).toThrow();
  });

  it('rejects a non-integer reset time', () => {
    expect(() =>
      readQwenTokenPlan(usageResponse({ per1MonthPercentage: 0.1, per1MonthResetTime: 1.5 })),
    ).toThrow();
  });

  it('turns a missing usage payload into no windows', () => {
    const fixture = capture('qwen.tokenPlan');
    fixture.response.data.DataV2.data.data = null;
    expect(readQwenTokenPlan(fixture.response)).toEqual({ windows: [] });
  });

  it('raises a dedicated error for NotLogined', () => {
    expect(() => readQwenTokenPlan(gatewayError('BailianGateway.Login.NotLogined'))).toThrow(
      QwenConsoleAuthError,
    );
  });

  it('raises a dedicated error for Team.NotAuthorised', () => {
    expect(() => readQwenTokenPlan(gatewayError('BailianGateway.Team.NotAuthorised'))).toThrow(
      QwenConsoleForbiddenError,
    );
  });
});

describe('readQwenTokenPlanSubscription', () => {
  it('reads an active subscription from the captured envelope', () => {
    expect(
      readQwenTokenPlanSubscription(
        subscriptionResponse({
          status: 'VALID',
          specCode: 'pro',
          startTime: 1780000000000,
          endTime: 1790000000000,
          remainingDays: 12,
          autoRenewFlag: true,
        }),
      ),
    ).toEqual({
      status: 'active',
      specCode: 'pro',
      startedAt: 1780000000000,
      expiresAt: 1790000000000,
      remainingDays: 12,
      autoRenew: true,
    });
  });

  it('reports none when the payload has no subscription', () => {
    expect(readQwenTokenPlanSubscription(subscriptionResponse(null))).toEqual({
      status: 'none',
      specCode: null,
      startedAt: null,
      expiresAt: null,
      remainingDays: null,
      autoRenew: null,
    });
  });

  it('reports unknown for a status other than VALID', () => {
    expect(readQwenTokenPlanSubscription(subscriptionResponse({ status: 'EXPIRED' }))).toEqual({
      status: 'unknown',
      specCode: null,
      startedAt: null,
      expiresAt: null,
      remainingDays: null,
      autoRenew: null,
    });
  });

  it('does not invent a missing expiry or tier', () => {
    expect(readQwenTokenPlanSubscription(subscriptionResponse({ status: 'VALID' }))).toEqual({
      status: 'active',
      specCode: null,
      startedAt: null,
      expiresAt: null,
      remainingDays: null,
      autoRenew: null,
    });
  });
});
