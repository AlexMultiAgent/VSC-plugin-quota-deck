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
  it('parses every documented balance amount and keeps a negative available balance', () => {
    expect(
      readQwenAccountBalance({
        Code: '200',
        Message: 'success',
        RequestId: 'request-id',
        Success: true,
        Data: {
          AvailableAmount: '-12.34',
          CreditAmount: '5.00',
          MybankCreditAmount: '6.00',
          Currency: 'CNY',
          AvailableCashAmount: '-18.34',
          QuotaLimit: '1000.00',
        },
      }),
    ).toEqual({
      availableAmount: -12.34,
      creditAmount: 5,
      mybankCreditAmount: 6,
      availableCashAmount: -18.34,
      quotaLimit: 1000,
      currency: 'CNY',
    });
  });

  it('allows an omitted quota limit', () => {
    const balance = readQwenAccountBalance({
      Code: '200',
      Message: 'success',
      RequestId: 'request-id',
      Success: true,
      Data: {
        AvailableAmount: '10.00',
        CreditAmount: '0.00',
        MybankCreditAmount: '0.00',
        Currency: 'CNY',
        AvailableCashAmount: '10.00',
      },
    });

    expect(balance.quotaLimit).toBeNull();
  });

  it('rejects a business failure even when the HTTP request succeeded', () => {
    expect(() =>
      readQwenAccountBalance({
        Code: '401',
        Message: 'InvalidAccessKeyId',
        RequestId: 'request-id',
        Success: false,
      }),
    ).toThrow();
  });

  it('rejects a non-numeric amount instead of rendering it as zero', () => {
    expect(() =>
      readQwenAccountBalance({
        Code: '200',
        Message: 'success',
        RequestId: 'request-id',
        Success: true,
        Data: {
          AvailableAmount: 'unavailable',
          CreditAmount: '0.00',
          MybankCreditAmount: '0.00',
          Currency: 'CNY',
          AvailableCashAmount: '10.00',
        },
      }),
    ).toThrow();
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
          endTime: 1790000000000,
          remainingDays: 12,
        }),
      ),
    ).toEqual({
      status: 'active',
      specCode: 'pro',
      expiresAt: 1790000000000,
      remainingDays: 12,
    });
  });

  it('reports none when the payload has no subscription', () => {
    expect(readQwenTokenPlanSubscription(subscriptionResponse(null))).toEqual({
      status: 'none',
      specCode: null,
      expiresAt: null,
      remainingDays: null,
    });
  });

  it('reports unknown for a status other than VALID', () => {
    expect(readQwenTokenPlanSubscription(subscriptionResponse({ status: 'EXPIRED' }))).toEqual({
      status: 'unknown',
      specCode: null,
      expiresAt: null,
      remainingDays: null,
    });
  });

  it('does not invent a missing expiry or tier', () => {
    expect(readQwenTokenPlanSubscription(subscriptionResponse({ status: 'VALID' }))).toEqual({
      status: 'active',
      specCode: null,
      expiresAt: null,
      remainingDays: null,
    });
  });
});
