import { createRuntimeServer } from './runtime.js';

const port = Number(process.env.PORT || 3000);
const server = await createRuntimeServer();
server.listen(port, '127.0.0.1', () => console.log(`Migration API listening on 127.0.0.1:${port}`));
