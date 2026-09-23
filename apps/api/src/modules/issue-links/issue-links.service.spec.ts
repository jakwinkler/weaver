import { BadRequestException } from '@nestjs/common';
import { IssueLinksService } from './issue-links.service';

describe('IssueLinksService', () => {
  it('rejects links from an issue to itself', async () => {
    const service = new IssueLinksService({} as never);

    await expect(service.create({
      linkType: 'relates-to',
      sourceIssueId: 'issue-a',
      targetIssueId: 'issue-a',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
