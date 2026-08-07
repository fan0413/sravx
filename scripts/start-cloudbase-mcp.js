const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const envFile = path.resolve(process.cwd(), '.env.mcp.local');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

loadEnvFile(envFile);

const requiredVars = [
    'CLOUDBASE_ENV_ID',
    'TENCENTCLOUD_SECRETID',
    'TENCENTCLOUD_SECRETKEY',
];

const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
}

const isWindows = process.platform === 'win32';
const mcpBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    isWindows ? 'cloudbase-mcp.cmd' : 'cloudbase-mcp'
);

function quoteForCmd(arg) {
    if (arg === '') return '""';
    if (!/[ \t"]/u.test(arg)) return arg;
    return `"${arg.replace(/"/g, '\\"')}"`;
}

const child = isWindows
    ? spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', `${quoteForCmd(mcpBin)} ${process.argv.slice(2).map(quoteForCmd).join(' ')}`],
        {
            stdio: 'inherit',
            env: process.env,
        }
    )
    : spawn(mcpBin, process.argv.slice(2), {
        stdio: 'inherit',
        env: process.env,
    });

child.on('exit', (code, signal) => {
    if (typeof code === 'number') {
        process.exit(code);
    }
    if (signal) {
        process.kill(process.pid, signal);
    }
    process.exit(1);
});
