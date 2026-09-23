import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { TenantService } from '../tenant';

@Injectable()
export class SamlAuthGuard extends AuthGuard('saml') {
  constructor(private readonly tenantService: TenantService) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const rawSlug = request.params.tenantSlug;
    const tenantSlug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new ForbiddenException('Organization not found');
    }
    const settings = await this.tenantService.getSettings(tenant.id);
    if (!settings.sso.saml.enabled) {
      throw new ForbiddenException('SAML is not enabled for this organization');
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}
