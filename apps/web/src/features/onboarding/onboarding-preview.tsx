'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Input } from '@atlas/ui/components/input';
import { ThemeControl } from '@/components/theme-control';
const steps = [
  'Welcome',
  'Your role',
  'Research field',
  'Workspace',
  'First project',
  'Collaborators',
  'Ready',
] as const;
export function OnboardingPreview() {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState('');
  const [field, setField] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [project, setProject] = useState('');
  const choose = (
    label: string,
    options: readonly string[],
    value: string,
    onChange: (value: string) => void,
  ) => (
    <fieldset className="onboarding-choices">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label key={option}>
          <input
            type="radio"
            name={label}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>
            {option}
            <Check aria-hidden="true" />
          </span>
        </label>
      ))}
    </fieldset>
  );
  const title = [
    'Make room for discovery.',
    'How do you research?',
    'What draws your curiosity?',
    'A space for your research.',
    'Start with a good question.',
    'Research is better connected.',
    'Your next discovery starts here.',
  ][step];
  return (
    <div className="onboarding-page">
      <header>
        <Link href="/" className="wordmark">
          <Compass aria-hidden="true" />
          <span>ATLAS</span>
        </Link>
        <span className="muted">Onboarding design preview</span>
        <ThemeControl />
      </header>
      <main>
        <p className="step-label">
          Step {step + 1} of {steps.length} · {steps[step]}
        </p>
        <h1>{title}</h1>
        <p className="onboarding-description">
          {
            [
              'A thoughtful home for your papers, ideas, and the work between them. Let’s look around.',
              'Choose the perspective that feels closest. You can change it later.',
              'This helps shape a relevant starting point. Curiosity rarely fits in one box.',
              'Personal research and shared laboratories both start with a workspace.',
              'A project keeps related sources, notes, tasks, and discussions together.',
              'Future invitations will use verified identities and explicit project permissions.',
              'This walkthrough has prepared no real account, workspace, project, or invitation.',
            ][step]
          }
        </p>
        {step === 0 ? (
          <div className="onboarding-intro">
            <Compass aria-hidden="true" />
            <p>
              Read deeply. Think clearly.
              <br />
              Keep the connections.
            </p>
          </div>
        ) : null}
        {step === 1
          ? choose(
              'Research role',
              [
                'Independent researcher',
                'Graduate student',
                'Lab member',
                'Principal investigator',
              ],
              role,
              setRole,
            )
          : null}
        {step === 2
          ? choose(
              'Research field',
              [
                'Computer science',
                'Life sciences',
                'Social sciences',
                'Humanities',
                'Engineering',
                'Interdisciplinary',
              ],
              field,
              setField,
            )
          : null}
        {step === 3 ? (
          <div className="form-stack onboarding-fields">
            <label htmlFor="workspace-name">Workspace name · optional</label>
            <Input
              id="workspace-name"
              value={workspace}
              maxLength={120}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="Your research workspace"
            />
            <p className="muted">A sketch only. No workspace is created.</p>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="form-stack onboarding-fields">
            <label htmlFor="project-name">First project · optional</label>
            <Input
              id="project-name"
              value={project}
              maxLength={120}
              onChange={(e) => setProject(e.target.value)}
              placeholder="What would you like to explore?"
            />
            <p className="muted">Projects will be private by default.</p>
          </div>
        ) : null}
        {step === 5 ? (
          <div className="invitation-preview">
            <h2>Invite when you’re ready.</h2>
            <p>
              Collaborators will get access only to the workspace and projects
              you authorize.
            </p>
            <label htmlFor="invite-preview">
              Invitation service is unavailable
            </label>
            <Input
              id="invite-preview"
              placeholder="Available in Phase 01"
              disabled
            />
            <p>No invitation can be sent from this preview.</p>
          </div>
        ) : null}
        {step === 6 ? (
          <div className="onboarding-summary">
            <h2>Your local sketch</h2>
            <dl>
              <dt>Role</dt>
              <dd>{role || 'Not selected'}</dd>
              <dt>Field</dt>
              <dd>{field || 'Not selected'}</dd>
              <dt>Workspace</dt>
              <dd>{workspace || 'Not named'}</dd>
              <dt>Project</dt>
              <dd>{project || 'Not named'}</dd>
            </dl>
            <Button asChild>
              <Link href="/app/home">
                Explore the sample workspace
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        ) : null}
      </main>
      <footer>
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((prev) => prev - 1)}
        >
          <ArrowLeft data-icon="inline-start" />
          Back
        </Button>
        <div className="onboarding-progress">
          <progress
            max={steps.length}
            value={step + 1}
            aria-label="Onboarding progress"
          />
          <small>Local choices only · discarded when you leave</small>
        </div>
        {step < steps.length - 1 ? (
          <div className="button-row">
            {step > 0 ? (
              <Button
                variant="ghost"
                onClick={() => setStep((prev) => prev + 1)}
              >
                Skip
              </Button>
            ) : null}
            <Button onClick={() => setStep((prev) => prev + 1)}>
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        ) : (
          <Link href="/app/home">Finish preview →</Link>
        )}
      </footer>
    </div>
  );
}
