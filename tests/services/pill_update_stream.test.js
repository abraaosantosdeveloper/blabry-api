const EventEmitter = require('events');
const pillUpdateStream = require('../../services/pill_update_stream');

function response() {
  const res = new EventEmitter();
  res.writableEnded = false;
  res.destroyed = false;
  res.messages = [];
  res.write = (message) => res.messages.push(message);
  return res;
}

afterEach(() => {
  jest.useRealTimers();
});

describe('pill update stream', () => {
  it('publica para outros usuários, mas não para o autor', () => {
    const author = response();
    const viewer = response();
    pillUpdateStream.subscribe(author, 'author-id');
    pillUpdateStream.subscribe(viewer, 'viewer-id');

    pillUpdateStream.publish('new-post', {}, 'author-id');

    expect(author.messages).toHaveLength(0);
    expect(viewer.messages).toEqual([
      'event: new-post\ndata: {}\n\n',
    ]);

    author.emit('close');
    viewer.emit('close');
    expect(pillUpdateStream.subscriberCount()).toBe(0);
  });

  it('envia heartbeat enquanto a conexão permanece aberta', () => {
    jest.useFakeTimers();
    const viewer = response();
    pillUpdateStream.subscribe(viewer, 'viewer-id');

    jest.advanceTimersByTime(25_000);

    expect(viewer.messages).toContain(': keep-alive\n\n');
    viewer.emit('close');
  });
});