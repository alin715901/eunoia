const { UPLOAD_DIR, ASSET_BASE } = require('../config');

// 根据 MIME 选择上传子目录
function chooseSubdir(mimetype) {
  if (!mimetype) return 'images';
  if (mimetype.startsWith('audio')) return 'voices';
  if (mimetype === 'image/gif') return 'stickers';
  return 'images';
}

// 生成相对于 /assets 的访问 URL
function assetUrl(filename, subdir) {
  return `${ASSET_BASE}/${subdir}/${filename}`;
}

module.exports = {
  UPLOAD_DIR,
  ASSET_BASE,
  chooseSubdir,
  assetUrl,
};
