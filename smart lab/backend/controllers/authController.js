import { User, hashPassword, verifyPassword, AuditLog } from '../database.js';
import jwt from 'jsonwebtoken';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const logAudit = async (event, subject, actor, details) => {
  try {
    await AuditLog.create({
      event,
      subject,
      actor,
      timestamp: new Date().toISOString(),
      details,
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    const normalizedUsername = username?.toLowerCase?.().trim();
    if (!normalizedUsername || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const escapedUsername = normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({ username: new RegExp(`^${escapedUsername}$`, 'i') });
    const verification = user ? await verifyPassword(password, user.password_hash) : { valid: false };
    if (!user || !verification.valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // One-time, transparent migration of legacy SHA-256 records after a
    // successful password check.  New accounts always start with bcrypt.
    if (verification.needsUpgrade) {
      user.password_hash = await hashPassword(password);
      await user.save();
    }
    
    await logAudit('login', user.id, user.id, `User ${user.username} logged in`);
    
    res.json({
      id: user.id, username: user.username, name: user.name, role: user.role,
      token: generateToken(user.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const registerUser = async (req, res) => {
  try {
    const { username, password, name, role = 'technician' } = req.body;
    const normalizedUsername = username?.toLowerCase?.().trim();
    const normalizedName = name?.trim?.();

    if (!normalizedUsername || !password || !normalizedName) {
      return res.status(400).json({ error: 'Username, password, and name are required.' });
    }
    if (password.length < 12) return res.status(400).json({ error: 'Password must have at least 12 characters.' });
    if (!['admin', 'pathologist', 'technician'].includes(role)) return res.status(400).json({ error: 'Invalid laboratory role.' });

    const existing = await User.findOne({ username: normalizedUsername });
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const passwordHash = await hashPassword(password);
    const userId = `U${Date.now()}`;

    const user = await User.create({
      id: userId,
      username: normalizedUsername,
      password_hash: passwordHash,
      name: normalizedName,
      role,
      created_at: new Date().toISOString(),
    });

    await logAudit('user_registered', normalizedUsername, req.user?.id || 'system', `New user ${normalizedUsername} registered as ${role}`);
    
    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
