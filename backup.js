/* ============================================================
   FAMILY OPERATIONS CENTER — backup.js
   Export / Import JSON backup of the entire IndexedDB database
   ============================================================ */

const Backup = (() => {

  // ── EXPORT ───────────────────────────────────────────────
  async function exportBackup() {
    try {
      const data = await DB.exportAll();

      // Stamp the backup
      data._meta = {
        appName: 'FamilyOperationsCenter',
        version: 1,
        exportedAt: new Date().toISOString(),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);

      // Build filename: family-operations-backup-YYYY-MM-DD.json
      const today = new Date();
      const ymd = today.toISOString().slice(0, 10);
      const filename = `family-operations-backup-${ymd}.json`;

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      return { success: true, filename };
    } catch (err) {
      console.error('Backup export failed:', err);
      return { success: false, error: err.message };
    }
  }

  // ── IMPORT ───────────────────────────────────────────────
  async function importBackup(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('No file provided')); return; }
      if (!file.name.endsWith('.json')) {
        reject(new Error('File must be a .json backup file'));
        return;
      }

      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const raw = e.target.result;
          const data = JSON.parse(raw);

          // Validate
          const result = validateBackup(data);
          if (!result.valid) {
            reject(new Error(result.error));
            return;
          }

          // Remove meta before storing
          delete data._meta;

          await DB.importAll(data);
          resolve({ success: true });
        } catch (err) {
          reject(new Error('Failed to parse backup: ' + err.message));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // ── VALIDATE ─────────────────────────────────────────────
  function validateBackup(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid backup file: not a JSON object' };
    }

    if (!data._meta) {
      return { valid: false, error: 'Invalid backup file: missing metadata' };
    }

    if (data._meta.appName !== 'FamilyOperationsCenter') {
      return { valid: false, error: 'Invalid backup file: wrong application' };
    }

    // Must have at least one known store
    const hasStores = DB.STORE_NAMES.some(name => Array.isArray(data[name]));
    if (!hasStores) {
      return { valid: false, error: 'Backup contains no recognizable data stores' };
    }

    return { valid: true };
  }

  // ── GET STORAGE INFO ─────────────────────────────────────
  async function getStorageInfo() {
    const counts = {};
    for (const name of DB.STORE_NAMES) {
      counts[name] = await DB.count(name);
    }

    // Estimate size by serializing
    let estimatedBytes = 0;
    try {
      const data = await DB.exportAll();
      estimatedBytes = new Blob([JSON.stringify(data)]).size;
    } catch (_) { /* ignore */ }

    return {
      counts,
      estimatedBytes,
      estimatedKB: (estimatedBytes / 1024).toFixed(1),
    };
  }

  // ── PUBLIC ───────────────────────────────────────────────
  return {
    exportBackup,
    importBackup,
    validateBackup,
    getStorageInfo,
  };
})();
