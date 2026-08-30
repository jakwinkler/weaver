import { filterSelectedProjects, selectIssueKey } from '../import-orchestrator.service';

describe('Jira import project selection', () => {
  const projects = [
    { id: '1', key: 'ONE', name: 'One' },
    { id: '2', key: 'TWO', name: 'Two' },
    { id: '3', key: 'THREE', name: 'Three' },
  ];

  it('imports every accessible project when no selection is supplied', () => {
    expect(filterSelectedProjects(projects)).toEqual(projects);
  });

  it('imports only explicitly selected projects and skips all others', () => {
    expect(filterSelectedProjects(projects, ['THREE', 'ONE'])).toEqual([projects[0], projects[2]]);
  });

  it('rejects selected project keys that are not accessible', () => {
    expect(() => filterSelectedProjects(projects, ['ONE', 'MISSING'])).toThrow(
      'Selected Jira projects are not accessible: MISSING',
    );
  });
});

describe('Jira issue key preservation', () => {
  it('preserves the Jira key when it belongs to the project and is available', () => {
    expect(selectIssueKey('PROJ-42', 'PROJ', 10, new Set())).toEqual({
      key: 'PROJ-42',
      nextCounter: 42,
      preserved: true,
    });
  });

  it('generates the next available project key when the Jira key conflicts', () => {
    expect(selectIssueKey('PROJ-42', 'PROJ', 42, new Set(['PROJ-42', 'PROJ-43']))).toEqual({
      key: 'PROJ-44',
      nextCounter: 44,
      preserved: false,
    });
  });

  it('generates a local project key when the Jira key prefix changed', () => {
    expect(selectIssueKey('OLD-7', 'NEW', 3, new Set())).toEqual({
      key: 'NEW-4',
      nextCounter: 4,
      preserved: false,
    });
  });
});
