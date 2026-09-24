import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TenantService } from '../tenant';
import { OAuthIdentity } from './auth.service';

type OpenIdClientModule = typeof import('openid-client');

interface OidcState {
  purpose: 'oidc-state';
  tenantSlug: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

const loadOpenIdClient = new Function(
  'return import("openid-client")',
) as () => Promise<OpenIdClientModule>;

@Injectable()
export class OidcStrategy {
  constructor(
    private readonly tenantService: TenantService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async begin(tenantSlug: string) {
    const { oidc } = await this.getConfiguration(tenantSlug);
    const client = await loadOpenIdClient();
    const configuration = await client.discovery(
      this.discoveryUrl(oidc.discoveryUrl),
      oidc.clientId,
      oidc.clientSecret,
    );
    const codeVerifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const authorizationUrl = client.buildAuthorizationUrl(configuration, {
      redirect_uri: this.callbackUrl(tenantSlug),
      scope: 'openid email profile',
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    const stateToken = this.jwtService.sign(
      { purpose: 'oidc-state', tenantSlug, state, nonce, codeVerifier } satisfies OidcState,
      { expiresIn: '10m' },
    );
    return { authorizationUrl: authorizationUrl.toString(), stateToken };
  }

  async complete(tenantSlug: string, currentUrl: URL, stateToken: string) {
    let state: OidcState;
    try {
      state = this.jwtService.verify<OidcState>(stateToken);
    } catch {
      throw new UnauthorizedException('OIDC session has expired');
    }
    if (state.purpose !== 'oidc-state' || state.tenantSlug !== tenantSlug) {
      throw new UnauthorizedException('Invalid OIDC state');
    }

    const { oidc } = await this.getConfiguration(tenantSlug);
    const client = await loadOpenIdClient();
    const configuration = await client.discovery(
      this.discoveryUrl(oidc.discoveryUrl),
      oidc.clientId,
      oidc.clientSecret,
    );
    const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
      expectedState: state.state,
      expectedNonce: state.nonce,
      pkceCodeVerifier: state.codeVerifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    const email = typeof claims?.email === 'string' ? claims.email : undefined;
    if (!email || claims?.email_verified !== true) {
      throw new UnauthorizedException('OIDC did not return a verified email address');
    }
    const displayName = typeof claims?.name === 'string' ? claims.name : email;
    const avatarUrl = typeof claims?.picture === 'string' ? claims.picture : null;
    return {
      provider: 'oidc',
      email,
      displayName,
      avatarUrl,
      tenantSlug,
    } satisfies OAuthIdentity;
  }

  callbackUrl(tenantSlug: string) {
    const apiUrl = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
    const prefix = this.config.get<string>('API_PREFIX', 'api/v1');
    return `${apiUrl}/${prefix}/auth/oidc/${encodeURIComponent(tenantSlug)}/callback`;
  }

  private async getConfiguration(tenantSlug: string) {
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new ForbiddenException('Organization not found');
    }
    const settings = await this.tenantService.getSettings(tenant.id);
    const oidc = settings.sso.oidc;
    if (!oidc.enabled || !oidc.discoveryUrl || !oidc.clientId || !oidc.clientSecret) {
      throw new ForbiddenException('OIDC is not configured for this organization');
    }
    return { tenant, oidc };
  }

  private discoveryUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('OIDC discovery URL is invalid');
    }
    if (url.protocol !== 'https:' && this.config.get<string>('NODE_ENV') === 'production') {
      throw new BadRequestException('OIDC discovery URL must use HTTPS');
    }
    return url;
  }
}
