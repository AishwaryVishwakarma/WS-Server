import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

const LEMONSQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1';
const LEMONSQUEEZY_REQUEST_TIMEOUT_MS = 10_000;

interface LemonSqueezyCheckoutResponse {
  data: {attributes: {url: string}};
}

interface LemonSqueezySubscriptionResponse {
  data: {attributes: {urls: {customer_portal: string}}};
}

// Outbound LemonSqueezy API client — mirrors MailTransportService's shape
// (native fetch, no HTTP library dependency, an `enabled` getter so callers
// can no-op gracefully when billing isn't configured).
@Injectable()
export class LemonSqueezyService {
  private readonly apiKey: string | undefined;
  private readonly storeId: string | undefined;
  private readonly patronVariantId: string | undefined;
  private readonly testMode: boolean;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('LEMONSQUEEZY_API_KEY');
    this.storeId = this.configService.get<string>('LEMONSQUEEZY_STORE_ID');
    this.patronVariantId = this.configService.get<string>(
      'LEMONSQUEEZY_PATRON_VARIANT_ID'
    );
    this.testMode =
      this.configService.get<string>('LEMONSQUEEZY_TEST_MODE') === 'true';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  get enabled(): boolean {
    return !!this.apiKey && !!this.storeId && !!this.patronVariantId;
  }

  // Custom data set here (`checkout_data.custom.user_id`) is echoed back by
  // LemonSqueezy on every subsequent webhook for the resulting subscription
  // — see LemonSqueezyWebhookService.
  async createCheckout(userId: string): Promise<{url: string}> {
    const response = await fetch(`${LEMONSQUEEZY_API_URL}/checkouts`, {
      method: 'POST',
      headers: this._headers(),
      signal: AbortSignal.timeout(LEMONSQUEEZY_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {custom: {user_id: userId}},
            product_options: {
              redirect_url: `${this.frontendUrl}/me?tab=membership&checkout=success`,
            },
            test_mode: this.testMode,
          },
          relationships: {
            store: {data: {type: 'stores', id: this.storeId}},
            variant: {data: {type: 'variants', id: this.patronVariantId}},
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `LemonSqueezy checkout request failed (${response.status})`
      );
    }

    const body = (await response.json()) as LemonSqueezyCheckoutResponse;
    return {url: body.data.attributes.url};
  }

  // The subscription's own `urls.customer_portal` is a pre-signed link
  // valid for 24 hours — fetched fresh on every call, never cached.
  async getCustomerPortalUrl(subscriptionId: string): Promise<string> {
    const response = await fetch(
      `${LEMONSQUEEZY_API_URL}/subscriptions/${subscriptionId}`,
      {
        method: 'GET',
        headers: this._headers(),
        signal: AbortSignal.timeout(LEMONSQUEEZY_REQUEST_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      throw new Error(
        `LemonSqueezy subscription request failed (${response.status})`
      );
    }

    const body = (await response.json()) as LemonSqueezySubscriptionResponse;
    return body.data.attributes.urls.customer_portal;
  }

  private _headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    };
  }
}
