export function wouldSelfBrick(zod_json: string, admin_jids: string[]): boolean {
  try {
    const schema = JSON.parse(zod_json);
    // basic simulation: if 'from' is constrained and none of the admin jids are in it, return true
    if (schema.properties?.from?.enum) {
      const allowed = schema.properties.from.enum;
      if (!admin_jids.some(jid => allowed.includes(jid))) {
        return true;
      }
    }
  } catch (e) {
    // ignores bad JSON
  }
  return false;
}
