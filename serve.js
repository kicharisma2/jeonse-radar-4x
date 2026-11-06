const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { runAutoSync, getLastSyncTime, getIsRunning, getLastPushStatus, getLastSyncMeta } = require('./sync_naver');

const ROOT_DIR = (typeof process.pkg !== 'undefined') ? path.dirname(process.execPath) : __dirname;
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

// =============================================================
// 단일 파일 독립 실행 보장 (Standalone Self-Contained Assets)
// 단일 .exe 파일만 복사해서 어디서 실행하든 자체 내장 리소스를 자동 동기화합니다.
// =============================================================
function ensureStandaloneAssets() {
  if (typeof process.pkg === 'undefined') return;

  const appAssets = ['index.html', 'style.css', 'app.js', 'data.js', 'latest_alerts.json'];
  for (const asset of appAssets) {
    const diskPath = path.join(ROOT_DIR, asset);
    const bundledPath = path.join(__dirname, asset);

    if (fs.existsSync(bundledPath)) {
      // index.html, style.css, app.js는 최신 버전 바이너리일 경우 항상 디스크로 덮어쓰기 동기화
      if (asset === 'index.html' || asset === 'style.css' || asset === 'app.js') {
        try {
          fs.copyFileSync(bundledPath, diskPath);
        } catch (e) {
          console.warn(`[Asset Sync] ${asset} 갱신 실패:`, e.message);
        }
      } else {
        // data.js, latest_alerts.json은 기존 수집 데이터가 없을 때만 번들에서 초기 추출
        if (!fs.existsSync(diskPath)) {
          try {
            fs.copyFileSync(bundledPath, diskPath);
            console.log(`[Asset Init] ${asset} 초기 데이터 추출 완료.`);
          } catch (e) {
            console.warn(`[Asset Init] ${asset} 추출 실패:`, e.message);
          }
        }
      }
    }
  }
}
ensureStandaloneAssets();

const server = http.createServer((req, res) => {
  const urlParts = req.url.split('?');
  const reqPath = urlParts[0];

  // API 1: 실시간 동기화 상태 조회 (/api/status)
  if (reqPath === '/api/status' && req.method === 'GET') {
    let alertsPath = path.join(ROOT_DIR, 'latest_alerts.json');
    if (!fs.existsSync(alertsPath)) alertsPath = path.join(__dirname, 'latest_alerts.json');
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
      lastSyncMeta: (typeof getLastSyncMeta === 'function') ? getLastSyncMeta() : null,
      lastPushStatus: (typeof getLastPushStatus === 'function') ? getLastPushStatus() : null,
      nextSyncTime: new Date(nextSyncTime).toISOString(),
      intervalMinutes: 60,
      alertsCount: alertsCount,
      serverTime: new Date().toISOString()
    }));
    return;
  }

  // API 2: 최신 포착된 신규 매물 목록 (/api/alerts)
  if (reqPath === '/api/alerts' && req.method === 'GET') {
    let alertsPath = path.join(ROOT_DIR, 'latest_alerts.json');
    if (!fs.existsSync(alertsPath)) alertsPath = path.join(__dirname, 'latest_alerts.json');
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

  // API 4: 서버 안전 종료 (/api/shutdown)
  if (reqPath === '/api/shutdown') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ success: true, message: '레이더 서버를 종료합니다.' }));
    setTimeout(() => process.exit(0), 300);
    return;
  }

  // 정적 파일 서빙 (외부 폴더 파일 우선, 없으면 번들 파일)
  let filePath = path.join(ROOT_DIR, reqPath === '/' ? '/index.html' : reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, reqPath === '/' ? '/index.html' : reqPath);
  }

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

function keepWindowOpen() {
  console.log('\n창을 닫으려면 아무 키나 누르세요...');
  try {
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    readline.question('', () => process.exit(1));
  } catch (e) {}
}

process.on('uncaughtException', (err) => {
  console.error('\n❌ 실행 중 예기치 않은 오류가 발생했습니다:');
  console.error(err);
  keepWindowOpen();
});

let currentPort = 3000;
const MAX_PORT = 3010;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (currentPort < MAX_PORT) {
      currentPort++;
      console.log(`⚠️ 포트 ${currentPort - 1}번이 이미 사용 중입니다. 포트 ${currentPort}번으로 자동 전환합니다...`);
      setTimeout(() => startServer(currentPort), 200);
    } else {
      console.error(`❌ 포트 3000~${MAX_PORT}번이 모두 사용 중입니다. 기존에 실행 중인 레이더 창을 닫고 다시 켜주세요.`);
      keepWindowOpen();
    }
  } else {
    console.error('❌ 서버 실행 오류:', err);
    keepWindowOpen();
  }
});

function startServer(port) {
  server.listen(port, () => {
    currentPort = port;
    console.log('\n================================================================');
    console.log(`🏢 [부산 500세대+ 대단지 레이더] 가동 성공!`);
    console.log(`📡 웹 대시보드 주소: http://localhost:${port}/`);
    if (port !== 3000) {
      console.log(`ℹ️ 기본 포트(3000)가 다른 프로그램에서 사용 중이어서 ${port}번으로 안전하게 연결되었습니다.`);
    }
    console.log(`⏱️ 1시간 주기 실시간 네이버 자동 수집 및 신규 매물 감지 엔진 가동 중`);
    console.log(`   - 다음 자동 수집 예정시각: ${new Date(nextSyncTime).toLocaleTimeString('ko-KR')}`);
    console.log('----------------------------------------------------------------');
    console.log('💡 [안내] 이 창을 최소화해 두시면 1시간마다 최신 매물이 자동으로 수집됩니다.');
    console.log('          종료하시려면 이 창을 닫으시면 됩니다.');
    console.log('================================================================\n');

    // 웹 브라우저 자동 오픈 (깔끔한 독립 앱 창 --app 모드 실행)
    if (process.env.JEONSE_RADAR_GUI !== '1') {
      try {
        const candidateBrowsers = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ];
        const browser = candidateBrowsers.find(b => fs.existsSync(b));
        if (browser) {
          const { spawn } = require('child_process');
          spawn(browser, [`--app=http://localhost:${port}/`, '--window-size=1600,1000'], { detached: true, stdio: 'ignore' }).unref();
        } else {
          exec(`start http://localhost:${port}/`);
        }
      } catch (e) {
        exec(`start http://localhost:${port}/`);
      }
    }

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
}

startServer(currentPort);
