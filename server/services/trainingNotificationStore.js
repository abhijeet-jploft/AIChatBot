/**
 * In-memory store for "Training completed" notification.
 * When scrapeSave succeeds, setLastTrainingCompleted(companyId) is called.
 * Dashboard shows "Training completed" if within NOTIFICATION_TTL_MS.
 */
const NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const store = new Map();

function setLastTrainingCompleted(companyId) {
  if (companyId) store.set(companyId, Date.now());
}

function getLastTrainingCompleted(companyId) {
  const ts = store.get(companyId);
  if (!ts) return null;
  if (Date.now() - ts > NOTIFICATION_TTL_MS) return null;
  return ts;
}

module.exports = { setLastTrainingCompleted, getLastTrainingCompleted };
