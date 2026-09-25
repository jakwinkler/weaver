import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  MultiSamlStrategy,
  ValidateInResponseTo,
  PassportSamlConfig,
  Profile,
  VerifiedCallback,
} from '@node-saml/passport-saml';
import { Request } from 'express';
import { TenantService } from '../tenant';
import { SamlRequestCache, SAML_REQUEST_TTL_MS } from './saml-request-cache';
import { OAuthIdentity } from './auth.service';

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class SamlStrategy extends PassportStrategy(MultiSamlStrategy, 'saml') {
  constructor(tenantService: TenantService, config: ConfigService, requests: SamlRequestCache) {
    const getSamlOptions = (
      request: Request,
      callback: (error: Error | null, options?: Partial<PassportSamlConfig>) => void,
    ) => {
      void (async () => {
        const tenantSlug = routeParam(request.params.tenantSlug);
        const tenant = await tenantService.findBySlug(tenantSlug);
        if (!tenant) {
          throw new Error('Organization not found');
        }
        const settings = await tenantService.getSettings(tenant.id);
        const saml = settings.sso.saml;
        if (!saml.enabled || !saml.idpUrl || !saml.cert) {
          throw new Error('SAML is not configured for this organization');
        }
        const apiUrl = config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
        const prefix = config.get<string>('API_PREFIX', 'api/v1');
        callback(null, {
          entryPoint: saml.idpUrl,
          idpCert: saml.cert.replace(/\\n/g, '\n'),
          issuer: config.get<string>('SAML_ISSUER', 'weaver'),
          callbackUrl: `${apiUrl}/${prefix}/auth/saml/${tenant.slug}/callback`,
          validateInResponseTo: ValidateInResponseTo.always,
          requestIdExpirationPeriodMs: SAML_REQUEST_TTL_MS,
          cacheProvider: requests.forTenant(tenant.id),
          wantAssertionsSigned: true,
          wantAuthnResponseSigned: true,
        });
      })().catch((error: Error) => callback(error));
    };

    const verify = (request: Request, profile: Profile | null, done: VerifiedCallback) => {
      try {
        if (!profile) {
          throw new UnauthorizedException('SAML did not return a profile');
        }
        const rawEmail =
          profile.email ?? profile.mail ?? profile['urn:oid:0.9.2342.19200300.100.1.3'];
        const email = typeof rawEmail === 'string' ? rawEmail : undefined;
        if (!email) {
          throw new UnauthorizedException('SAML did not return an email address');
        }
        const rawName = profile.displayName ?? profile.cn ?? profile.nameID;
        const identity: OAuthIdentity = {
          provider: 'saml',
          email,
          displayName: typeof rawName === 'string' ? rawName : email,
          avatarUrl: null,
          tenantSlug: routeParam(request.params.tenantSlug),
        };
        done(null, identity as unknown as Record<string, unknown>);
      } catch (error) {
        done(error as Error);
      }
    };

    const verifyLogout = (_request: Request, profile: Profile | null, done: VerifiedCallback) =>
      done(null, (profile ?? {}) as Record<string, unknown>);

    super({ passReqToCallback: true, getSamlOptions }, verify, verifyLogout);
  }
}
