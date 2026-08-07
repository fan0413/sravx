const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const MCP_BIN = path.resolve(process.cwd(), 'node_modules', '.bin', 'cloudbase-mcp');

if (!fs.existsSync(MCP_BIN)) {
    console.error('cloudbase-mcp not found at:', MCP_BIN);
    process.exit(1);
}

const env = { ...process.env };
const envFile = path.resolve(process.cwd(), '.env.mcp.local');
const envContent = fs.readFileSync(envFile, 'utf8');
envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
    }
    if (!env[key]) env[key] = val;
});

const child = spawn(MCP_BIN, [], { env, stdio: ['pipe', 'pipe', 'pipe'] });

let responseBuffer = '';

child.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    const lines = responseBuffer.split('\n');
    responseBuffer = lines.pop() || '';
    for (const line of lines) {
        if (line.trim()) {
            console.log('[MCP OUT]', line);
        }
    }
});

child.stderr.on('data', (data) => {
    console.error('[MCP ERR]', data.toString().trim());
});

child.on('exit', (code) => {
    console.log('MCP server exited with code:', code);
    process.exit(code || 0);
});

setTimeout(() => {
    console.log('MCP server started, waiting for tools...');
    process.exit(0);
}, 3000);
