import { useHasPermission } from '@/api';

export function IssueHelp() {
  const canCreate = useHasPermission('issues.create');
  const canComment = useHasPermission('comments.create');
  const canAttach = useHasPermission('issues.update');

  return (
    <details className="text-sm">
      <summary className="w-fit cursor-pointer rounded-sm py-2 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        How to create and discuss issues
      </summary>
      <div className="max-w-prose space-y-3 pb-3 text-muted-foreground">
        {canCreate && (
          <p>
            <strong className="font-medium text-foreground">Create a request.</strong> Choose{' '}
            <strong>Create Issue</strong>, give it a short Summary, and add the details in
            Description. Tell the team what happened and what you would like them to do. The fields
            under More options can be left as they are.
          </p>
        )}
        {canComment && (
          <p>
            <strong className="font-medium text-foreground">Keep the conversation together.</strong>{' '}
            Open an issue, write in <strong>Add a comment...</strong>, then choose{' '}
            <strong>Comment</strong>. Type @ and choose a name to get someone's attention.
          </p>
        )}
        <p>
          Open <strong>Attachments</strong> on an issue to see its files.
          {canAttach && ' Use browse or drop a file there to share a screenshot or document.'}
        </p>
        {!canCreate && !canComment && !canAttach && (
          <p>You have read-only access. Ask your team if you need to create issues or reply.</p>
        )}
      </div>
    </details>
  );
}
