/**
 * Modul Keselamatan & Pengesahan Pentadbir (Admin Auth Middleware)
 * Menggunakan JWT (JSON Web Tokens) untuk melindungi endpoint pengurusan.
 */

import jwt from 'jsonwebtoken';
import db from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'autobot_wszia_super_secret_production_key_2026';

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Akses ditolak. Token pengesahan diperlukan.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Token tidak sah atau telah tamat tempoh.' });
  }
}
