const http = require('http');
const fs = require('fs');
const path = require('path');
const { runAutoSync, getLastSyncTime, getIsRunning } = require('./sync_naver');

const PORT = 3000;
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1시간 주기 자동 수집
let nextSyncTime = Date.now() + SYNC_INTERVAL_MS;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlParts = req.url.split('?');
  const reqPath = urlParts[0];

  // API 1: 실시간 동기화 상태 조회 (/api/status)
  if (reqPath === '/api/status' && req.method === 'GET') {
    const alertsPath = path.join(__dirname, 'latest_alerts.json');
    let alertsCount = 0;
    if (fs.existsSync(alertsPath)) {
      try {
        const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
        alertsCount = Array.isArray(alerts) ? alerts.length : 0;
      } catch (e) {}
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      isSyncing: getIsRunning(),
      lastSyncTime: getLastSyncTime() ? getLastSyncTime().toISOString() : null,
      nextSyncTime: new Date(nextSyncTime).toISOString(),
      intervalMinutes: 60,
      alertsCount: alertsCount,
      serverTime: new Date().toISOString()
    }));
    return;
  }

  // API 2: 최신 포착된 신규 매물 목록 (/api/alerts)
  if (reqPath === '/api/alerts' && req.method === 'GET') {
    const alertsPath = path.join(__dirname, 'latest_alerts.json');
    let alerts = [];
    if (fs.existsSync(alertsPath)) {
      try {
        alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
      } catch (e) {}
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      success: true,
      count: alerts.length,
      alerts: alerts
    }));
    return;
  }

  // API 3: 지금 즉시 수집 트리거 (/api/sync-now)
  if (reqPath === '/api/sync-now' && (req.method === 'POST' || req.method === 'GET')) {
    if (getIsRunning()) {
      res.writeHead(409, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: false, message: '이미 수집 작업이 진행 중입니다.' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ success: true, message: '실시간 네이버 수집을 시작했습니다.' }));

    // 백그라운드에서 즉시 수집 실행
    runAutoSync({ autoPush: true }).then(() => {
      nextSyncTime = Date.now() + SYNC_INTERVAL_MS;
    }).catch(err => {
      console.error('즉시 수집 중 오류:', err);
    });
    return;
  }

  // 정적 파일 서빙
  let filePath = path.join(__dirname, reqPath === '/' ? '/index.html' : reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('\n================================================================');
  console.log(`🚀 [부산 500세대+ 대단지 레이더 서버] 가동 완료!`);
  console.log(`📡 웹 대시보드 주소: http://localhost:${PORT}/`);
  console.log(`⏱️ 1시간 주기 실시간 네이버 자동 수집 및 신규 매물 감지가 활성화되었습니다.`);
  console.log(`   - 다음 자동 수집 예정시각: ${new Date(nextSyncTime).toLocaleTimeString('ko-KR')}`);
  console.log('================================================================\n');

  // 1시간 주기 정기 스케줄러 등록
  setInterval(async () => {
    console.log(`\n⏰ [1시간 주기 정기 수집 가동] ${new Date().toLocaleTimeString('ko-KR')}`);
    try {
      await runAutoSync({ autoPush: true });
      nextSyncTime = Date.now() + SYNC_INTERVAL_MS;
      console.log(`다음 자동 수집 예정시각: ${new Date(nextSyncTime).toLocaleTimeString('ko-KR')}`);
    } catch (e) {
      console.error('정기 자동 수집 중 오류:', e);
    }
  }, SYNC_INTERVAL_MS);
});
