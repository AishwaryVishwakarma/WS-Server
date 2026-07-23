import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {OAuth2Client} from 'google-auth-library';

// The identity we trust out of a verified Google ID token.
export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

// Verifies the ID token that Google Identity Services hands the browser. Only
// needs the OAuth Client ID (public) — no client secret, since we're not doing
// the authorization-code exchange. Disabled (503) when GOOGLE_CLIENT_ID is
// unset, so the app boots fine in dev/CI without Google configured.
@Injectable()
export class GoogleAuthService {
  private readonly clientId: string | undefined;
  private readonly client: OAuth2Client;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client(this.clientId);
  }

  get enabled(): boolean {
    return Boolean(this.clientId);
  }

  async verify(credential: string): Promise<GoogleProfile> {
    if (!this.clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        // Rejects tokens minted for a different client — the core check that
        // stops a token from another app being replayed here.
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: Boolean(payload.email_verified),
      name: payload.name?.trim() || payload.email.split('@')[0],
      picture: payload.picture,
    };
  }
}
