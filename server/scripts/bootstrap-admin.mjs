import process from 'node:process';
import readline from 'node:readline/promises';

function argumentValue(name) {
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : null;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be set.`);
  return value;
}

const apply = process.argv.includes('--apply');
const promptPassword = process.argv.includes('--prompt-password');
const username = argumentValue('--username');
const roleCode = argumentValue('--role') || 'catalog_editor';

if (!username || !/^[A-Za-z0-9_.-]{3,64}$/.test(username)) throw new Error('Username must contain 3-64 letters, numbers, dots, underscores, or hyphens.');
if (!/^[a-z_]{3,64}$/.test(roleCode)) throw new Error('Role code is invalid.');

if (!apply) {
  process.stdout.write(`Dry run: would create or update administrator ${username} with role ${roleCode}. Re-run with --apply after owner approval.\n`);
  process.exit(0);
}

async function readHiddenPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('A terminal is required for --prompt-password.');
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const originalWrite = terminal._writeToOutput.bind(terminal);
  terminal._writeToOutput = (text) => {
    if (text !== '\n' && text !== '\r\n') originalWrite('*');
  };
  try {
    const first = await terminal.question('Administrator password: ');
    originalWrite('\n');
    const second = await terminal.question('Confirm password: ');
    originalWrite('\n');
    if (first !== second) throw new Error('Passwords do not match.');
    return first;
  } finally {
    terminal.close();
  }
}

const password = promptPassword ? await readHiddenPassword() : requiredEnvironment('ADMIN_BOOTSTRAP_PASSWORD');
if (password.length < 12) throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.');

const { default: mysql } = await import('mysql2/promise');
const { hashPassword } = await import('../src/security/password.js');
const connection = await mysql.createConnection({
  host: requiredEnvironment('MYSQL_HOST'),
  port: Number(requiredEnvironment('MYSQL_PORT')),
  user: requiredEnvironment('MYSQL_APP_USER'),
  password: requiredEnvironment('MYSQL_APP_PASSWORD'),
  database: requiredEnvironment('MYSQL_DATABASE')
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
