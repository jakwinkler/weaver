import { ConfigService } from '@nestjs/config';
import { SAML } from '@node-saml/passport-saml';
import { SignedXml } from 'xml-crypto';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { inflateRawSync } from 'zlib';
import { randomUUID, createHash } from 'crypto';
import { SamlStrategy } from '../src/core/auth/saml.strategy';
import { SamlRequestCache } from '../src/core/auth/saml-request-cache';

// Real signed SAML responses with disposable keys and a shared isolated Redis.
describe('SAML request binding across replicas', () => {
  let first: SamlRequestCache;
  let second: SamlRequestCache;
  let privateKey: string;
  let cert: string;
  let directory: string;
  const prefix = `weaver:e2e:saml:${randomUUID()}`;
  const values: Record<string, unknown> = {
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: Number(process.env.REDIS_PORT),
    RATE_LIMIT_PREFIX: prefix,
    API_PUBLIC_URL: 'https://weaver.example',
    API_PREFIX: 'api/v1',
  };
  const config = {
    get: (key: string, fallback: unknown) => values[key] ?? fallback,
  } as ConfigService;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'weaver-saml-fixture-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=weaver-saml-test',
      ],
      { stdio: 'ignore' },
    );
    privateKey = readFileSync(join(directory, 'key.pem'), 'utf8');
    cert = readFileSync(join(directory, 'cert.pem'), 'utf8');
    first = new SamlRequestCache(config);
    second = new SamlRequestCache(config);
    await Promise.all([first.onModuleInit(), second.onModuleInit()]);
  });
  afterAll(async () => {
    await Promise.all([first?.onModuleDestroy(), second?.onModuleDestroy()]);
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  const saml = async (cache: SamlRequestCache, tenant = 'team') => {
    const tenantService = {
      findBySlug: async () => ({ id: tenant, slug: tenant }),
      getSettings: async () => ({
        sso: { saml: { enabled: true, idpUrl: 'https://idp.example/login', cert } },
      }),
    };
    const strategy: any = Reflect.construct(SamlStrategy, [tenantService, config, cache]);
    const options = await new Promise<any>((resolve, reject) =>
      strategy._options.getSamlOptions(
        { params: { tenantSlug: tenant } },
        (error: Error, value: unknown) => (error ? reject(error) : resolve(value)),
      ),
    );
    return new SAML(options);
  };
  const start = async () => {
    const url = await (await saml(first)).getAuthorizeUrlAsync('', {});
    const request = inflateRawSync(
      Buffer.from(new URL(url).searchParams.get('SAMLRequest')!, 'base64'),
    ).toString();
    return request.match(/\bID="([^"]+)"/)![1];
  };
  const response = (id?: string) => {
    const instant = new Date().toISOString();
    const expiry = new Date(Date.now() + 300000).toISOString();
    const binding = id ? ` InResponseTo="${id}"` : '';
    const destination = 'https://weaver.example/api/v1/auth/saml/team/callback';
    let xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_r${randomUUID()}" Version="2.0" IssueInstant="${instant}" Destination="${destination}"${binding}><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">https://idp.example</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a${randomUUID()}" Version="2.0" IssueInstant="${instant}"><saml:Issuer>https://idp.example</saml:Issuer><saml:Subject><saml:NameID>member@example.com</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData${binding} NotOnOrAfter="${expiry}" Recipient="${destination}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${instant}" NotOnOrAfter="${expiry}"><saml:AudienceRestriction><saml:Audience>weaver</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${instant}" SessionIndex="_session"/><saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>member@example.com</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>`;
    for (const element of ['Assertion', 'Response']) {
      const signature = new SignedXml({
        privateKey,
        publicCert: cert,
        signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
        canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
      });
      signature.addReference({
        xpath: `//*[local-name()='${element}']`,
        transforms: [
          'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
          'http://www.w3.org/2001/10/xml-exc-c14n#',
        ],
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      });
      signature.computeSignature(xml, {
        location: {
          reference: `//*[local-name()='${element}']/*[local-name()='Issuer']`,
          action: 'after',
        },
      });
      xml = signature.getSignedXml();
    }
    return { SAMLResponse: Buffer.from(xml).toString('base64') };
  };

  it('accepts a signed reply on a different replica and rejects subsequent replay', async () => {
    const reply = response(await start());
    expect((await (await saml(second)).validatePostResponseAsync(reply)).profile?.email).toBe(
      'member@example.com',
    );
    await expect((await saml(first)).validatePostResponseAsync(reply)).rejects.toThrow(
      'InResponseTo',
    );
  });
  it('accepts exactly one of two concurrent signed callbacks', async () => {
    const reply = response(await start());
    const instances = await Promise.all([saml(first), saml(second)]);
    const results = await Promise.allSettled(
      instances.map((instance) => instance.validatePostResponseAsync(reply)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
  it('rejects unsolicited, unknown, expired, and wrong-tenant request IDs', async () => {
    await expect((await saml(second)).validatePostResponseAsync(response())).rejects.toThrow(
      'InResponseTo',
    );
    await expect(
      (await saml(second)).validatePostResponseAsync(response('_unknown')),
    ).rejects.toThrow('InResponseTo');
    const id = await start();
    await expect(
      (await saml(second, 'other')).validatePostResponseAsync(response(id)),
    ).rejects.toThrow('InResponseTo');
    const key = `${prefix}:saml-request:team:${createHash('sha256').update(id).digest('hex')}`;
    expect(await (first as any).redis.pttl(key)).toBeGreaterThan(590000);
    await (first as any).redis.pexpire(key, 0);
    await expect((await saml(second)).validatePostResponseAsync(response(id))).rejects.toThrow(
      'InResponseTo',
    );
  });
  it('fails closed when request storage is unavailable', async () => {
    const offline = new SamlRequestCache(config);
    await expect(
      saml(offline).then((instance) => instance.getAuthorizeUrlAsync('', {})),
    ).rejects.toThrow('unavailable');
    await offline.onModuleDestroy();
  });
});
