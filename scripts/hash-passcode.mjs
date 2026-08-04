#!/usr/bin/env node
/**
 * Turn a passcode into the record the Worker stores.
 *
 *   node scripts/hash-passcode.mjs
 *   (paste the output into `wrangler secret put ADMIN_PASSCODE_HASH`)
 *
 * The passcode is read from stdin rather than argv on purpose: an argument
 * lands in shell history and in the process list, where anyone on the machine
 * can read it. Nothing here writes to a file.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stderr, stdout } from 'node:process'
import { webcrypto as crypto } from 'node:crypto'

const ITERATIONS = 100_000 // Cloudflare Workers rejects PBKDF2 above this — see server/auth.ts

const b64 = (buf) => Buffer.from(buf).toString('base64')

// Without a terminal there is nothing to type into: readline sees EOF at once,
// the await never settles, and node exits having printed only the prompt. Piped
// into `wrangler secret put` that prompt BECOMES the secret, and wrangler
// reports success — a passcode nobody can use, installed silently. Refuse
// instead, before a single byte reaches stdout.
if (!stdin.isTTY) {
  stderr.write(
    'hash-passcode: needs a terminal.\n\n' +
    'Run it in a real shell (Terminal.app, iTerm, a plain SSH session) rather\n' +
    'than through a tool that captures stdio. Pipe it straight into wrangler\n' +
    'there and the passcode never touches history or this machine\'s disk:\n\n' +
    '  node scripts/hash-passcode.mjs | tail -1 | npx wrangler secret put ADMIN_PASSCODE_HASH\n',
  )
  process.exit(1)
}

const rl = createInterface({ input: stdin, output: stderr })
const passcode = await rl.question('Passcode (will not be stored anywhere): ')
rl.close()

if (passcode.length < 12) {
  stderr.write('\nRefusing: use at least 12 characters. This is the only thing between\n')
  stderr.write('the internet and your publishing pipeline, and it is rate limited but\n')
  stderr.write('not unguessable at 8.\n')
  process.exit(1)
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
  key,
  256,
)

// Exactly one line on stdout, and only ever the record — so piping this
// somewhere cannot capture a prompt, a warning or a blank line by mistake.
stdout.write(`pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}\n`)
