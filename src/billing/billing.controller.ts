import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type {Request} from 'express';
import {plainToInstance} from 'class-transformer';
import {ApiCookieAuth} from '@nestjs/swagger';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {SettingsService} from 'src/settings/settings.service';
import {UsersService} from 'src/users/users.service';
import {MembershipTier} from 'src/users/enums/membership-tier.enum';
import {LemonSqueezyService} from './lemon-squeezy.service';
import {
  CheckoutResponseDto,
  CustomerPortalResponseDto,
} from './dto/checkout-response.dto';

// Self-serve subscription entry points, matching PrivateUsersController's
// /users/me/* shelf routes — separated into their own domain module
// (mirrors BookmarksController) rather than injected into that already
// large controller.
@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard)
@Controller()
export class BillingController {
  constructor(
    private readonly lemonSqueezyService: LemonSqueezyService,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService
  ) {}

  @Post('users/me/billing/checkout')
  async createCheckout(@Req() req: Request): Promise<CheckoutResponseDto> {
    if (!this.lemonSqueezyService.enabled) {
      throw new ServiceUnavailableException('Billing is not configured');
    }
    if (!(await this.settingsService.isMembershipFeaturesEnabled())) {
      throw new ForbiddenException('Membership is not currently available');
    }

    const user = await this.usersService.findOne(req.session.userId!);
    if (user.membershipTier !== MembershipTier.Free) {
      throw new ConflictException('You already have an active membership');
    }

    const {url} = await this.lemonSqueezyService.createCheckout(user.id);
    return plainToInstance(CheckoutResponseDto, {url});
  }

  @Get('users/me/billing/portal')
  async getPortalUrl(@Req() req: Request): Promise<CustomerPortalResponseDto> {
    const user = await this.usersService.findOne(req.session.userId!);
    if (!user.lemonSqueezySubscriptionId) {
      throw new NotFoundException('No subscription on file');
    }

    const url = await this.lemonSqueezyService.getCustomerPortalUrl(
      user.lemonSqueezySubscriptionId
    );
    return plainToInstance(CustomerPortalResponseDto, {url});
  }
}
