const multer = require('multer');
const path = require('path');
const { UPLOAD_DIR } = require('../config');
const { chooseSubdir } = require('../services/file.service');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const sub = chooseSubdir(file.mimetype);
    cb(null, path.join(UPLOAD_DIR, sub));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = upload;
