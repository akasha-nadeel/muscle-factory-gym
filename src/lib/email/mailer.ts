export type SendOpts = {
  to: string;
  subject: string;
  html: string;
};

export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export type Mailer = {
  send(opts: SendOpts): Promise<SendResult>;
};
