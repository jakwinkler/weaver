import { Link } from 'react-router-dom';
import { ArrowUpRight, Inbox } from 'lucide-react';
import { useFormSubmissions } from '@/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function SubmissionsList({ projectKey, formId }: { projectKey: string; formId: string }) {
  const { data: submissions, isLoading, isError } = useFormSubmissions(projectKey, formId);

  if (isLoading) {
    return <p className="py-6 text-sm text-muted-foreground">Loading recent submissions...</p>;
  }

  if (isError) {
    return (
      <p className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        Recent submissions could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  if (!submissions?.length) {
    return (
      <div className="border border-dashed border-border px-6 py-8 text-center">
        <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium text-foreground">No submissions yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          New issues created through this form will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issue</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell className="font-medium tabular-nums">{submission.issueKey}</TableCell>
              <TableCell className="text-muted-foreground">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(submission.submittedAt))}
              </TableCell>
              <TableCell>
                <Link
                  to={`/issues/${submission.issueKey}`}
                  className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open ${submission.issueKey}`}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
