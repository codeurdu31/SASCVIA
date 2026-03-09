/**
 * Envoi d'email via l'API Gmail en utilisant le token OAuth Google.
 * Le token provient de Supabase Auth (provider_token).
 * Supporte les pieces jointes (PDF, etc.).
 */

/** Convertit un ArrayBuffer en base64 standard. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Encode une string UTF-8 en base64. */
function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/** Encode base64 en base64url (pour Gmail API). */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
}

/**
 * Construit un email RFC 2822 avec ou sans piece jointe, encode en base64url.
 */
function buildRawEmail(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachment?: EmailAttachment,
): string {
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;

  if (!attachment) {
    // Email simple sans PJ
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      utf8ToBase64(body),
    ];
    return toBase64Url(utf8ToBase64(lines.join("\r\n")));
  }

  // Email multipart avec PJ
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const attachmentB64 = arrayBufferToBase64(attachment.data);

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    utf8ToBase64(body),
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    attachmentB64,
    `--${boundary}--`,
  ];

  return toBase64Url(utf8ToBase64(lines.join("\r\n")));
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Envoie un email via Gmail API, avec piece jointe optionnelle.
 */
export async function sendGmailEmail(
  providerToken: string,
  fromEmail: string,
  toEmail: string,
  subject: string,
  body: string,
  attachment?: EmailAttachment,
): Promise<SendEmailResult> {
  const raw = buildRawEmail(fromEmail, toEmail, subject, body, attachment);

  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message ?? `Erreur HTTP ${res.status}`;

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: "Permission Gmail manquante. Deconnecte-toi puis reconnecte-toi pour autoriser l'envoi d'emails.",
        };
      }

      return { success: false, error: msg };
    }

    const data = await res.json();
    return { success: true, messageId: data.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur reseau.",
    };
  }
}
