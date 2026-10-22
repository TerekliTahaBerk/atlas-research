import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3102';
// Only this disposable local Auth harness is permitted; no hosted credentials.
const password = 'Atlas-disposable-test-password-42';
async function mailLink(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = z
          .object({
            messages: z.array(
              z.object({
                ID: z.string(),
                Subject: z.string(),
                To: z.array(z.object({ Address: z.string() })),
              }),
            ),
          })
          .parse(
            await (
              await request.get('http://127.0.0.1:8025/api/v1/messages')
            ).json(),
          );
        const item = list.messages.find(
          (m) =>
            m.To.some((t) => t.Address === email) &&
            m.Subject.toLowerCase().includes(subject),
        );
        if (!item) return false;
        const mail = z
          .object({ Text: z.string(), HTML: z.string() })
          .parse(
            await (
              await request.get(
                `http://127.0.0.1:8025/api/v1/message/${item.ID}`,
              )
            ).json(),
          );
        link = (mail.Text + ' ' + mail.HTML)
          .replaceAll('&amp;', '&')
          .match(
            /http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^\s<>"']+/,
          )?.[0];
        return !!link;
      },
      {
        timeout: 20000,
        message: 'Expected an actual email from the local Auth server',
      },
    )
    .toBe(true);
  return link!;
}
async function register(page: Page) {
  const email = `researcher-${randomUUID()}@atlas.example`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Test researcher');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  expect(
    await page
      .getByLabel('Password', { exact: true })
      .evaluate((input) => (input as HTMLInputElement).validity.tooShort),
  ).toBe(true);
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'check your inbox',
  );
  const link = await mailLink(page.request, email, 'confirm');
  try {
    await page.goto(link);
  } catch {
    throw new Error('Local email confirmation navigation failed.');
  }
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Display name').fill('Test researcher');
  await page.getByRole('link', { name: 'Skip', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\/[0-9a-f-]+$/);
  return email;
}
async function login(page: Page, email: string, newPassword = password) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/home$/);
}
async function command(context: BrowserContext, body: unknown) {
  return context.request.post(`${origin}/api/v1/commands`, {
    headers: { Origin: origin },
    data: body,
  });
}
const resultSchema = z.object({
  data: z.object({
    id: z.string().optional(),
    invitationLink: z.string().optional(),
  }),
  requestId: z.string(),
});
async function state(page: Page) {
  return z
    .object({
      data: z.object({
        profile: z.object({ id: z.string() }),
        organizations: z.array(z.object({ id: z.string() })),
        workspaces: z.array(
          z.object({ id: z.string(), organizationId: z.string() }),
        ),
        projects: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    })
    .parse(await (await page.request.get('/api/v1/me')).json()).data;
}
test('independent researcher registers, verifies, creates, renames, logs out and returns to persisted data', async ({
  page,
}) => {
  const email = await register(page);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Project name').fill('Persistent research');
  await dialog
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]+\/overview$/);
  await page.getByLabel('Project name').fill('Renamed research');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Renamed research' }),
  ).toBeVisible();
  const projectUrl = page.url();
  await expect
    .poll(async () =>
      (await page.context().cookies())
        .find((cookie) => cookie.name === 'atlas-navigation')
        ?.value.includes('projectId'),
    )
    .toBe(true);
  await page.goto('/app/home');
  await expect(
    page.getByRole('heading', { name: 'Continue working', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Continue working', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(projectUrl);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  // Hold the destination document to reproduce a slow first page load after
  // successful authentication. Playwright cannot query the outgoing document
  // while its replacement is pending, so record what the user and assistive
  // technology perceive at the exact moment navigation starts (the Navigation
  // API dispatches `navigate` synchronously from location.assign).
  const atNavigation: { status: string; waiting: boolean }[] = [];
  await page.exposeBinding(
    'atlasNavigationProbe',
    (_source, snapshot: { status: string; waiting: boolean }) => {
      atNavigation.push(snapshot);
    },
  );
  await page.evaluate(() => {
    const probe = (
      window as unknown as {
        atlasNavigationProbe: (s: { status: string; waiting: boolean }) => void;
      }
    ).atlasNavigationProbe;
    (
      window as unknown as { navigation: EventTarget }
    ).navigation.addEventListener('navigate', () => {
      const submit = Array.from(
        document.querySelectorAll<HTMLButtonElement>('main button'),
      ).find((button) => button.textContent?.trim() === 'Please wait…');
      probe({
        status:
          document.querySelector('main [role="status"]')?.textContent ?? '',
        waiting: submit?.disabled === true,
      });
    });
  });
  let releaseNavigation!: () => void;
  const navigationGate = new Promise<void>((resolve) => {
    releaseNavigation = resolve;
  });
  const destinationRequest = page.waitForRequest(
    (request) => request.isNavigationRequest() && request.url() === projectUrl,
  );
  await page.route(projectUrl, async (route) => {
    await navigationGate;
    await route.continue();
  });
  const signingIn = page
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  try {
    await destinationRequest;
    await expect
      .poll(() => atNavigation, {
        message:
          'Successful sign-in feedback must be committed before navigation',
      })
      .toContainEqual({
        status: expect.stringContaining('Signed in. Opening your research'),
        waiting: true,
      });
  } finally {
    releaseNavigation();
    await signingIn;
    await page.unroute(projectUrl);
  }
  await expect(page).toHaveURL(projectUrl);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Renamed research' }),
  ).toBeVisible();
  const errors = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(errors.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Workspace navigation' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
});
test('laboratory collaboration enforces invitation identity, private grants, role changes, revocation and last owners', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const collaboratorContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const collaborator = await collaboratorContext.newPage();
  try {
    await register(owner);
    const collaboratorEmail = await register(collaborator);
    const before = await state(collaborator);
    const orgResponse = await command(ownerContext, {
      command: 'organization.create',
      name: 'Collaboration Lab',
    });
    expect(orgResponse.ok()).toBe(true);
    const org = resultSchema.parse(await orgResponse.json()).data.id!;
    const wsResponse = await command(ownerContext, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Shared lab workspace',
    });
    expect(wsResponse.ok()).toBe(true);
    const ws = resultSchema.parse(await wsResponse.json()).data.id!;
    const pResponse = await command(ownerContext, {
      command: 'project.create',
      workspaceId: ws,
      name: 'Private lab study',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    });
    expect(pResponse.ok()).toBe(true);
    const project = resultSchema.parse(await pResponse.json()).data.id!;
    const denied = await collaboratorContext.request.get(
      `${origin}/api/v1/projects/${project}`,
    );
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain('Private lab study');
    const forgedPreference = await collaboratorContext.request.post(
      `${origin}/api/v1/context`,
      {
        headers: { Origin: origin },
        data: { workspaceId: ws, projectId: project },
      },
    );
    expect(forgedPreference.status()).toBe(404);
    const pageDenied = await collaborator.goto(
      `/app/projects/${project}/overview`,
    );
    expect(pageDenied?.status()).toBe(404);
    await expect(
      collaborator.getByText('Private lab study', { exact: true }),
    ).toHaveCount(0);
    const crossTenant = await command(collaboratorContext, {
      command: 'project.update',
      id: project,
      name: 'Attack',
      visibility: 'WORKSPACE',
      expectedVersion: 1,
    });
    expect(crossTenant.status()).toBe(404);
    const inviteResponse = await command(ownerContext, {
      command: 'invitation.create',
      scope: 'project',
      scopeId: project,
      email: collaboratorEmail,
      role: 'VIEWER',
    });
    expect(inviteResponse.ok()).toBe(true);
    const invite = resultSchema.parse(await inviteResponse.json()).data
      .invitationLink!;
    try {
      await collaborator.goto(invite);
    } catch {
      throw new Error('Local invitation navigation failed.');
    }
    await collaborator
      .getByRole('button', { name: 'Accept invitation' })
      .click();
    await expect(collaborator).toHaveURL(
      new RegExp(`/projects/${project}/overview$`),
    );
    await expect(
      collaborator.getByRole('heading', {
        level: 1,
        name: 'Private lab study',
      }),
    ).toBeVisible();
    await expect(
      collaborator.getByRole('button', { name: 'Save project' }),
    ).toHaveCount(0);
    const update = await command(ownerContext, {
      command: 'membership.set',
      scope: 'project',
      scopeId: project,
      profileId: before.profile.id,
      role: 'EDITOR',
      expectedVersion: 1,
    });
    expect(update.ok()).toBe(true);
    // Editors gain project.write, without owner metadata/membership powers.
    const roleData = z
      .object({ data: z.object({ capabilities: z.array(z.string()) }) })
      .parse(
        await (
          await collaboratorContext.request.get(
            `${origin}/api/v1/projects/${project}`,
          )
        ).json(),
      );
    expect(roleData.data.capabilities).toContain('project.write');
    expect(roleData.data.capabilities).not.toContain('project.members.manage');
    const ownerState = await state(owner);
    const lastOwner = await command(ownerContext, {
      command: 'membership.remove',
      scope: 'project',
      scopeId: project,
      profileId: ownerState.profile.id,
      expectedVersion: 1,
    });
    expect(lastOwner.status()).toBe(409);
    expect(
      (
        await command(ownerContext, {
          command: 'membership.set',
          scope: 'project',
          scopeId: project,
          profileId: before.profile.id,
          role: 'OWNER',
          expectedVersion: 2,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await command(ownerContext, {
          command: 'membership.remove',
          scope: 'project',
          scopeId: project,
          profileId: ownerState.profile.id,
          expectedVersion: 1,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await ownerContext.request.get(`${origin}/api/v1/projects/${project}`)
      ).status(),
    ).toBe(404);
    // Switch between two organizations via the real sidebar context selector.
    await collaborator.goto(`/app/workspaces/${ws}`);
    await expect(
      collaborator.getByRole('heading', {
        level: 1,
        name: 'Shared lab workspace',
      }),
    ).toBeVisible();
    await collaborator
      .getByRole('button', { name: 'Workspace: Shared lab workspace' })
      .click();
    await collaborator
      .getByRole('menuitem', { name: 'My Research', exact: true })
      .click();
    await expect(
      collaborator.getByRole('heading', { level: 1, name: 'My Research' }),
    ).toBeVisible();
    await expect(
      collaborator.getByText('Private lab study', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await collaboratorContext.close();
  }
});
test('password recovery uses an actual captured email and rejects expired callbacks', async ({
  page,
}) => {
  const email = await register(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/reset-password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'eligible',
  );
  const link = await mailLink(page.request, email, 'reset');
  try {
    await page.goto(link);
  } catch {
    throw new Error('Local recovery navigation failed.');
  }
  await expect(page).toHaveURL(/\/update-password$/);
  const nextPassword = password + '-updated';
  await page.getByLabel('Password', { exact: true }).fill(nextPassword);
  await page.getByLabel('Confirm password').fill(nextPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/login\?password=updated$/);
  await login(page, email, nextPassword);
  await page.goto('/auth/callback?code=expired-test-code');
  await expect(page).toHaveURL(/\/login\?auth=expired$/);
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'invalid, expired or cancelled',
  );
});
