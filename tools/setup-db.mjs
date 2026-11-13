// Supabase DB 설정 스크립트: supabase.sql을 실행하고 비밀 키를 등록합니다.
// 사용법: node tools/setup-db.mjs   (먼저 secrets.local.env를 채우세요)
//
// - 비밀 키 원문은 Supabase로 보내지 않고, SHA-256 해시만 보냅니다.
// - 토큰이나 비밀 키를 화면에 출력하지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secretsPath = path.join(root, 'secrets.local.env');

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ---- secrets.local.env 읽기 ----
if (!fs.existsSync(secretsPath)) die('secrets.local.env 파일이 없습니다.');
let secretsText = fs.readFileSync(secretsPath, 'utf8');
const env = {};
for (const line of secretsText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) die('secrets.local.env의 SUPABASE_ACCESS_TOKEN이 비어 있습니다.');

let key = env.MEMO_SECRET_KEY;
let generated = false;
if (!key) {
  key = crypto.randomBytes(18).toString('base64url'); // 24자 랜덤
  generated = true;
} else if (key.length < 16) {
  die('MEMO_SECRET_KEY는 16자 이상이어야 합니다.');
}

// ---- config.js에서 프로젝트 정보 읽기 ----
const window = {};
new Function('window', fs.readFileSync(path.join(root, 'config.js'), 'utf8'))(window);
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.MEMO_CONFIG || {};
const ref = (SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!ref || !SUPABASE_ANON_KEY) die('config.js의 SUPABASE_URL / SUPABASE_ANON_KEY를 확인하세요.');

// ---- 실행할 SQL 만들기 (3단계 비밀 키 부분은 해시로 대체) ----
const fullSql = fs.readFileSync(path.join(root, 'supabase.sql'), 'utf8');
const cut = fullSql.indexOf('-- [3단계]');
if (cut < 0) die('supabase.sql에서 [3단계] 표시를 찾지 못했습니다.');
const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
const sql = `${fullSql.slice(0, cut)}
insert into private.settings (id, key_hash) values (1, '${hash}')
on conflict (id) do update set key_hash = excluded.key_hash;
notify pgrst, 'reload schema';
`;

// ---- Supabase Management API로 실행 ----
console.log(`→ 프로젝트 ${ref}에 supabase.sql 실행 중…`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
if (!res.ok) die(`SQL 실행 실패 (HTTP ${res.status}): ${body.slice(0, 500)}`);
console.log('✓ 테이블·함수 생성 및 비밀 키 등록 완료');

if (generated) {
  secretsText = secretsText.replace(/^MEMO_SECRET_KEY=.*$/m, `MEMO_SECRET_KEY=${key}`);
  fs.writeFileSync(secretsPath, secretsText);
  console.log('✓ 랜덤 비밀 키를 만들어 secrets.local.env의 MEMO_SECRET_KEY에 적어 두었습니다.');
}

// ---- 확인: 웹페이지와 같은 방식(anon 키)으로 호출 ----
async function check(p_key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/memo_check`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key }),
  });
  return { status: r.status, body: await r.text() };
}
// 스키마 캐시 갱신에 잠깐 걸릴 수 있어 몇 번 재시도
let good, bad;
for (let i = 0; i < 5; i++) {
  good = await check(key);
  if (good.status === 200) break;
  await new Promise((r) => setTimeout(r, 1500));
}
bad = await check('definitely-wrong-key');
console.log(`  올바른 키 확인: HTTP ${good.status} → ${good.body}`);
console.log(`  틀린 키 확인:   HTTP ${bad.status} → ${bad.body}`);
if (good.body.trim() === 'true' && bad.body.trim() === 'false') console.log('✓ 연동 확인 완료');
else die('확인 결과가 예상과 다릅니다.');
