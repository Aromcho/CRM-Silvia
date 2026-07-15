import bcrypt from 'bcryptjs';

export const createHash = (password) => bcrypt.hash(password, 10);
export const verifyHash = (password, hash) => bcrypt.compare(password, hash);
