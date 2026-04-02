const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/charts', express.static(path.join(__dirname, 'charts')));

// Azure Table Storage クライアント初期化
function getTableClient() {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) return null;
  return TableClient.fromConnectionString(connStr, 'rankings');
}

// ランキング取得 GET /api/ranking?song=&difficulty=
app.get('/api/ranking', async (req, res) => {
  const { song, difficulty } = req.query;
  if (!song || !difficulty) return res.status(400).json({ error: 'song and difficulty required' });

  const client = getTableClient();
  if (!client) {
    return res.json({ rankings: [], message: 'Storage not configured' });
  }

  try {
    const partitionKey = `${song}_${difficulty}`;
    const entities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${partitionKey}'` }
    });

    const rankings = [];
    for await (const entity of entities) {
      rankings.push({
        playerName: entity.playerName,
        score: entity.score,
        combo: entity.combo,
        accuracy: entity.accuracy,
        timestamp: entity.timestamp
      });
    }

    rankings.sort((a, b) => b.score - a.score);
    res.json({ rankings: rankings.slice(0, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

// スコア登録 POST /api/ranking
app.post('/api/ranking', async (req, res) => {
  const { song, difficulty, playerName, score, combo, accuracy } = req.body;
  if (!song || !difficulty || !playerName || score === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = getTableClient();
  if (!client) {
    return res.json({ success: true, message: 'Storage not configured (score not saved)' });
  }

  try {
    const timestamp = Date.now();
    await client.createEntity({
      partitionKey: `${song}_${difficulty}`,
      rowKey: `${timestamp}_${Math.random().toString(36).slice(2)}`,
      playerName: playerName.slice(0, 20),
      score: Number(score),
      combo: Number(combo) || 0,
      accuracy: Number(accuracy) || 0,
      timestamp
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// =============================================
// Socket.io マルチプレイヤー
// =============================================

// 待機中のルーム {songId_difficulty: roomId}
const waitingRooms = new Map();
// アクティブルーム {roomId: { players: [{socketId, name, score, combo, ready, finished, result}], songId, difficulty, state }}
const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getOnlineCount() {
  return io.engine.clientsCount || 0;
}

io.on('connection', (socket) => {
  console.log(`[MP] Player connected: ${socket.id}`);

  // オンライン人数を全員に配信
  io.emit('onlineCount', getOnlineCount());

  // --- ルーム再参加 (ページ遷移後) ---
  socket.on('rejoinRoom', ({ roomId: rid, playerName }) => {
    const room = rooms.get(rid);
    if (!room) {
      socket.emit('rejoinFailed', { message: 'Room not found' });
      return;
    }
    // 既存プレイヤーのsocketIdを更新
    const player = room.players.find(p => p.name === playerName);
    if (player) {
      const oldSocketId = player.socketId;
      player.socketId = socket.id;
      socket.join(rid);
      console.log(`[MP] Player ${playerName} rejoined room ${rid} (${oldSocketId} -> ${socket.id})`);
      socket.emit('rejoinSuccess', {
        roomId: rid,
        players: room.players.map(p => ({ name: p.name, socketId: p.socketId }))
      });
    } else {
      socket.emit('rejoinFailed', { message: 'Player not in room' });
    }
  });

  // --- マッチング開始 ---
  socket.on('findMatch', ({ songId, difficulty, playerName }) => {
    const key = `${songId}_${difficulty}`;
    console.log(`[MP] ${playerName} looking for match: ${key}`);

    // 既存の待機ルームがあるか？
    if (waitingRooms.has(key)) {
      const roomId = waitingRooms.get(key);
      const room = rooms.get(roomId);

      if (room && room.players.length === 1 && room.state === 'waiting') {
        // マッチ成立！
        room.players.push({
          socketId: socket.id,
          name: playerName,
          score: 0,
          combo: 0,
          ready: false,
          finished: false,
          result: null
        });
        room.state = 'matched';
        socket.join(roomId);
        waitingRooms.delete(key);

        console.log(`[MP] Match found! Room: ${roomId}`);

        // 両プレイヤーにマッチ成立を通知
        io.to(roomId).emit('matchFound', {
          roomId,
          songId: room.songId,
          difficulty: room.difficulty,
          players: room.players.map(p => ({ name: p.name, socketId: p.socketId }))
        });
        return;
      } else {
        // 無効なルームだったので削除
        waitingRooms.delete(key);
      }
    }

    // 新しい待機ルームを作成
    const roomId = generateRoomId();
    rooms.set(roomId, {
      players: [{
        socketId: socket.id,
        name: playerName,
        score: 0,
        combo: 0,
        ready: false,
        finished: false,
        result: null
      }],
      songId,
      difficulty,
      state: 'waiting'
    });
    waitingRooms.set(key, roomId);
    socket.join(roomId);

    console.log(`[MP] Waiting room created: ${roomId} for ${key}`);
    socket.emit('waitingForMatch', { roomId });
  });

  // --- マッチングキャンセル ---
  socket.on('cancelMatch', () => {
    cleanupPlayer(socket);
  });

  // --- ゲーム準備完了 ---
  socket.on('playerReady', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) player.ready = true;

    // 全員準備完了なら同時スタート
    if (room.players.every(p => p.ready)) {
      room.state = 'playing';
      console.log(`[MP] All ready, starting game in room: ${roomId}`);
      io.to(roomId).emit('gameStart', { roomId });
    }
  });

  // --- リアルタイムスコア同期 ---
  socket.on('scoreUpdate', ({ roomId, score, combo, judgment }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.score = score;
      player.combo = combo;
    }

    // 対戦相手に送信
    socket.to(roomId).emit('opponentUpdate', {
      socketId: socket.id,
      score,
      combo,
      judgment  // 'perfect' | 'good' | 'miss'
    });
  });

  // --- ゲーム終了 ---
  socket.on('gameFinished', ({ roomId, result }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.finished = true;
      player.result = result;
    }

    // 全員終了したら最終結果を送信
    if (room.players.every(p => p.finished)) {
      room.state = 'finished';
      const results = room.players.map(p => ({
        name: p.name,
        socketId: p.socketId,
        ...p.result
      }));
      // スコア順にソート
      results.sort((a, b) => b.score - a.score);

      console.log(`[MP] Game finished in room: ${roomId}`);
      io.to(roomId).emit('battleResult', { results });

      // ルームクリーンアップ (少し遅延)
      setTimeout(() => {
        rooms.delete(roomId);
      }, 30000);
    }
  });

  // --- 切断処理 ---
  socket.on('disconnect', () => {
    console.log(`[MP] Player disconnected: ${socket.id}`);
    cleanupPlayer(socket);
    io.emit('onlineCount', getOnlineCount());
  });
});

function cleanupPlayer(socket) {
  // 待機ルームから削除
  for (const [key, roomId] of waitingRooms.entries()) {
    const room = rooms.get(roomId);
    if (room && room.players.some(p => p.socketId === socket.id)) {
      waitingRooms.delete(key);
      rooms.delete(roomId);
      console.log(`[MP] Waiting room removed: ${roomId}`);
      return;
    }
  }

  // アクティブルームから削除 → 相手に通知
  for (const [roomId, room] of rooms.entries()) {
    const idx = room.players.findIndex(p => p.socketId === socket.id);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      if (room.players.length > 0) {
        io.to(roomId).emit('opponentDisconnected', {
          message: '対戦相手が切断しました'
        });
      }
      if (room.players.length === 0) {
        rooms.delete(roomId);
      }
      return;
    }
  }
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Taiko Game server running at http://localhost:${PORT}`);
});
