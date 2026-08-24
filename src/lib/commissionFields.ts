/**
 * The commission enquiry's questions, and what counts as answered.
 *
 * These ten questions were the client's Tally form, which the COMMISSIONS link
 * pointed at until now. The form is the only inbound sales channel on the site,
 * so it lives here rather than behind a redirect: a third party that changes its
 * embed, its pricing or its branding is a third party in the middle of the one
 * conversation this site exists to start.
 *
 * Deliberately free of React and of `import.meta.env`, because the WORKER imports
 * this too — it writes the labels into the notification email, and a copy of them
 * in `server/` would be two lists to keep in step. `src/lib/commission.ts` adds
 * the browser half and re-exports all of this, so the panel has one import.
 */

export type CommissionFieldId =
  | 'name' | 'contact' | 'brief' | 'deliverables' | 'goal'
  | 'success' | 'timeline' | 'budget' | 'extra'

export type CommissionField = {
  id: CommissionFieldId
  label: string
  /** 'line' renders a single-line input; 'para' a textarea. */
  kind: 'line' | 'para'
  required: boolean
}

/**
 * The ten questions, in the order the form shows them, with the client's own
 * wording and their own required/optional split — transcribed from the Tally
 * form rather than reworded. Three are optional there and stay optional here:
 * a required field the client did not ask for is a field that loses enquiries.
 */
export const COMMISSION_FIELDS: readonly CommissionField[] = [
  { id: 'name', label: 'Name', kind: 'line', required: true },
  { id: 'contact', label: 'Contact Information (Include Preferred)', kind: 'para', required: true },
  { id: 'brief', label: 'Project Brief', kind: 'para', required: true },
  { id: 'deliverables', label: 'List Required Deliverables', kind: 'para', required: true },
  { id: 'goal', label: 'What is the overall goal of this project?', kind: 'para', required: false },
  { id: 'success', label: 'Outline what a successful project looks like to you.', kind: 'para', required: false },
  { id: 'timeline', label: 'What is your project timeline?', kind: 'para', required: true },
  { id: 'budget', label: 'What is your budget range for this project?', kind: 'para', required: true },
  { id: 'extra', label: 'Share any extra details or specifications:', kind: 'para', required: false },
]

export const MOODBOARD_LABEL = 'Attach Moodboard & Style References'

/**
 * The Turnstile action this form's widget is embedded for.
 *
 * Shared because it is a contract with two ends: the panel stamps it on the
 * widget, and the Worker refuses any token whose action is not this exact
 * string. A token minted by another widget on the same account is otherwise a
 * perfectly valid token, and the action is what ties one to THIS form.
 */
export const COMMISSION_ACTION = 'commission'

/**
 * The client's own 10MB ceiling, enforced in the browser so a large file fails
 * before the upload rather than after it, and again in the Worker because the
 * browser's copy is a courtesy and not a control.
 */
export const MOODBOARD_MAX_BYTES = 10 * 1024 * 1024

/**
 * The longest any one answer may be. Nobody types a 20k-character budget range;
 * something that does is either broken or hostile, and the whole enquiry has to
 * fit in an email either way.
 */
export const ANSWER_MAX_CHARS = 8000

export type CommissionValues = Record<CommissionFieldId, string>

export function blankCommission(): CommissionValues {
  // Built from the spec rather than written out, so a new field cannot be added
  // above and forgotten here — which would leave its input `undefined` and make
  // React switch it to an uncontrolled component mid-edit.
  const empty = {} as CommissionValues
  for (const field of COMMISSION_FIELDS) empty[field.id] = ''
  return empty
}

export type CommissionInvalid = CommissionFieldId | 'moodboard'

/**
 * What is not yet answered, in field order, with the moodboard last.
 *
 * Whitespace does not count as an answer: a space bar is not a project brief.
 * Order matters because the panel focuses the first entry, and focusing the
 * furthest-down empty field would scroll the user past the ones above it.
 */
export function commissionErrors(values: CommissionValues, file: File | null): CommissionInvalid[] {
  const invalid: CommissionInvalid[] = []
  for (const field of COMMISSION_FIELDS) {
    const answer = values[field.id] ?? ''
    if (field.required && !answer.trim()) invalid.push(field.id)
    else if (answer.length > ANSWER_MAX_CHARS) invalid.push(field.id)
  }
  if (!file || file.size === 0 || file.size > MOODBOARD_MAX_BYTES) invalid.push('moodboard')
  return invalid
}
