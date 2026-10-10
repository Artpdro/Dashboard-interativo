/* Instalador do CRM Enterprise (primeira vez). Uso: node scripts/setup.js */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const ENV_FILE = path.join(BACKEND, '.env');
const isWin = process.platform === 'win32';

const step = (m) => console.log(`\n=== ${m} ===`);
const run = (cmd, cwd, capture) => spawnSync(cmd, { cwd, shell: true, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
function runOrDie(cmd, cwd, label) {
  if (run(cmd, cwd).status !== 0) { console.error(`\nERRO ao executar: ${label || cmd}`); process.exit(1); }
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise((res) => rl.question(def !== undefined ? `${q} [${def}]: ` : `${q}: `, (a) => res(a.trim() || def || '')));

function parseEnv(text) {
  const out = {};
  text.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  });
  return out;
}

async function ensureEnv() {
  step('Configuração (.env)');
  if (fs.existsSync(ENV_FILE)) {
    console.log('Arquivo backend/.env já existe - mantendo suas configurações.');
    const cur = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
    const add = [];
    if (!cur.JWT_SECRET) add.push(`JWT_SECRET="${crypto.randomBytes(32).toString('hex')}"`);
    if (!cur.PORT) add.push('PORT=3001');
    if (!cur.RATE_LIMIT_MAX_REQUESTS) add.push('RATE_LIMIT_MAX_REQUESTS=3000');
    if (!cur.DEFAULT_FROM_EMAIL) add.push('DEFAULT_FROM_EMAIL="sindnorteigarassu2019@hotmail.com"');
    if (add.length) fs.appendFileSync(ENV_FILE, '\n' + add.join('\n') + '\n');
    return parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  }
  console.log('Informe os dados do seu PostgreSQL (Enter aceita o valor entre colchetes).');
  const host = await ask('Servidor', 'localhost');
  const port = await ask('Porta', '5432');
  const user = await ask('Usuário', 'postgres');
  const pass = await ask('Senha do PostgreSQL');
  const db = await ask('Nome do banco (criado se não existir)', 'crm_enterprise');
  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(db)}?schema=public`;
  const content = [
    `DATABASE_URL="${url}"`,
    `JWT_SECRET="${crypto.randomBytes(32).toString('hex')}"`,
    'JWT_EXPIRES_IN="7d"',
    'PORT=3001',
    'NODE_ENV=production',
    'DEFAULT_FROM_EMAIL="sindnorteigarassu2019@hotmail.com"',
    'RATE_LIMIT_MAX_REQUESTS=3000',
    '',
  ].join('\n');
  fs.writeFileSync(ENV_FILE, content);
  console.log('Arquivo backend/.env criado.');
  return parseEnv(content);
}

async function ensureDatabase(env) {
  step('Banco de dados');
  const { PrismaClient } = createRequire(path.join(BACKEND, 'package.json'))('@prisma/client');
  const u = new URL(env.DATABASE_URL);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  u.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: u.toString() } } });
  try {
    const rows = await admin.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}'`);
    if (!rows.length) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Banco "${dbName}" criado.`);
    } else console.log(`Banco "${dbName}" já existe.`);
  } catch (e) {
    console.error('\nNão foi possível conectar ao PostgreSQL com os dados informados.');
    console.error('Verifique se o PostgreSQL está instalado e ligado, e se usuário/senha estão corretos.');
    console.error('Para corrigir, apague o arquivo backend\\.env e rode a instalação de novo.\n');
    console.error(String(e.message || e).split('\n').slice(-4).join('\n'));
    process.exit(1);
  } finally { await admin.$disconnect(); }
}

function migrate() {
  step('Tabelas do banco');
  let r = run('npx prisma migrate deploy', BACKEND, true);
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.status !== 0 && /P3005/.test((r.stdout || '') + (r.stderr || ''))) {
    console.log('Banco já tem tabelas (sem histórico de migrações). Marcando migrações como aplicadas...');
    const dir = path.join(BACKEND, 'prisma', 'migrations');
    fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).forEach((d) => run(`npx prisma migrate resolve --applied ${d}`, BACKEND));
    r = run('npx prisma migrate deploy', BACKEND);
  }
  if (r.status !== 0) { console.error('\nERRO ao criar as tabelas do banco.'); process.exit(1); }
}

function createShortcut() {
  step('Atalho na área de trabalho');
  if (!isWin) { console.log('Fora do Windows: use "node scripts/launcher.js" para iniciar.'); return; }
  const ps = path.join(os.tmpdir(), 'crm-shortcut.ps1');
  const q = (s) => s.replace(/'/g, "''");
  const target = path.join(ROOT, 'Iniciar CRM.bat');
  const icon = path.join(ROOT, 'scripts', 'crm.ico');
  fs.writeFileSync(ps, [
    '$desktop = [Environment]::GetFolderPath("Desktop")',
    '$ws = New-Object -ComObject WScript.Shell',
    '$s = $ws.CreateShortcut((Join-Path $desktop "CRM Enterprise.lnk"))',
    `$s.TargetPath = '${q(target)}'`,
    `$s.WorkingDirectory = '${q(ROOT)}'`,
    '$s.WindowStyle = 7',
    `if (Test-Path '${q(icon)}') { $s.IconLocation = '${q(icon)}' }`,
    '$s.Description = "Abrir o CRM Enterprise"',
    '$s.Save()',
  ].join('\r\n'));
  const r = run(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps}"`, ROOT);
  console.log(r.status === 0 ? 'Atalho "CRM Enterprise" criado na área de trabalho.' : 'Não foi possível criar o atalho. Use o arquivo "Iniciar CRM.bat" desta pasta.');
}

(async () => {
  console.log('Instalador do CRM Enterprise\n');
  if (Number(process.versions.node.split('.')[0]) < 18) { console.error('Node.js 18 ou superior é necessário. Baixe em https://nodejs.org'); process.exit(1); }

  const env = await ensureEnv();
  step('Instalando dependências do servidor');
  runOrDie('npm install --no-audit --no-fund', BACKEND, 'npm install (servidor)');
  runOrDie('npx prisma generate', BACKEND, 'prisma generate');
  step('Instalando dependências da interface');
  runOrDie('npm install --no-audit --no-fund', FRONTEND, 'npm install (interface)');

  await ensureDatabase(env);
  migrate();

  step('Criando usuário administrador (se necessário)');
  runOrDie('npm run db:seed', BACKEND, 'seed');

  step('Compilando o sistema');
  run('npm run build', BACKEND);
  if (!fs.existsSync(path.join(BACKEND, 'dist', 'server.js'))) { console.error('ERRO: o servidor não foi compilado.'); process.exit(1); }
  runOrDie('npm run build', FRONTEND, 'build da interface');

  createShortcut();
  rl.close();
  console.log('\nPRONTO! Abra "CRM Enterprise" na área de trabalho.');
  console.log('Login inicial: admin@crm.com / admin123 (troque a senha depois).');
})().catch((e) => { console.error(e); process.exit(1); });
