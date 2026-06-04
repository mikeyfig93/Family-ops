/* ============================================================
   FAMILY OPERATIONS CENTER — db.js
   IndexedDB abstraction layer
   ============================================================ */

const DB_NAME = 'FamilyOperationsDB';
const DB_VERSION = 1;

const DB = (() => {
  let _db = null;

  // ── OPEN / INIT ──────────────────────────────────────────
  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // people
        if (!db.objectStoreNames.contains('people')) {
          const s = db.createObjectStore('people', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name', 'name', { unique: false });
        }

        // events
        if (!db.objectStoreNames.contains('events')) {
          const s = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date', { unique: false });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('category', 'category', { unique: false });
        }

        // inboxItems
        if (!db.objectStoreNames.contains('inboxItems')) {
          const s = db.createObjectStore('inboxItems', { keyPath: 'id', autoIncrement: true });
          s.createIndex('createdDate', 'createdDate', { unique: false });
          s.createIndex('type', 'type', { unique: false });
        }

        // memories
        if (!db.objectStoreNames.contains('memories')) {
          const s = db.createObjectStore('memories', { keyPath: 'id', autoIncrement: true });
          s.createIndex('eventId', 'eventId', { unique: false });
          s.createIndex('createdDate', 'createdDate', { unique: false });
        }

        // spendingEntries
        if (!db.objectStoreNames.contains('spendingEntries')) {
          const s = db.createObjectStore('spendingEntries', { keyPath: 'id', autoIncrement: true });
          s.createIndex('eventId', 'eventId', { unique: false });
          s.createIndex('date', 'date', { unique: false });
          s.createIndex('category', 'category', { unique: false });
        }

        // milestones
        if (!db.objectStoreNames.contains('milestones')) {
          const s = db.createObjectStore('milestones', { keyPath: 'id', autoIncrement: true });
          s.createIndex('category', 'category', { unique: false });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('targetDate', 'targetDate', { unique: false });
        }

        // attachments
        if (!db.objectStoreNames.contains('attachments')) {
          const s = db.createObjectStore('attachments', { keyPath: 'id', autoIncrement: true });
          s.createIndex('parentId', 'parentId', { unique: false });
          s.createIndex('parentType', 'parentType', { unique: false });
        }

        // settings
        if (!db.objectStoreNames.contains('settings')) {
          const s = db.createObjectStore('settings', { keyPath: 'id', autoIncrement: true });
          s.createIndex('key', 'key', { unique: true });
        }
      };

      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = (e) => {
        reject(new Error('IndexedDB open failed: ' + e.target.error));
      };
    });
  }

  // ── GENERIC HELPERS ──────────────────────────────────────

  function getStore(storeName, mode = 'readonly') {
    const tx = _db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  // ── CRUD ─────────────────────────────────────────────────

  async function add(storeName, record) {
    await open();
    const store = getStore(storeName, 'readwrite');
    const id = await promisifyRequest(store.add(record));
    return { ...record, id };
  }

  async function put(storeName, record) {
    await open();
    const store = getStore(storeName, 'readwrite');
    const id = await promisifyRequest(store.put(record));
    return { ...record, id };
  }

  async function get(storeName, id) {
    await open();
    const store = getStore(storeName, 'readonly');
    return promisifyRequest(store.get(id));
  }

  async function getAll(storeName) {
    await open();
    const store = getStore(storeName, 'readonly');
    return promisifyRequest(store.getAll());
  }

  async function remove(storeName, id) {
    await open();
    const store = getStore(storeName, 'readwrite');
    return promisifyRequest(store.delete(id));
  }

  async function clear(storeName) {
    await open();
    const store = getStore(storeName, 'readwrite');
    return promisifyRequest(store.clear());
  }

  // ── INDEX QUERIES ────────────────────────────────────────

  async function getByIndex(storeName, indexName, value) {
    await open();
    const store = getStore(storeName, 'readonly');
    const idx = store.index(indexName);
    return promisifyRequest(idx.getAll(value));
  }

  async function getByRange(storeName, indexName, lower, upper) {
    await open();
    const store = getStore(storeName, 'readonly');
    const idx = store.index(indexName);
    const range = IDBKeyRange.bound(lower, upper);
    return promisifyRequest(idx.getAll(range));
  }

  // ── SETTINGS HELPERS ─────────────────────────────────────

  async function getSetting(key) {
    await open();
    const store = getStore('settings', 'readonly');
    const idx = store.index('key');
    const result = await promisifyRequest(idx.get(key));
    return result ? result.value : null;
  }

  async function setSetting(key, value) {
    await open();
    // get existing record by key first
    const store1 = getStore('settings', 'readonly');
    const idx = store1.index('key');
    const existing = await promisifyRequest(idx.get(key));
    const store2 = getStore('settings', 'readwrite');
    if (existing) {
      return promisifyRequest(store2.put({ ...existing, value }));
    } else {
      return promisifyRequest(store2.add({ key, value }));
    }
  }

  // ── BACKUP / RESTORE ─────────────────────────────────────

  const STORE_NAMES = [
    'people', 'events', 'inboxItems', 'memories',
    'spendingEntries', 'milestones', 'attachments', 'settings'
  ];

  async function exportAll() {
    await open();
    const result = {};
    for (const name of STORE_NAMES) {
      result[name] = await getAll(name);
    }
    return result;
  }

  async function importAll(data) {
    await open();
    for (const name of STORE_NAMES) {
      if (!data[name]) continue;
      await clear(name);
      const store = getStore(name, 'readwrite');
      for (const record of data[name]) {
        store.put(record);
      }
    }
    // wait for last transaction to settle
    await new Promise(r => setTimeout(r, 100));
  }

  // ── COUNT ────────────────────────────────────────────────

  async function count(storeName) {
    await open();
    const store = getStore(storeName, 'readonly');
    return promisifyRequest(store.count());
  }

  // ── PUBLIC API ───────────────────────────────────────────

  return {
    open,
    add,
    put,
    get,
    getAll,
    remove,
    clear,
    getByIndex,
    getByRange,
    getSetting,
    setSetting,
    exportAll,
    importAll,
    count,
    STORE_NAMES,
  };
})();
