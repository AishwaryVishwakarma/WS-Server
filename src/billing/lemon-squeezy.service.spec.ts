import {ConfigService} from '@nestjs/config';
import {LemonSqueezyService} from './lemon-squeezy.service';

function makeConfigService(values: Record<string, string>): ConfigService {
  return {get: (key: string) => values[key]} as unknown as ConfigService;
}

function mockFetchResponse(ok: boolean, status: number, body?: unknown) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

const CONFIGURED = {
  LEMONSQUEEZY_API_KEY: 'ls_test_key',
  LEMONSQUEEZY_STORE_ID: '111',
  LEMONSQUEEZY_PATRON_VARIANT_ID: '222',
  FRONTEND_URL: 'https://whisperingshadows.test',
};

describe('LemonSqueezyService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('is disabled when any required config is missing', () => {
    expect(new LemonSqueezyService(makeConfigService({})).enabled).toBe(false);
    expect(
      new LemonSqueezyService(
        makeConfigService({LEMONSQUEEZY_API_KEY: 'ls_test_key'})
      ).enabled
    ).toBe(false);
  });

  it('is enabled once the full config group is present', () => {
    expect(new LemonSqueezyService(makeConfigService(CONFIGURED)).enabled).toBe(
      true
    );
  });

  it('posts the JSON:API checkout body with auth headers and a timeout', async () => {
    const fetchMock = mockFetchResponse(true, 200, {
      data: {attributes: {url: 'https://ls.test/checkout/abc'}},
    });
    global.fetch = fetchMock;
    const service = new LemonSqueezyService(makeConfigService(CONFIGURED));

    const result = await service.createCheckout('user-1');

    expect(result).toEqual({url: 'https://ls.test/checkout/abc'});
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.lemonsqueezy.com/v1/checkouts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer ls_test_key',
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
        signal: expect.any(AbortSignal),
      })
    );
    const [, options] = fetchMock.mock.calls[0] as [string, {body: string}];
    const body = JSON.parse(options.body) as {
      data: {
        attributes: {
          checkout_data: {custom: {user_id: string}};
          product_options: {redirect_url: string};
        };
        relationships: {
          store: {data: {id: string}};
          variant: {data: {id: string}};
        };
      };
    };
    expect(body.data.attributes.checkout_data.custom.user_id).toBe('user-1');
    expect(body.data.attributes.product_options.redirect_url).toBe(
      'https://whisperingshadows.test/me?tab=membership&checkout=success'
    );
    expect(body.data.relationships.store.data.id).toBe('111');
    expect(body.data.relationships.variant.data.id).toBe('222');
  });

  it('throws with the status code on a failed checkout request', async () => {
    global.fetch = mockFetchResponse(false, 422);
    const service = new LemonSqueezyService(makeConfigService(CONFIGURED));

    await expect(service.createCheckout('user-1')).rejects.toThrow(
      'LemonSqueezy checkout request failed (422)'
    );
  });

  it('extracts the customer portal url from a subscription lookup', async () => {
    const fetchMock = mockFetchResponse(true, 200, {
      data: {attributes: {urls: {customer_portal: 'https://ls.test/portal'}}},
    });
    global.fetch = fetchMock;
    const service = new LemonSqueezyService(makeConfigService(CONFIGURED));

    const url = await service.getCustomerPortalUrl('sub_1');

    expect(url).toBe('https://ls.test/portal');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.lemonsqueezy.com/v1/subscriptions/sub_1',
      expect.objectContaining({method: 'GET'})
    );
  });

  it('throws with the status code on a failed subscription lookup', async () => {
    global.fetch = mockFetchResponse(false, 404);
    const service = new LemonSqueezyService(makeConfigService(CONFIGURED));

    await expect(service.getCustomerPortalUrl('sub_1')).rejects.toThrow(
      'LemonSqueezy subscription request failed (404)'
    );
  });
});
