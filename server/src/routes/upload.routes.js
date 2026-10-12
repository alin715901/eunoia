const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { assetUrl, chooseSubdir } = require('../services/file.service');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return fail(res, 'no file');
    const sub = chooseSubdir(req.file.mimetype);
    const rel = assetUrl(req.file.filename, sub);
    ok(res, { path: rel });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
