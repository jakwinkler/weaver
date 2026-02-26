import { useState, useEffect, useCallback } from 'react';

export interface IssueRelation {
  id: string;
  linkType: string;
  direction: 'outward' | 'inward';
  label: string;
  relatedIssue: {
    key: string;
    summary: string;
    projectKey: string;
    projectName: string;
    statusName: string | null;
    statusCategory: string | null;
  };
}

export interface SearchResult {
  key: string;
  summary: string;
  projectKey: string;
  statusName: string | null;
  statusCategory: string | null;
}

export interface RelationsApi {
  list(): Promise<IssueRelation[]>;
  add(targetIssueKey: string, linkType: string): Promise<unknown>;
  remove(linkId: string): Promise<void>;
  search(q: string): Promise<SearchResult[]>;
}

export function useRelations(api: RelationsApi) {
  const [relations, setRelations] = useState<IssueRelation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRelations = useCallback(async () => {
    try {
      const data = await api.list();
      setRelations(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  const addRelation = async (targetIssueKey: string, linkType: string) => {
    await api.add(targetIssueKey, linkType);
    await fetchRelations();
  };

  const removeRelation = async (linkId: string) => {
    setRelations((prev) => prev.filter((r) => r.id !== linkId));
    try {
      await api.remove(linkId);
    } catch {
      await fetchRelations();
    }
  };

  // Group relations by label
  const grouped = relations.reduce<Record<string, IssueRelation[]>>((acc, rel) => {
    if (!acc[rel.label]) acc[rel.label] = [];
    acc[rel.label].push(rel);
    return acc;
  }, {});

  return {
    relations,
    grouped,
    loading,
    addRelation,
    removeRelation,
    searchIssues: api.search,
    refetch: fetchRelations,
  };
}
