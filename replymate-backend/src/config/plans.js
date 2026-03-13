const PLAN_LIMITS = {
  free: 25,
  pro: 100,
  pro_plus: 1000,
};

function getPlanLimit(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

module.exports = {
  PLAN_LIMITS,
  getPlanLimit,
};