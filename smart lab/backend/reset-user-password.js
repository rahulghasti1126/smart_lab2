import mongoose from 'mongoose';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { User, hashPassword } from './database.js';

const mongoUri = process.env.MONGO_URI?.trim();

if (!mongoUri) {
  console.error('MONGO_URI is missing from backend/.env.');
  process.exit(1);
}

const mongoUrl = new URL(mongoUri);
const databaseName = decodeURIComponent(mongoUrl.pathname.slice(1)) || '(default database)';

const readHidden = (prompt) => new Promise((resolve, reject) => {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    reject(new Error('Run this script in an interactive terminal so the password can be hidden.'));
    return;
  }

  output.write(prompt);
  input.setRawMode(true);
  input.resume();

  let value = '';
  const onData = (chunk) => {
    const character = chunk.toString();

    if (character === '\u0003') {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      output.write('\n');
      reject(new Error('Password reset cancelled.'));
      return;
    }

    if (character === '\r' || character === '\n') {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      output.write('\n');
      resolve(value);
      return;
    }

    if (character === '\u007f' || character === '\b') {
      value = value.slice(0, -1);
      return;
    }

    if (character >= ' ') value += character;
  };

  input.on('data', onData);
});

const prompt = readline.createInterface({ input, output });

try {
  output.write(`MongoDB host: ${mongoUrl.host}\nDatabase: ${databaseName}\n`);
  const username = (await prompt.question('Username to reset: ')).trim().toLowerCase();
  if (!username) throw new Error('Username is required.');

  const confirmation = await prompt.question(`Type RESET ${username} to continue: `);
  if (confirmation !== `RESET ${username}`) throw new Error('Confirmation did not match; no password was changed.');
  prompt.close();

  const newPassword = await readHidden('New password (hidden): ');
  const confirmPassword = await readHidden('Confirm new password (hidden): ');
  if (!newPassword) throw new Error('Password cannot be empty.');
  if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');

  await mongoose.connect(mongoUri);
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const user = await User.findOne({ username: new RegExp(`^${escapedUsername}$`, 'i') });
  if (!user) throw new Error(`No account found for username "${username}".`);

  user.password_hash = await hashPassword(newPassword);
  await user.save();
  console.log(`Password reset successfully for "${user.username}".`);
} catch (error) {
  console.error(`Password reset failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  prompt.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
