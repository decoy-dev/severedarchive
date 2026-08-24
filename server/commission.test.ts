import { describe, it, expect, afterEach, vi } from 'vitest'
import { parseEnquiry, sendEnquiry, enquiryHtml, enquiryText, type Enquiry } from './commission'
import { COMMISSION_FIELDS, MOODBOARD_MAX_BYTES, ANSWER_MAX_CHARS } from '../src/lib/commissionFields'

/** Every required answer filled, so a test can knock out exactly one thing. */
const complete = (): Record<string, string> => {
  const values: Record<string, string> = {}
  for (const field of COMMISSION_FIELDS) {
    if (field.required) values[field.id] = `answer for ${field.id}`
  }
  values.contact = 'best on email, ada@example.com'
  return values
}

const form = (values: Record<string, string>, file: File | null = new File(['xxx'], 'board.png', { type: 'image/png' })): FormData => {
  const body = new FormData()
  for (const [k, v] of Object.entries(values)) body.set(k, v)
  if (file) body.set('moodboard', file)
  return body
}

const enquiry = async (values = complete(), file?: File | null): Promise<Enquiry> => {
  const parsed = await parseEnquiry(form(values, file === undefined ? undefined : file))
  if ('error' in parsed) throw new Error(`expected a valid enquiry, got ${parsed.error}`)
  return parsed
}

