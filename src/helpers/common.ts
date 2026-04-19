import bcrypt from "bcrypt";

/**
 * Generates a 6-digit OTP
 * @returns {string} 6-digit OTP string
 * @throws {Error} If OTP generation fails
 */
export const generateOTP = (): string => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Validate that we got a 6-digit number
    if (otp.length !== 6) {
      throw new Error("Failed to generate valid 6-digit OTP");
    }

    return otp;
  } catch (error) {
    console.error("Error generating OTP:", error);
    throw new Error("Failed to generate OTP. Please try again.");
  }
};

/**
 * Hashes a password using bcrypt with salt rounds
 * @param {string} password - Plain text password to hash
 * @param {number} saltRounds - Number of salt rounds (default: 12)
 * @returns {Promise<string>} Hashed password
 * @throws {Error} If password hashing fails
 */
export const hashPassword = async (
  password: string,
  saltRounds: number = 12
): Promise<string> => {
  try {
    if (!password || typeof password !== "string") {
      throw new Error("Password must be a non-empty string");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    if (saltRounds < 10 || saltRounds > 15) {
      throw new Error("Salt rounds must be between 10 and 15");
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    if (!hashedPassword) {
      throw new Error("Failed to hash password");
    }

    return hashedPassword;
  } catch (error) {
    console.error("Error hashing password:", error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Failed to hash password. Please try again.");
  }
};

/**
 * Compares a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {Error} If password comparison fails
 */
export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  try {
    if (!password || typeof password !== "string") {
      throw new Error("Password must be a non-empty string");
    }

    if (!hashedPassword || typeof hashedPassword !== "string") {
      throw new Error("Hashed password must be a non-empty string");
    }

    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error("Error comparing passwords:", error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Failed to verify password. Please try again.");
  }
};

/**
 * Generates a secure random string for tokens
 * @param {number} length - Length of the random string (default: 32)
 * @returns {string} Random string
 * @throws {Error} If random string generation fails
 */
export const generateRandomString = (length: number = 32): string => {
  try {
    if (length <= 0 || length > 128) {
      throw new Error("Length must be between 1 and 128");
    }

    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    if (result.length !== length) {
      throw new Error("Failed to generate random string of specified length");
    }

    return result;
  } catch (error) {
    console.error("Error generating random string:", error);
    throw new Error("Failed to generate random string. Please try again.");
  }
};

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if email is valid, false otherwise
 */
export const isValidEmail = (email: string): boolean => {
  try {
    if (!email || typeof email !== "string") {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.toLowerCase());
  } catch (error) {
    console.error("Error validating email:", error);
    return false;
  }
};

/**
 * Creates a standardized error object
 * @param {string} message - Error message
 * @param {string} code - Error code (optional)
 * @param {number} statusCode - HTTP status code (optional)
 * @returns {Error} Standardized error object
 */
export const createError = (
  message: string,
  code?: string,
  statusCode?: number
): Error => {
  const error = new Error(message) as any;
  if (code) error.code = code;
  if (statusCode) error.statusCode = statusCode;
  return error;
};

export const escapeSQLWildcards = (searchTerm: string): string => {
  if (!searchTerm || typeof searchTerm !== "string") {
    return "";
  }

  // Trim whitespace and escape special SQL wildcard characters
  // Order matters: escape backslashes first to avoid double-escaping
  return searchTerm
    .trim()
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/%/g, "\\%") // Escape percent signs (SQL wildcard for multiple characters)
    .replace(/_/g, "\\_"); // Escape underscores (SQL wildcard for single character)
};

export const normalizeKey = (str: string = "") =>
  str.toLowerCase().replace(/\s+/g, "_").trim();

export function generateUniqueUUID() {
  const timestamp = Date.now().toString(36); // Current timestamp in base-36
  const randomPart = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      const randomValue = (Math.random() * 16) | 0;
      const value = c === "x" ? randomValue : (randomValue & 0x3) | 0x8;
      return value.toString(16);
    }
  );

  return `${timestamp}-${randomPart}`;
}
