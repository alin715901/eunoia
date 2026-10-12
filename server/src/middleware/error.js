function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  res.status(500).json({ code: 1, msg: err.message || 'Internal Server Error' });
}

function apiNotFound(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ code: 1, msg: 'Not found' });
  }
  next();
}

module.exports = { errorHandler, apiNotFound };
