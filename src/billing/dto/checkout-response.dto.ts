import {Expose} from 'class-transformer';

export class CheckoutResponseDto {
  @Expose() url: string;

  constructor(partial: Partial<CheckoutResponseDto>) {
    Object.assign(this, partial);
  }
}

export class CustomerPortalResponseDto {
  @Expose() url: string;

  constructor(partial: Partial<CustomerPortalResponseDto>) {
    Object.assign(this, partial);
  }
}
