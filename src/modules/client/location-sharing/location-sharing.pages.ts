import { Request, Response } from "express";

/**
 * Tiny redirect pages so share/invite links work from WhatsApp, QR codes,
 * or any browser: /s/<token> → navimind://share/<token>,
 * /f/<token> → navimind://friend-invite/<token>.
 */
function redirectPage(deepLink: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Navimind</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column;
           align-items: center; justify-content: center; min-height: 100vh; margin: 0;
           background: #0b1220; color: #e2e8f0; text-align: center; padding: 24px; }
    a.button { background: #3b82f6; color: white; text-decoration: none; padding: 14px 28px;
               border-radius: 12px; font-weight: 600; margin-top: 16px; display: inline-block; }
    p.hint { color: #94a3b8; font-size: 14px; margin-top: 24px; }
  </style>
</head>
<body>
  <h2>${title}</h2>
  <a class="button" href="${deepLink}">Open in Navimind</a>
  <p class="hint">If nothing happens, install the Navimind app first, then tap the button again.</p>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`;
}

export function sharePage(req: Request, res: Response) {
  const token = encodeURIComponent(req.params.token);
  res
    .type("html")
    .send(redirectPage(`navimind://share/${token}`, "Someone shared their live location"));
}

export function friendInvitePage(req: Request, res: Response) {
  const token = encodeURIComponent(req.params.token);
  res
    .type("html")
    .send(redirectPage(`navimind://friend-invite/${token}`, "Friend request on Navimind"));
}
