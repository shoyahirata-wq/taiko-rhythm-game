const express = require('express');
const path = require('path');
const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Azure Table Storage クライアント初期化
function getTableClient() {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) return null;
  return TableClient.fromConnectionString(connStr, 'rankings');
}

// ランキング取得 GET /api/ranking?song=song1&difficulty=normal
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

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Taiko Game server running at http://localhost:${PORT}`);
});
