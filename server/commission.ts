import {
  ANSWER_MAX_CHARS, COMMISSION_FIELDS, MOODBOARD_MAX_BYTES,
  type CommissionFieldId,
} from '../src/lib/commissionFields'

/**
 * A commission enquiry, from the public form to the client's inbox.
 *
 * The one unauthenticated write on this Worker. Everything else here is the owner
 * with a session cookie; this is a stranger with a 10MB file, so it is read
 * defensively: every field length-capped, the file size-capped, the whole thing
 * rate-limited by the caller before it gets here.
 *
 * The questions come from `src/lib/commissionFields` — the same module the form
 * renders from. That import crosses from `server/` into `src/`, which nothing else
 * here does, and it earns it: the email is a list of question/answer pairs, and a
 * second copy of the questions in this file would be a second copy to keep in
 * step with the form. The module is deliberately free of React and of Vite's
 * `import.meta.env` so it can be imported from both sides.
 */

/** Delivery is not the site's own domain — see `commissionFrom`. */
export type CommissionEnv = {
  RESEND_API_KEY?: string
  COMMISSION_TO?: string
  COMMISSION_FROM?: string
}

export type Enquiry = {
  answers: { label: string; answer: string }[]
  /** The enquirer's own address, when one can be found in their contact answer. */
  replyTo: string | null
  name: string
  file: { name: string; type: string; bytes: ArrayBuffer }
}

export type ParseFailure = { error: string; status: 400 | 413 }

/**
 * A filename safe to put in a MIME header: no quotes, no newlines, no path.
 *
 * The uploader chooses this string, and it travels into an email header. A
 * `"`, a `\r\n` or a `../` in there is header injection or a path escape.
 */
function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const clean = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120)
  return clean || 'moodboard'
}

/**
 * The first email address in the contact answer, or null.
 *
 * The client's field is deliberately freeform — "Contact Information (Include
 * Preferred)" — so this is a convenience, not a validation: finding an address
 * makes the notification replyable in one click, and not finding one is fine
 * because the answer itself is in the body regardless. Never rejects on it.
 */
function findReplyTo(contact: string): string | null {
  const match = contact.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  if (!match) return null
  // A header value, so the same injection rule as the filename applies.
  return /[\r\n]/.test(match[0]) ? null : match[0]
}

/**
 * Read the multipart body into an enquiry, or say why not.
 *
 * Validates the same rules the browser does, because the browser's copy is a
 * courtesy: this endpoint is reachable with curl.
 */
export async function parseEnquiry(form: FormData): Promise<Enquiry | ParseFailure> {
  const answers: { label: string; answer: string }[] = []
  const values = {} as Record<CommissionFieldId, string>

  for (const field of COMMISSION_FIELDS) {
    const raw = form.get(field.id)
    if (raw !== null && typeof raw !== 'string') {
      return { error: `${field.label.toUpperCase()} IS NOT TEXT.`, status: 400 }
    }
    const answer = (raw ?? '').trim()
    if (field.required && !answer) {
      return { error: `${field.label.toUpperCase()} IS REQUIRED.`, status: 400 }
    }
    if (answer.length > ANSWER_MAX_CHARS) {
      return { error: `${field.label.toUpperCase()} IS TOO LONG.`, status: 400 }
    }
    values[field.id] = answer
    // Optional questions left blank are dropped rather than emailed as empty
    // headings — the client reads these, and nine of ten answered is a shorter
    // email than nine answers and a blank.
    if (answer) answers.push({ label: field.label, answer })
  }

  const file = form.get('moodboard')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'A MOODBOARD OR STYLE REFERENCE IS REQUIRED.', status: 400 }
  }
  if (file.size > MOODBOARD_MAX_BYTES) {
    return { error: 'THAT FILE IS OVER THE 10 MB LIMIT.', status: 413 }
  }

  return {
    answers,
    replyTo: findReplyTo(values.contact),
    name: values.name,
    file: {
      name: safeFilename(file.name),
      type: file.type || 'application/octet-stream',
      bytes: await file.arrayBuffer(),
    },
  }
}

/** HTML-escape. The answers are attacker-controlled and land in an HTML email. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Base64 for the attachment.
 *
 * Chunked rather than one `String.fromCharCode(...bytes)` spread, which blows the
 * argument limit and throws `RangeError` somewhere around a hundred thousand
 * bytes — well under the 10MB this is built to carry.
 */