describe('parseEnquiry', () => {
  it('accepts a complete enquiry and keeps the answers in field order', async () => {
    const parsed = await enquiry()
    expect(parsed.answers.map((a) => a.label)).toEqual(
      COMMISSION_FIELDS.filter((f) => f.required).map((f) => f.label),
    )
  })

  it('names the missing field, so the form can say which one', async () => {
    const values = complete()
    delete values.brief
    const parsed = await parseEnquiry(form(values))
    expect(parsed).toEqual({ error: 'PROJECT BRIEF IS REQUIRED.', status: 400 })
  })

  it('treats whitespace as unanswered', async () => {
    const parsed = await parseEnquiry(form({ ...complete(), timeline: '   \n  ' }))
    expect(parsed).toMatchObject({ status: 400 })
  })

  it('drops optional questions that were left blank rather than emailing a blank heading', async () => {
    const parsed = await enquiry({ ...complete(), goal: '', extra: 'ping me on weekends' })
    const labels = parsed.answers.map((a) => a.label)
    expect(labels).not.toContain('What is the overall goal of this project?')
    expect(labels).toContain('Share any extra details or specifications:')
  })

  it('refuses a file over the limit with 413, not a generic 400', async () => {
    // 413 so the form can say "too big" rather than "something was wrong".
    const big = new File([new Uint8Array(MOODBOARD_MAX_BYTES + 1)], 'huge.png', { type: 'image/png' })
    expect(await parseEnquiry(form(complete(), big))).toMatchObject({ status: 413 })
  })

  it('requires a moodboard, and does not count an empty one', async () => {
    expect(await parseEnquiry(form(complete(), null))).toMatchObject({ status: 400 })
    expect(await parseEnquiry(form(complete(), new File([], 'empty.png')))).toMatchObject({ status: 400 })
  })

  it('refuses an answer longer than the cap', async () => {
    const parsed = await parseEnquiry(form({ ...complete(), brief: 'x'.repeat(ANSWER_MAX_CHARS + 1) }))
    expect(parsed).toMatchObject({ status: 400 })
  })

  it('strips the path and the quotes out of the filename', async () => {
    // The uploader picks this string and it lands in a MIME header. A quote or a
    // CRLF in there is header injection; a `../` is a path escape.
    const nasty = new File(['x'], '../../etc/pa"ssw\r\nd.png', { type: 'image/png' })
    const parsed = await enquiry(complete(), nasty)
    expect(parsed.file.name).not.toMatch(/["\r\n]/)
    expect(parsed.file.name).not.toContain('..')
    expect(parsed.file.name).not.toContain('/')
  })

  it('never ends up with an empty filename', async () => {
    const parsed = await enquiry(complete(), new File(['x'], '...', { type: 'image/png' }))
    expect(parsed.file.name).toBe('moodboard')
  })

  it('falls back to a generic type when the browser sends none', async () => {
    const parsed = await enquiry(complete(), new File(['x'], 'board.bin'))
    expect(parsed.file.type).toBe('application/octet-stream')
  })

  it('lifts the enquirer address out of the freeform contact answer', async () => {
    const parsed = await enquiry()
    expect(parsed.replyTo).toBe('ada@example.com')
  })

  it('leaves replyTo null when the contact answer holds no address', async () => {
    // The field is deliberately freeform; a phone number is a valid answer and
    // must not be rejected just because it cannot be replied to.
    const parsed = await enquiry({ ...complete(), contact: 'signal, +44 7700 900000' })
    expect(parsed.replyTo).toBeNull()
  })
})

describe('the notification body', () => {
  it('escapes answers, which are written by a stranger', async () => {
    const parsed = await enquiry({ ...complete(), brief: '<img src=x onerror=alert(1)>' })
    const html = enquiryHtml(parsed)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('escapes the filename too', async () => {
    const parsed = await enquiry()
    parsed.file.name = '<b>x</b>.png'
    expect(enquiryHtml(parsed)).not.toContain('<b>x</b>')
  })

  it('names the attachment in the text part, so a plain-text client still sees it', async () => {
    const parsed = await enquiry()
    expect(enquiryText(parsed)).toContain('board.png')
    expect(enquiryText(parsed)).toContain('PROJECT BRIEF')
  })
})

describe('sendEnquiry', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('says the form is not connected rather than pretending to send', async () => {
    // The deployment has no key yet. Accepting the enquiry and dropping it is the
    // one outcome worse than refusing it.
    const spy = vi.spyOn(globalThis, 'fetch')
    const outcome = await sendEnquiry({}, await enquiry())
    expect(outcome).toMatchObject({ ok: false, status: 503 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('posts the enquiry to Resend with the attachment and a reply-to', async () => {
    let sent: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(String(url)).toBe('https://api.resend.com/emails')
      const headers = (init?.headers ?? {}) as Record<string, string>
      expect(headers.authorization).toBe('Bearer re_test')
      sent = JSON.parse(String(init?.body))
      return new Response('{"id":"x"}', { headers: { 'content-type': 'application/json' } })
    })

    const outcome = await sendEnquiry({ RESEND_API_KEY: 're_test' }, await enquiry())
    expect(outcome).toEqual({ ok: true })
    expect(sent.to).toBe('chris@severedarchive.com')
    expect(sent.reply_to).toBe('ada@example.com')
    expect(sent.subject).toContain('answer for name')
    const attachments = sent.attachments as { filename: string; content: string }[]
    expect(attachments).toHaveLength(1)
    expect(attachments[0].filename).toBe('board.png')
    // Base64 of the three bytes the fixture file holds.
    expect(attachments[0].content).toBe(btoa('xxx'))
  })

  it('omits reply_to entirely when there is no address to reply to', async () => {
    let sent: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sent = JSON.parse(String(init?.body))
      return new Response('{}')
    })
    await sendEnquiry({ RESEND_API_KEY: 're_test' }, await enquiry({ ...complete(), contact: 'call me' }))
    expect('reply_to' in sent).toBe(false)
  })

  it('keeps a newline out of the subject header', async () => {
    let sent: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sent = JSON.parse(String(init?.body))
      return new Response('{}')
    })
    await sendEnquiry(
      { RESEND_API_KEY: 're_test' },
      await enquiry({ ...complete(), name: 'Ada\r\nBcc: someone@else.com' }),
    )
    expect(String(sent.subject)).not.toMatch(/[\r\n]/)
  })

  it('honours the configured recipient and sender', async () => {
    let sent: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sent = JSON.parse(String(init?.body))
      return new Response('{}')
    })
    await sendEnquiry({
      RESEND_API_KEY: 're_test',
      COMMISSION_TO: 'studio@example.com',
      COMMISSION_FROM: 'Forms <forms@example.com>',
    }, await enquiry())
    expect(sent.to).toBe('studio@example.com')
    expect(sent.from).toBe('Forms <forms@example.com>')
  })

  it('does not leak the upstream message to the browser', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('domain severedarchive.com is not verified for account acct_123', { status: 403 }),
    )
    const outcome = await sendEnquiry({ RESEND_API_KEY: 're_test' }, await enquiry())
    expect(outcome).toMatchObject({ ok: false, status: 502 })
    if (!outcome.ok) expect(outcome.error).not.toContain('acct_123')
  })

  it('survives a network failure instead of throwing into the handler', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
    expect(await sendEnquiry({ RESEND_API_KEY: 're_test' }, await enquiry())).toMatchObject({ ok: false, status: 502 })
  })

  it('base64s a file far past the argument limit without throwing', async () => {
    // `String.fromCharCode(...bytes)` on a whole 10MB file is a RangeError. This
    // is why the encoder chunks; the test is the reason the chunking exists.
    let sent: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sent = JSON.parse(String(init?.body))
      return new Response('{}')
    })
    const big = new File([new Uint8Array(600_000)], 'big.png', { type: 'image/png' })
    const outcome = await sendEnquiry({ RESEND_API_KEY: 're_test' }, await enquiry(complete(), big))
    expect(outcome).toEqual({ ok: true })
    const attachments = sent.attachments as { content: string }[]
    expect(attachments[0].content.length).toBe(800_000)
  })
})
