import { ADMIN_API } from './adminSession'
import { COMMISSION_FIELDS, type CommissionValues } from './commissionFields'

/**
 * The browser half of the commission enquiry: the post.
 *
 * The questions and the validation live in `./commissionFields`, which the Worker
 * imports as well. This file is the panel's single import — everything from there
 * is re-exported below — so the form never has to know that the split exists.
 */

export * from './commissionFields'

export type CommissionResult = { ok: true } | { ok: false; message: string }

/**
 * The widget's sitekey. Public by design — it ships in the page's HTML, and
 * Turnstile's security is the SECRET half, held by the Worker. Overridable for a
 * deployment that wants its own widget; the default is the live one.
 *
 * `1x00000000000000000000AA` is Cloudflare's always-passes testing key, paired
 * with the always-passes testing secret, for working on the form offline.
 */
export const TURNSTILE_SITE_KEY: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '0x4AAAAAAEapxSlL6JpoKZky'

/**
 * Post the enquiry. Never throws: a rejected fetch is a message on the form, not
 * an unhandled rejection, because the person on the other end of it has just
 * spent ten minutes typing and needs to be told what to do next.
 *
 * `multipart/form-data` rather than JSON because of the moodboard — base64 in a
 * JSON body would inflate a 10MB file by a third for no gain, and the Worker
 * reads it with `request.formData()` either way.
 *
 * No credentials: this is the only public write on the Worker. Sending the admin
 * cookie with it would mean a visitor's enquiry and the owner's session travelling
 * together for no reason.
 *
 * The Turnstile token rides in a HEADER, not in the form body, so the Worker can
 * check it before it reads the 10MB upload. That makes this a non-simple
 * cross-origin request and adds a preflight — see `corsPreflight`, which names
 * the header. Worth one round trip to keep a bot's megabytes unparsed.
 */
export async function submitCommission(
  values: CommissionValues, file: File, token: string,
): Promise<CommissionResult> {
  const body = new FormData()
  for (const field of COMMISSION_FIELDS) body.set(field.id, (values[field.id] ?? '').trim())
  body.set('moodboard', file)

  try {
    const res = await fetch(`${ADMIN_API}/api/commission`, {
      method: 'POST',
      headers: { 'cf-turnstile-response': token },
      body,
    })
    if (res.ok) return { ok: true }
    // The Worker's own wording where it has any, so a rate limit does not read as
    // a server fault. Its body is small and always JSON on a refusal.
    const said = await res.json().catch(() => null) as { error?: unknown } | null
    const message = typeof said?.error === 'string'
      ? said.error
      : `THE FORM WAS REFUSED (${res.status}). TRY AGAIN, OR MAIL CHRIS@SEVEREDARCHIVE.COM.`
    return { ok: false, message }
  } catch {
    return { ok: false, message: 'COULD NOT REACH THE SERVER. CHECK YOUR CONNECTION AND TRY AGAIN.' }
  }
}
