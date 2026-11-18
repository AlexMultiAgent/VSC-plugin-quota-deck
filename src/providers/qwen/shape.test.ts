import { describe, expect, it } from 'vitest';
import { readQwenAccountBalance } from './shape';

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
