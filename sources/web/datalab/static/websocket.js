define(['util'], (util) => {

  // Override WebSocket
  (function() {
    if (!window.io) {
      // If socket.io was not loaded into the page, then do not override the existing
      // WebSocket functionality.
      return;
    }

    function WebSocketPolyfill(url) {
      var self = this;
      self._url = url;

      // This uses a SocketUI object to polyfill the WebSocket functionality
      if (window.useSocketIO) {
        this._readyState = WebSocketPolyfill.CLOSED;
        var socketUri = location.protocol + '//' + location.host + '/session';
        var socketOptions = {
          upgrade: false,
          multiplex: false
        };

        function errorHandler() {
          if (self.onerror) {
            self.onerror({ target: self });
          }
        }
        var socket = io.connect(socketUri, socketOptions);
        socket.on('connect', function() {
          socket.emit('start', { url: url });
        });
        socket.on('disconnect', function() {
          self._socket = null;
          self._readyState = WebSocketPolyfill.CLOSED;
          if (self.onclose) {
            self.onclose({ target: self });
          }
        });
        socket.on('open', function(msg) {
          self._socket = socket;
          self._readyState = WebSocketPolyfill.OPEN;
          if (self.onopen) {
            self.onopen({ target: self });
          }
        });
        socket.on('close', function(msg) {
          self._socket = null;
          self._readyState = WebSocketPolyfill.CLOSED;
          if (self.onclose) {
            self.onclose({ target: self });
          }
        });
        socket.on('data', function(msg) {
          if (self.onmessage) {
            self.onmessage({ target: self, data: msg.data });
          }
        });
        socket.on('error', errorHandler);
        socket.on('connect_error', errorHandler);
        socket.on('reconnect_error', errorHandler);

      } else {
        // a thin shim around the native WebSocket object to catch its onerror
        // and switch to SocketIO
        self._ws = new window.nativeWebSocket(url)
        self._ws.onopen = function() {
          self.onopen.apply(self, arguments);
        }
        self._ws.onclose = function() {
          self.onclose.apply(self, arguments);
        }
        self._ws.onmessage = function() {
          self.onmessage.apply(self, arguments);
        }
        self._ws.onerror = function() {
          util.debug.log('Native WebSocket failed. Replacing with socket.io');
          // save this state so we only switch on failure the first time
          window.useSocketIO = true;
        }
      }
    }
    WebSocketPolyfill.prototype = {
      onopen: null,
      onclose: null,
      onmessage: null,
      onerror: null,
      get readyState() {
        if (window.useSocketIO) {
          return this._readyState;
        } else {
          return this._ws.readyState;
        }
      },
      send: function(data) {
        if (window.useSocketIO) {
          if (this._readyState != WebSocketPolyfill.OPEN) {
            throw new Error('WebSocket is not yet opened');
          }
          this._socket.emit('data', { data: data });
        } else {
          this._ws.send.apply(this._ws, arguments);
        }
      },
      close: function() {
        if (window.useSocketIO) {
          if (this._readystate == WebSocketPolyfill.open) {
            this._readystate = WebSocketPolyfill.closed;

            this._socket.emit('stop', { url: this._url });
            this._socket.close();
          }
        } else {
          this._ws.close.apply(this._ws, arguments);
        }
      }
    }
    WebSocketPolyfill.CONNECTING = 0;
    WebSocketPolyfill.OPEN = 1;
    WebSocketPolyfill.CLOSING = 2;
    WebSocketPolyfill.CLOSED = 3;

    window.nativeWebSocket = window.WebSocket;
    window.WebSocket = WebSocketPolyfill;
  })();
});
