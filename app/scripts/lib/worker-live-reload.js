import browserGlobal from './browser-global';
import extension from './extension-api';

export default function connectLiveReload() {
  const socket = new browserGlobal.WebSocket('ws://localhost:35729/livereload');
  socket.onopen = () =>
    socket.send(
      JSON.stringify({
        command: 'hello',
        protocols: ['http://livereload.com/protocols/official-7'],
        ver: '1.0',
        snipver: 1,
      }),
    );
  socket.onmessage = ({ data }) => {
    if (JSON.parse(data).command === 'reload') {
      extension.runtime.reload();
    }
  };
  socket.onclose = () => setTimeout(connectLiveReload, 1000);
}