function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let ascii = ''
  for (let i = 0; i < view.length; i += 0x8000) {
    ascii += String.fromCharCode(...view.subarray(i, i + 0x8000))
  }
  return btoa(ascii)
}

/**
 * The subject line. The client's name for the enquirer, so the inbox sorts and
 * searches by it, with the newline risk taken out — a subject is a header too.
 */
function subjectFor(name: string): string {
  const clean = name.replace(/[\r\n]+/g, ' ').trim().slice(0, 120)
  return clean ? `Commission inquiry — ${clean}` : 'Commission inquiry'
}

export function enquiryText(enquiry: Enquiry): string {
  const parts = enquiry.answers.map(({ label, answer }) => `${label.toUpperCase()}\n${answer}`)
  parts.push(`MOODBOARD\nAttached: ${enquiry.file.name}`)
  if (enquiry.replyTo) parts.push(`REPLY TO\n${enquiry.replyTo}`)
  return `${parts.join('\n\n')}\n`
}

export function enquiryHtml(enquiry: Enquiry): string {
  const rows = enquiry.answers.map(({ label, answer }) => `
    <tr>
      <td style="padding:14px 0 4px;font:600 12px/1.4 -apple-system,Segoe UI,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${escapeHtml(label)}</td>
    </tr>
    <tr>
      <td style="padding:0 0 10px;font:400 15px/1.55 -apple-system,Segoe UI,sans-serif;color:#111827;white-space:pre-wrap">${escapeHtml(answer)}</td>
    </tr>`).join('')

  return `<!doctype html>
<html><body style="margin:0;background:#f6f7f8;padding:24px">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:24px 28px">
  <tr><td style="font:700 18px/1.3 -apple-system,Segoe UI,sans-serif;color:#111827;padding-bottom:2px">Commission inquiry</td></tr>
  <tr><td style="font:400 13px/1.4 -apple-system,Segoe UI,sans-serif;color:#6b7280;padding-bottom:6px">via severedarchive.com</td></tr>
  ${rows}
  <tr><td style="padding-top:16px;border-top:1px solid #e5e7eb;font:400 13px/1.5 -apple-system,Segoe UI,sans-serif;color:#6b7280">Moodboard attached: ${escapeHtml(enquiry.file.name)}</td></tr>
</table>
</body></html>`
}

/**
 * Who the notification is addressed to and from.
 *
 * `to` is the client. `from` cannot be — Resend will only send from a domain
 * verified in its account, and an unverified `from` is the one failure that looks
 * like a code bug and is not. Both are `[vars]` so changing either is a config
 * edit and not a deploy of new code.
 */
const commissionTo = (env: CommissionEnv): string => env.COMMISSION_TO ?? 'chris@severedarchive.com'
const commissionFrom = (env: CommissionEnv): string =>
  env.COMMISSION_FROM ?? 'Severed Archive <commissions@severedarchive.com>'

export type SendOutcome = { ok: true } | { ok: false; status: 502 | 503; error: string }

/**
 * Hand the enquiry to Resend.
 *
 * Chosen over Cloudflare's own Email Sending because severedarchive.com's zone is
 * not in the account this Worker deploys to, so the binding has no verified sender
 * to use. Resend needs only an API key, which crosses that account boundary.
 *
 * The upstream's own message is never returned to the browser: it can name the
 * account and the sending domain. The caller maps this to something the form can
 * show.
 */
export async function sendEnquiry(env: CommissionEnv, enquiry: Enquiry): Promise<SendOutcome> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, status: 503, error: 'THE FORM IS NOT CONNECTED YET.' }
  }

  const payload = {
    from: commissionFrom(env),
    to: commissionTo(env),
    subject: subjectFor(enquiry.name),
    text: enquiryText(enquiry),
    html: enquiryHtml(enquiry),
    // So a reply goes to the enquirer and not to the sending address.
    ...(enquiry.replyTo ? { reply_to: enquiry.replyTo } : {}),
    attachments: [{
      filename: enquiry.file.name,
      content: base64(enquiry.file.bytes),
      content_type: enquiry.file.type,
    }],
  }

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, status: 502, error: 'COULD NOT SEND THE ENQUIRY. TRY AGAIN SHORTLY.' }
  }

  if (!res.ok) return { ok: false, status: 502, error: 'COULD NOT SEND THE ENQUIRY. TRY AGAIN SHORTLY.' }
  return { ok: true }
}
