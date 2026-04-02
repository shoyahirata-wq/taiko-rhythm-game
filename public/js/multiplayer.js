// =============================================
// マルチプレイヤー通信モジュール (Socket.io)
// =============================================
const Multiplayer = (() => {
  let socket = null;
  let roomId = null;
  let isConnected = false;
  let playerName = '';
  let opponentName = '';
  let mySocketId = '';

  // コールバック
  const callbacks = {
    onWaiting: null,
    onMatchFound: null,
    onGameStart: null,
    onOpponentUpdate: null,
    onOpponentDisconnected: null,
    onBattleResult: null,
    onOnlineCount: null
  };

  function connect() {
    if (socket && socket.connected) return;
    if (socket) { socket.disconnect(); socket = null; }
    socket = io({ reconnection: true, reconnectionDelay: 1000 });

    socket.on('connect', () => {
      isConnected = true;
      mySocketId = socket.id;
      console.log('[MP Client] Connected:', socket.id);
    });

    socket.on('disconnect', () => {
      isConnected = false;
      console.log('[MP Client] Disconnected');
    });

    // オンライン人数
    socket.on('onlineCount', (count) => {
      if (callbacks.onOnlineCount) callbacks.onOnlineCount(count);
    });

    // マッチング待機中
    socket.on('waitingForMatch', ({ roomId: rid }) => {
      roomId = rid;
      console.log('[MP Client] Waiting in room:', rid);
      if (callbacks.onWaiting) callbacks.onWaiting(rid);
    });

    // マッチ成立
    socket.on('matchFound', (data) => {
      roomId = data.roomId;
      const opponent = data.players.find(p => p.socketId !== mySocketId);
      opponentName = opponent ? opponent.name : '???';
      console.log('[MP Client] Match found! Opponent:', opponentName);
      if (callbacks.onMatchFound) callbacks.onMatchFound(data);
    });

    // ゲーム開始
    socket.on('gameStart', (data) => {
      console.log('[MP Client] Game start!');
      if (callbacks.onGameStart) callbacks.onGameStart(data);
    });

    // 相手スコア更新
    socket.on('opponentUpdate', (data) => {
      if (callbacks.onOpponentUpdate) callbacks.onOpponentUpdate(data);
    });

    // 相手切断
    socket.on('opponentDisconnected', (data) => {
      console.log('[MP Client] Opponent disconnected');
      if (callbacks.onOpponentDisconnected) callbacks.onOpponentDisconnected(data);
    });

    // 対戦結果
    socket.on('battleResult', (data) => {
      console.log('[MP Client] Battle result:', data);
      if (callbacks.onBattleResult) callbacks.onBattleResult(data);
    });
  }

  // rejoinRoomはPromiseを返す（完了を待てる）
  function rejoinRoom(rid, name) {
    return new Promise((resolve, reject) => {
      if (!socket) connect();
      playerName = name;
      roomId = rid;

      function doRejoin() {
        // 一度だけ成功/失敗を受け取る
        socket.once('rejoinSuccess', (data) => {
          roomId = data.roomId;
          console.log('[MP Client] Rejoin success:', data.roomId);
          resolve(data);
        });
        socket.once('rejoinFailed', (data) => {
          console.log('[MP Client] Rejoin failed:', data.message);
          reject(data);
        });
        socket.emit('rejoinRoom', { roomId: rid, playerName: name });
      }

      if (socket.connected) {
        doRejoin();
      } else {
        socket.once('connect', doRejoin);
      }
    });
  }

  function findMatch(songId, difficulty, name) {
    if (!socket) connect();
    playerName = name;
    socket.emit('findMatch', { songId, difficulty, playerName: name });
  }

  function cancelMatch() {
    if (socket) {
      socket.emit('cancelMatch');
      roomId = null;
    }
  }

  function sendReady() {
    if (socket && roomId) {
      socket.emit('playerReady', { roomId });
    }
  }

  function sendScoreUpdate(score, combo, judgment) {
    if (socket && roomId) {
      socket.emit('scoreUpdate', { roomId, score, combo, judgment });
    }
  }

  function sendGameFinished(result) {
    if (socket && roomId) {
      socket.emit('gameFinished', { roomId, result });
    }
  }

  function on(event, callback) {
    if (callbacks.hasOwnProperty('on' + event.charAt(0).toUpperCase() + event.slice(1))) {
      callbacks['on' + event.charAt(0).toUpperCase() + event.slice(1)] = callback;
    }
  }

  function getRoomId()      { return roomId; }
  function getMySocketId()  { return mySocketId; }
  function getOpponentName(){ return opponentName; }
  function getPlayerName()  { return playerName; }
  function getIsConnected() { return isConnected; }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
      isConnected = false;
      roomId = null;
    }
  }

  return {
    connect,
    rejoinRoom,
    findMatch,
    cancelMatch,
    sendReady,
    sendScoreUpdate,
    sendGameFinished,
    on,
    getRoomId,
    getMySocketId,
    getOpponentName,
    getPlayerName,
    getIsConnected,
    disconnect
  };
})();
