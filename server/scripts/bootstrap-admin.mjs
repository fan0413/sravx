import process from 'node:process';
import { readFile } from 'node:fs/promises';

function argumentValue(name) {
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : null;
}

async function loadEnvironmentFile(path) {
  const contents = await readFile(path, 'utf8');
  const values = Object.create(null);
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function requiredEnvironment(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be set.`);
  return value;
}

const apply = process.argv.includes('--apply');
const promptPassword = process.argv.includes('--prompt-password');
const username = argumentValue('--username');
const roleCode = argumentValue('--role') || 'catalog_editor';
const environmentFile = argumentValue('--env-file') || '/home/deploy/.config/sravx/mysql.env';

if (!username || !/^[A-Za-z0-9_.-]{3,64}$/.test(username)) throw new Error('Username must contain 3-64 letters, numbers, dots, underscores, or hyphens.');
if (!/^[a-z_]{3,64}$/.test(roleCode)) throw new Error('Role code is invalid.');

if (!apply) {
  process.stdout.write(`Dry run: would create or update administrator ${username} with role ${roleCode}. Re-run with --apply after owner approval.\n`);
  process.exit(0);
}

async function readHiddenLine(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') throw new Error('A terminal is required for --prompt-password.');
  const input = process.stdin;
  const wasRaw = input.isRaw;
  process.stdout.write(label);
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (cause, result) => {
      input.off('data', onData);
      input.setRawMode(Boolean(wasRaw));
      process.stdout.write('\n');
      if (cause) reject(cause); else resolve(result);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Password input cancelled.'));
        if (character === '\r' || character === '\n') return finish(null, value);
        if (character === '\u007f' || character === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          process.stdout.write('*');
        }
      }
    };
    input.on('data', onData);
  });
}

async function readHiddenPassword() {
  const first = await readHiddenLine('Administrator password: ');
  const second = await readHiddenLine('Confirm password: ');
  if (first !== second) throw new Error('Passwords do not match.');
  return first;
}

const password = promptPassword ? await readHiddenPassword() : requiredEnvironment(process.env, 'ADMIN_BOOTSTRAP_PASSWORD');
if (password.length < 12) throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.');

const { default: mysql } = await import('mysql2/promise');
const { hashPassword } = await import('../src/security/password.js');
const fileEnvironment = await loadEnvironmentFile(environmentFile);
const environment = { ...fileEnvironment, ...process.env };
const connection = await mysql.createConnection({
  host: requiredEnvironment(environment, 'MYSQL_HOST'),
  port: Number(requiredEnvironment(environment, 'MYSQL_PORT')),
  user: requiredEnvironment(environment, 'MYSQL_APP_USER'),
  password: requiredEnvironment(environment, 'MYSQL_APP_PASSWORD'),
  database: requiredEnvironment(environment, 'MYSQL_DATABASE')
});

try {
  await connection.beginTransaction();
  const [existing] = await connection.execute('SELECT id FROM admin_accounts WHERE username = ? LIMIT 1', [username]);
  if (existing.length) throw new Error('Administrator username already exists; refusing to overwrite it.');
  const passwordHash = await hashPassword(password);
  const [account] = await connection.execute('INSERT INTO admin_accounts (username, password_hash, status) VALUES (?, ?, \'active\')', [username, passwordHash]);
  await connection.execute('INSERT INTO admin_roles (code) VALUES (?) ON DUPLICATE KEY UPDATE code = VALUES(code)', [roleCode]);
  const [roles] = await connection.execute('SELECT id FROM admin_roles WHERE code = ? LIMIT 1', [roleCode]);
  await connection.execute('INSERT INTO admin_account_roles (admin_account_id, admin_role_id) VALUES (?, ?)', [account.insertId, roles[0].id]);
  await connection.execute(
    `INSERT INTO admin_audit_events (admin_account_id, request_id, action, resource_type, resource_id, after_summary)
     VALUES (?, UUID(), 'admin.bootstrap', 'admin_account', ?, JSON_OBJECT('role', ?))`,
    [account.insertId, String(account.insertId), roleCode]
  );
  await connection.commit();
  process.stdout.write('Administrator bootstrap completed. Password was not printed.\n');
} catch (cause) {
  await connection.rollback();
  throw cause;
} finally {
  await connection.end();
}
