'use strict';

function paginated(data, { page, pageSize }, total) {
  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

module.exports = { paginated };
