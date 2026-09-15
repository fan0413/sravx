function routeGroup(pathname) {
  return `/${pathname.split('/').filter(Boolean).slice(0, 3).join('/')}`;
}

export function createRequestAuditLogger({ write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  if (typeof write !== 'function') throw new Error('Audit log writer must be a function.');
  return (event) => {
    const record = {
      event: 'api_request',
      requestId: event.requestId,
      method: event.method,
      route: routeGroup(event.pathname),
      statusCode: event.statusCode,
      durationMs: event.durationMs
    };
    write(JSON.stringify(record));
  };
}
