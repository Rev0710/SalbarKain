function errorHandler(error, _req, res, _next) {
  let status = Number(error.statusCode || error.status) || 500;
  let code = error.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    status = 400;
    code = 'VALIDATION_ERROR';
  } else if (error.code === 11000) {
    status = 409;
    code = 'DUPLICATE_RESOURCE';
  } else if (error.name === 'MulterError') {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD';
  }

  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const message = safeStatus === 500 && process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred.'
    : error.message || 'An unexpected error occurred.';

  if (safeStatus >= 500) console.error(error);
  return res.status(safeStatus).json({ success: false, code, message });
}

module.exports = errorHandler;
