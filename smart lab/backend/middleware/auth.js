import jwt from 'jsonwebtoken';
import { User } from '../database.js';

export const protect = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication is required.' });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ error: 'JWT authentication is not configured.' });
  }
  // Existing local-development installations may still have an older short
  // secret. Keep them functional in development, but never permit that setup
  // in a production deployment.
  if (process.env.JWT_SECRET.length < 32 && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ error: 'JWT authentication is not configured securely.' });
  }

  try {
    const decoded = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    req.user = await User.findOne({ id: decoded.id }).select('-password_hash');
    if (!req.user) return res.status(401).json({ error: 'User account no longer exists.' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Session is invalid or has expired.' });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Not authorized as an admin' });
  }
};

export const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Your laboratory role is not allowed to perform this action.' });
  }
  return next();
};
