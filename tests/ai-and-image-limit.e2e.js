// WARNING: these simulations write to (and some delete files under) ./storage.
// Run them from the repo root on a SCRATCH COPY, never on a live install with real data:
//   node tests/ai-and-image-limit.e2e.js
process.env.OWNER_1 = '255700000001';
process.env.PREFIX = '.!';   // two prefixes allowed, so the 'switching prefix' check still has something to switch to
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';   // only Anthropic configured
const p = process.cwd();
const axios = require(require.resolve('axios', { paths: [p + '/src'] }));
let anthropicCalls = 0, failNext = false;
axios.post = async (url, body) => {
  if (url.includes('anthropic.com')) {
    anthropicCalls++;
    if (failNext) { failNext = false; throw new Error('boom'); }
    return { data: { content: [{ text: 'Hello from Claude mock' }] } };
  }
  throw new Error('unexpected url ' + url);
};
const commandHandler = require(p + '/src/bot/handlers/commandHandler.js');
const openaiSvc = require(p + '/src/services/openai.js');
const limiter = require(p + '/src/utils/imageRateLimiter.js');
require('fs').rmSync(p + '/storage/usage', { recursive: true, force: true });

let sent = [];
const sock = { sendMessage: async (c, content) => { sent.push(content); return { key: {} }; } };
const run = async (from, text) => { sent = []; const m = { key: { remoteJid: 'c@g.us', participant: from, id: 'i' }, message: { conversation: text } }; await commandHandler.handle(sock, m, text, () => ({}), () => {}); return sent.filter(s => s.text).map(s => s.text); };
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log('  ✅', n)) : (fail++, console.log('  ❌', n, d ? '-> ' + d : '')); };

(async () => {
  console.log('[AI router]');
  let r = await run('a@s.whatsapp.net', '.gpt hi there');
  check('.gpt falls through to the only configured provider (Anthropic)', r.slice(-1)[0] === '🤖 AI\n\nHello from Claude mock' && anthropicCalls === 1, JSON.stringify(r));
  r = await run('a@s.whatsapp.net', '.claude hi');
  check('.claude forces Anthropic', r.slice(-1)[0] === '🤖 AI\n\nHello from Claude mock');
  r = await run('a@s.whatsapp.net', '.deepseek hi');
  check('.deepseek with no key -> clean "not configured" message', r[0]?.includes('provider is not configured'), JSON.stringify(r));
  failNext = true; r = await run('a@s.whatsapp.net', '.ask hi');
  check('provider failure -> clean error, no crash', r.slice(-1)[0]?.includes("couldn't reach the AI"), JSON.stringify(r));
  r = await run('a@s.whatsapp.net', '.gpt');
  check('empty question -> usage prompt', r[0]?.includes('provide a question'));

  console.log('\n[image generation rate limit: 30 / 5h, per sender, success-only]');
  process.env.OPENAI_API_KEY = 'x';
  let genOk = true, genCalls = 0;
  openaiSvc.isAvailable = () => true;
  openaiSvc.generateImage = async () => { genCalls++; return genOk ? 'http://img/1.png' : null; };
  const A = '255700000101@s.whatsapp.net', B = '255700000102@s.whatsapp.net';

  genOk = false; await run(A, '.image failing prompt'); await run(A, '.image failing prompt');
  check('failed generations do NOT consume the allowance', limiter.canGenerate('255700000101').remaining === 30, 'remaining=' + limiter.canGenerate('255700000101').remaining);

  genOk = true;
  for (let i = 0; i < 30; i++) await run(A, '.image cat ' + i);
  const callsBefore = genCalls;
  r = await run(A, '.image one too many');
  check('31st request is blocked with a wait time', r[0]?.includes('limit') && /\d+h|\d+m/.test(r[0]), JSON.stringify(r));
  check('blocked request never hit the image API', genCalls === callsBefore);
  r = await run(A, '!image via a different prefix');
  check('switching prefix does not bypass the limit', r[0]?.includes('limit'), JSON.stringify(r));
  r = await run(A, '.luxurygold via a style command');
  check('using another image command does not bypass the limit', r[0]?.includes('limit'), JSON.stringify(r));
  r = await run(A, '.cartoonstyle a dog');
  check('.imageai style commands share the same limit', r[0]?.includes('limit'), JSON.stringify(r));
  r = await run(B, '.image cat');
  check('a different user has an independent 30', r.some(t => t.includes('29 left after this one')) , JSON.stringify(r));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  require('fs').rmSync(p + '/storage/usage', { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})();
