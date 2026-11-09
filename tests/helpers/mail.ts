import { SMTPServer } from "smtp-server";

export async function startMailServer() {
  const messages: Array<{ recipients: string[]; text: string }> = [];
  const server = new SMTPServer({
    authOptional: true, disabledCommands: ["AUTH", "STARTTLS"], logger: false,
    onData(stream, session, callback) {
      let text = "";
      stream.on("data", chunk => { text += chunk.toString(); });
      stream.on("end", () => {
        text = text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)));
        messages.push({ recipients: session.envelope.rcptTo.map(r => r.address), text });
        callback();
      });
    },
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.server.address();
  if (!address || typeof address === "string") throw new Error("SMTP fixture failed to bind");
  return {
    port: address.port, messages,
    latest(to: string, subject: string) {
      const message = messages.findLast(m => m.recipients.includes(to) && m.text.includes(subject));
      if (!message) throw new Error("Expected controlled SMTP delivery missing");
      const url = message.text.match(/https?:\/\/[^\s<>]+/g)?.at(-1);
      if (!url) throw new Error("Expected delivery link missing");
      return new URL(url);
    },
    async close() { await new Promise<void>(resolve => server.close(resolve)); },
  };
}
