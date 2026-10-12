const express = require('express');
const router = express.Router();
const notification = require('../services/notification.service');

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // 首条 connected 事件
  res.write('event: connected\ndata: {}\n\n');

  notification.addClient(res);

  // 保活
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      /* ignore */
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    notification.removeClient(res);
  });

  if (req.socket && typeof req.socket.setTimeout === 'function') {
    req.socket.setTimeout(0);
  }
});

module.exports = router;
