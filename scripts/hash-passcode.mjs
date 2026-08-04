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
import { stdin, stdout } from 'node:process'
import { webcrypto as crypto } from 'node:crypto'

const ITERATIONS = 210_000

const b64 = (buf) => Buffer.from(buf).toString('base64')

const rl = createInterface({ input: stdin, output: stdout })
const passcode = await rl.question('Passcode (will not be stored anywhere): ')
rl.close()

if (passcode.length < 12) {
  console.error('\nRefusing: use at least 12 characters. This is the only thing between')
  console.error('the internet and your publishing pipeline, and it is rate limited but')
  console.error('not unguessable at 8.')
  process.exit(1)
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
  key,
  256,
)

console.log(`\npbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}\n`)
