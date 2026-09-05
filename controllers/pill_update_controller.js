const pillUpdateStream = require('../services/pill_update_stream');

function stream(req, res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  res.write(': connected\n\n');
  pillUpdateStream.subscribe(res, req.userId);
}

module.exports = { stream };