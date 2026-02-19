import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject, useCreateIssue, useProjects } from '@/api';

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
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i + 1 <= step ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="p-6">
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <svg
                  className="h-8 w-8 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">Welcome to Weaver</h2>
              <p className="mb-6 text-gray-600">
                Welcome to {orgName}! Let us help you set up your first project so you can
                start tracking work right away.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleSkip}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Skip Setup
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Get Started
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Create Project */}
          {step === 2 && (
            <div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">Create Your First Project</h2>
              <p className="mb-6 text-sm text-gray-600">
                Projects help you organize related issues and track progress.
              </p>

              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label
                    htmlFor="onb-project-name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Project Name
                  </label>
                  <input
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
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onb-project-key"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Project Key
                  </label>
                  <input
                    id="onb-project-key"
                    type="text"
                    required
                    maxLength={6}
                    value={projectKey}
                    onChange={(e) =>
                      setProjectKey(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())
                    }
                    placeholder="e.g., MFP"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    A short unique identifier for your project (letters only).
                  </p>
                </div>

                {createProject.isError && (
                  <p className="text-sm text-red-600">
                    Failed to create project. The key may already be in use.
                  </p>
                )}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={createProject.isPending}
                    className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {createProject.isPending ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Create Issue */}
          {step === 3 && (
            <div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">Create Your First Issue</h2>
              <p className="mb-6 text-sm text-gray-600">
                Issues are units of work. They can be tasks, bugs, stories, or anything you
                need to track.
              </p>

              <form onSubmit={handleCreateIssue} className="space-y-4">
                <div>
                  <label
                    htmlFor="onb-issue-summary"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Issue Summary
                  </label>
                  <input
                    id="onb-issue-summary"
                    type="text"
                    required
                    value={issueSummary}
                    onChange={(e) => setIssueSummary(e.target.value)}
                    placeholder="e.g., Set up project documentation"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {createIssue.isError && (
                  <p className="text-sm text-red-600">Failed to create issue.</p>
                )}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={createIssue.isPending}
                    className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {createIssue.isPending ? 'Creating...' : 'Create Issue'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 4: Explore Board */}
          {step === 4 && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">You are All Set!</h2>
              <p className="mb-6 text-gray-600">
                Your project <strong>{createdProjectKey}</strong> is ready. Explore the board
                view to see your issues organized in columns by status.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    handleComplete();
                    navigate('/projects');
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Go to Projects
                </button>
                <button
                  onClick={handleExploreBoard}
                  className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Explore Board View
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Skip link at bottom */}
        {step < 4 && (
          <div className="border-t border-gray-100 px-6 py-3 text-center">
            <button
              onClick={handleSkip}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Skip onboarding
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
