export function generateId(prefix = "id"): string {
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${randomStr}`;
}

export function generateRoomCode(): string {
  // Generate uppercase alphanumeric code (e.g., MBFD-8237 or 6 alphanumeric characters)
  const prefix = "MBFD-";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No easily confused characters like O, I, 0, 1
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${code}`;
}
