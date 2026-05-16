export async function workerFetch(path: string, options?: any) {
  return fetch(`http://localhost:8787${path}`, options);
}
