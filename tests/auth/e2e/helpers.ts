import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
export const origin = 'http://127.0.0.1:3102';
// Only this disposable local Auth harness is permitted; no hosted credentials.
export const password = 'Atlas-disposable-test-password-42';
export async function mailLink(
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
export async function register(page: Page) {
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
export async function login(page: Page, email: string, newPassword = password) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/home$/);
}
