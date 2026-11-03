/** Client idempotency keys; kept stable across retries of one logical send. */
export const randomUUID = () => crypto.randomUUID();
