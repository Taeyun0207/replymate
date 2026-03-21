const PLAN_LIMITS = {
  free: 25,
  pro: 100,
  pro_plus: 1000,
};

const TRANSLATION_LIMIT_FREE = 10;   // per day
const TRANSLATION_LIMIT_PRO = 30;    // per day

function getPlanLimit(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

function getTranslationLimit(plan) {
  if (plan === "pro_plus") return null; // unlimited
  if (plan === "pro") return TRANSLATION_LIMIT_PRO;
  return TRANSLATION_LIMIT_FREE;
}

function getTranslationResetType(plan) {
  if (plan === "pro_plus") return null;
  if (plan === "pro") return "daily";
  return "daily";
}

module.exports = {
  PLAN_LIMITS,
  TRANSLATION_LIMIT_FREE,
  TRANSLATION_LIMIT_PRO,
  getPlanLimit,
  getTranslationLimit,
  getTranslationResetType,
};