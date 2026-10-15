import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TenantService } from '../tenant';
import { OAuthIdentity } from './auth.service';

import { loadOpenIdClient } from './oidc-client';
import { fetchOidc } from '../security/oidc-http';
import { createHash } from 'crypto';
import type { TenantSettings } from '@weaver/shared';

interface OidcState {
  purpose: 'oidc-state';
  tenantSlug: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

@Injectable()
export class OidcStrategy {
  private readonly configurations = new Map<
    string,
    {
      fingerprint: string;
      expires: number;
      pending: Promise<import('openid-client').Configuration>;
    }
  >();
  constructor(
    private readonly tenantService: TenantService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async begin(tenantSlug: string) {
    const { tenant, oidc } = await this.getConfiguration(tenantSlug);
    const client = await loadOpenIdClient();
    const configuration = await this.discover(client, tenant.id, oidc);
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

    const { tenant, oidc } = await this.getConfiguration(tenantSlug);
    const client = await loadOpenIdClient();
    const configuration = await this.discover(client, tenant.id, oidc);
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

  private discover(
    client: typeof import('openid-client'),
    tenantId: string,
    oidc: TenantSettings['sso']['oidc'],
  ) {
    const fingerprint = createHash('sha256').update(JSON.stringify(oidc)).digest('hex');
    const existing = this.configurations.get(tenantId);
    if (existing && existing.fingerprint === fingerprint && existing.expires > Date.now())
      return existing.pending;
    // Bound cached tenants and coalesce concurrent discovery without logging credentials.
    this.configurations.delete(tenantId);
    if (this.configurations.size >= 64)
      this.configurations.delete(this.configurations.keys().next().value!);
    const pending = client.discovery(
      new URL(oidc.discoveryUrl),
      oidc.clientId,
      oidc.clientSecret,
      undefined,
      {
        [client.customFetch]: fetchOidc,
      },
    );
    const entry = { fingerprint, expires: Date.now() + 5 * 60_000, pending };
    this.configurations.set(tenantId, entry);
    void pending.catch(() => {
      if (this.configurations.get(tenantId) === entry) this.configurations.delete(tenantId);
    });
    return pending;
  }
}
