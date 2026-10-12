const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const ASSET_BASE = '/assets';
const UPLOAD_SUBDIRS = ['images', 'stickers', 'voices'];

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const sub of UPLOAD_SUBDIRS) {
    const p = path.join(UPLOAD_DIR, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
}

// 模块加载时即创建所需目录
ensureDirs();

module.exports = {
  PORT,
  DATA_DIR,
  UPLOAD_DIR,
  ASSET_BASE,
  UPLOAD_SUBDIRS,
  ensureDirs,
};
