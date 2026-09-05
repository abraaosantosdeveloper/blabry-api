const subscribers = new Set();

function subscribe(res, userId) {
  const subscriber = { res, userId };
  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    res.write(': keep-alive\n\n');
  }, 25_000);
  subscriber.heartbeat = heartbeat;

  subscribers.add(subscriber);
  res.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(subscriber);
  });
}

function publish(event, data = {}, authorId = null) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const subscriber of subscribers) {
    const { res, userId } = subscriber;
    if (userId === authorId) continue;

    if (res.writableEnded || res.destroyed) {
      clearInterval(subscriber.heartbeat);
      subscribers.delete(subscriber);
      continue;
    }

    res.write(message);
  }
}

function subscriberCount() {
  return subscribers.size;
}

module.exports = { subscribe, publish, subscriberCount };