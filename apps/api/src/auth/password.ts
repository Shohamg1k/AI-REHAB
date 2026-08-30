import bcrypt from "bcryptjs";

// 12 rounds — bcryptjs's own recommended floor for 2024+ hardware, cheap
// enough not to make login noticeably slow, expensive enough to make an
// offline hash-cracking attempt impractical at scale.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
