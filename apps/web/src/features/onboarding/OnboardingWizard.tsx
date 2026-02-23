import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Check } from 'lucide-react';
import { useCreateProject, useCreateIssue, useProjects } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'weaver-onboarding-complete';
const TOTAL_STEPS = 4;

interface OnboardingWizardProps {
  orgName?: string;
}

export function OnboardingWizard({ orgName = 'your organization' }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { data: projectsData } = useProjects();
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [issueSummary, setIssueSummary] = useState('');
  const [createdProjectKey, setCreatedProjectKey] = useState('');
  const createIssue = useCreateIssue(createdProjectKey);

  const isComplete = localStorage.getItem(STORAGE_KEY) === 'true';

  if (isComplete) {
    return null;
  }

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    navigate('/projects');
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectName || !projectKey) return;
    try {
      await createProject.mutateAsync({
        name: projectName,
        key: projectKey.toUpperCase(),
        description: '',
      });
      setCreatedProjectKey(projectKey.toUpperCase());
      setStep(3);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleCreateIssue = async (e: FormEvent) => {
    e.preventDefault();
    if (!issueSummary || !createdProjectKey) return;
    try {
      await createIssue.mutateAsync({
        summary: issueSummary,
        priority: 'medium',
        labels: [],
        customFields: {},
        percentDone: 0,
      });
      setStep(4);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleExploreBoard = () => {
    handleComplete();
    navigate(`/projects/${createdProjectKey}/board`);
  };

  // If user already has projects, skip onboarding
  if (projectsData?.data && projectsData.data.length > 0 && step === 1) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="mx-4 w-full max-w-lg rounded-xl shadow-2xl">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                i + 1 <= step ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>

        <CardContent className="p-6">
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">Welcome to Weaver</h2>
              <p className="mb-6 text-muted-foreground">
                Welcome to {orgName}! Let us help you set up your first project so you can
                start tracking work right away.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleSkip}>
                  Skip Setup
                </Button>
                <Button onClick={() => setStep(2)}>
                  Get Started
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Create Project */}
          {step === 2 && (
            <div>
              <h2 className="mb-2 text-xl font-bold text-foreground">Create Your First Project</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Projects help you organize related issues and track progress.
              </p>

              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <Label htmlFor="onb-project-name">Project Name</Label>
                  <Input
                    id="onb-project-name"
                    type="text"
                    required
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      if (!projectKey) {
                        const autoKey = e.target.value
                          .replace(/[^a-zA-Z]/g, '')
                          .slice(0, 4)
                          .toUpperCase();
                        setProjectKey(autoKey);
                      }
                    }}
                    placeholder="e.g., My First Project"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="onb-project-key">Project Key</Label>
                  <Input
                    id="onb-project-key"
                    type="text"
                    required
                    maxLength={6}
                    value={projectKey}
                    onChange={(e) =>
                      setProjectKey(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())
                    }
                    placeholder="e.g., MFP"
                    className="mt-1 uppercase"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    A short unique identifier for your project (letters only).
                  </p>
                </div>

                {createProject.isError && (
                  <p className="text-sm text-red-600">
                    Failed to create project. The key may already be in use.
                  </p>
                )}

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={createProject.isPending}>
                    {createProject.isPending ? 'Creating...' : 'Create Project'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Create Issue */}
          {step === 3 && (
            <div>
              <h2 className="mb-2 text-xl font-bold text-foreground">Create Your First Issue</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Issues are units of work. They can be tasks, bugs, stories, or anything you
                need to track.
              </p>

              <form onSubmit={handleCreateIssue} className="space-y-4">
                <div>
                  <Label htmlFor="onb-issue-summary">Issue Summary</Label>
                  <Input
                    id="onb-issue-summary"
                    type="text"
                    required
                    value={issueSummary}
                    onChange={(e) => setIssueSummary(e.target.value)}
                    placeholder="e.g., Set up project documentation"
                    className="mt-1"
                  />
                </div>

                {createIssue.isError && (
                  <p className="text-sm text-red-600">Failed to create issue.</p>
                )}

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={createIssue.isPending}>
                    {createIssue.isPending ? 'Creating...' : 'Create Issue'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Step 4: Explore Board */}
          {step === 4 && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">You are All Set!</h2>
              <p className="mb-6 text-muted-foreground">
                Your project <strong>{createdProjectKey}</strong> is ready. Explore the board
                view to see your issues organized in columns by status.
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    handleComplete();
                    navigate('/projects');
                  }}
                >
                  Go to Projects
                </Button>
                <Button onClick={handleExploreBoard}>
                  Explore Board View
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        {/* Skip link at bottom */}
        {step < 4 && (
          <div className="border-t border-border px-6 py-3 text-center">
            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip onboarding
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
