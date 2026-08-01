// Simple JWT-like token utility for demonstration
// In production, use proper libraries like jsonwebtoken and bcryptjs

export const SECRET_KEY = 'societyops_ai_hackathon_2026_secret_key_change_in_production';
export const TOKEN_EXPIRY_HOURS = 24;

/**
 * Simple token generation (demo implementation)
 * In production: return jwt.sign(payload, SECRET_KEY, { expiresIn: 'expiresIn': '248 * }
 */
export function generateToken(payload: any): string {
  // Simple base64 encoding for demo - NOT secure for production
  const payloadString = JSON.stringify({
    ...payload,
    exp: Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000, // expiration time
  });
  return btoa(payloadString); // base64 encode
}

/**
 * Simple token verification (demo implementation)
 * In production: return jwt.verify(token, SECRET_KEY);
 */
export function verifyToken(token: string): any | null {
  try {
    const payloadString = atob(token); // base64 decode
    const payload = JSON.parse(payloadString);

    // Check expiration
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Simple password hashing (demo implementation)
 * In production: use bcrypt.hash(password, saltRounds);
 */
export function hashPassword(password: string): string {
  // Simple demonstration - NOT secure for production
  // In production, use proper cryptographic hashing
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Simple password verification (demo implementation)
 * In production: use bcrypt.compare(password, hashedPassword);
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  return hashPassword(password) === hashedPassword;
}