const path = require('path');
const fs = require('fs');

/**
 * Resolves a safe temporary build directory that works across
 * Linux (including Snap Docker), Windows (Docker Desktop/WSL2), and macOS.
 *
 * 1. Honors CLOUDOPS_TEMP_DIR environment variable if specified.
 * 2. Defaults to <backend>/temp which resides inside user workspace and avoids
 *    OS-level /tmp sandbox isolation (e.g. Snap AppArmor, private mounts).
 * 3. Normalizes path format across Windows and POSIX.
 *
 * @param {string} [subfolder=''] - Optional subfolder name (e.g., 'cloudops-<id>')
 * @returns {string} Fully resolved, guaranteed-to-exist absolute path
 */
function getBuildDir(subfolder = '') {
  const baseDir = process.env.CLOUDOPS_TEMP_DIR
    ? path.resolve(process.env.CLOUDOPS_TEMP_DIR)
    : path.resolve(__dirname, '../../temp');

  const resolved = subfolder ? path.join(baseDir, subfolder) : baseDir;

  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }

  return resolved;
}

module.exports = {
  getBuildDir,
};
