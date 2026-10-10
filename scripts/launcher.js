/* Inicia o CRM Enterprise (servidor + navegador). Uso: node scripts/launcher.js */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const ENV_FILE = path.join(BACKEND, '.env');
const req = createRequire(path.join(BACKEND, 'package.json'));

function fail(msg) { console.error('\n' + msg + '\n'); process.exitCode = 1; }

(async () => {
  if (!fs.existsSync(ENV_FILE) || !fs.existsSync(path.join(BACKEND, 'dist', 'server.js'))) {
    return fail('O sistema ainda não foi instalado. Execute primeiro o arquivo "Instalar CRM.bat".');
  }
  process.chdir(BACKEND);
  req('dotenv').config({ path: ENV_FILE });
  process.env.NODE_ENV = 'production';
  const PORT = Number(process.env.PORT) || 3001;
  const URL_APP = `http://localhost:${PORT}`;

  const health = () => new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    r.on('error', () => resolve(false));
    r.on('timeout', () => { r.destroy(); resolve(false); });
  });
  const openBrowser = (url) => {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  };

  if (await health()) { console.log('O CRM já está em execução. Abrindo o navegador...'); openBrowser(URL_APP); setTimeout(() => process.exit(0), 800); return; }

  const { PrismaClient } = req('@prisma/client');
  const prisma = new PrismaClient();
  try { await prisma.$connect(); await prisma.$disconnect(); }
  catch (e) { return fail('Não foi possível conectar ao banco PostgreSQL.\nVerifique se o PostgreSQL está ligado (serviço "postgresql") e se backend\\.env está correto.'); }

  console.log('==============================================');
  console.log('  CRM Enterprise em execução');
  console.log(`  Endereço: ${URL_APP}`);
  console.log('  NÃO FECHE ESTA JANELA enquanto estiver usando.');
  console.log('  Para encerrar o sistema, feche esta janela.');
  console.log('==============================================\n');

  require(path.join(BACKEND, 'dist', 'server.js'));
  for (let i = 0; i < 40; i++) { if (await health()) break; await new Promise((r) => setTimeout(r, 500)); }
  openBrowser(URL_APP);
})();
