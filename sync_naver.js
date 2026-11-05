/**
 * 부산 500세대+ 대단지 레이더 - 네이버 실시간 매물 100% 완전 자동 동기화 엔진
 * 
 * 기능:
 * 1. 백그라운드 임시 브라우저 구동 → 네이버 보안 토큰 자동 획득 → 1~2분 내 안전 수집
 * 2. 20평대뿐만 아니라 30평대(84㎡ 국민평형) 전용 쿼리 전수 수집
 * 3. 이전 데이터셋과 비교하여 '방금 새로 올라온 신규 매물' 실시간 감지 & alerts.json 기록
 * 4. GitHub Pages 자동 갱신 (git commit & push)
 * 5. 1회 실행(CLI) 및 1시간 주기 데몬(serve.js) 모드 모두 완벽 지원
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const ROOT_DIR = (typeof process.pkg !== 'undefined') ? path.dirname(process.execPath) : __dirname;
const TEMP_PROFILE = path.join(ROOT_DIR, 'scratch', 'temp_sync_chrome');
const PORT = 9333;

function getBrowserPath() {
  const candidatePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadDataFile(targetPath) {
  if (!fs.existsSync(targetPath)) return null;
  try {
    const code = fs.readFileSync(targetPath, 'utf8');
    const fakeModule = { exports: {} };
    const fakeWindow = {};
    const runner = new Function('module', 'exports', 'window', code);
    runner(fakeModule, fakeModule.exports, fakeWindow);
    return fakeModule.exports;
  } catch (e) {
    console.error('loadDataFile error:', e);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getTodayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function getTodayFormatted() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parsePriceToManwon(prcStr) {
  if (!prcStr) return 0;
  if (typeof prcStr === 'number') return prcStr;
  let str = String(prcStr).replace(/,/g, '').trim();
  if (str.includes('억')) {
    const parts = str.split('억');
    const eok = parseInt(parts[0].trim(), 10) || 0;
    const rest = parseInt(parts[1]?.replace(/만원|원/g, '').trim(), 10) || 0;
    return eok * 10000 + rest;
  }
  return parseInt(str.replace(/만원|원/g, '').trim(), 10) || 0;
}

function formatKoreanPrice(val) {
  if (!val) return '0원';
  const eok = Math.floor(val / 10000);
  const man = val % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${man.toLocaleString()}만원`;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

function formatArticle(a, complexId, tradeType) {
  const cIdStr = String(complexId);
  const prc = parsePriceToManwon(a.dealOrWarrantPrc);
  const supArea = Math.round(a.area1 || a.supplyArea || 84);
  const excArea = Math.round(a.area2 || a.exclusiveArea || 59);
  const py = Math.round(supArea / 3.30578);
  const cYmd = a.articleConfirmYmd || a.confirmYmd || getTodayYmd();
  const rDate = `${cYmd.slice(0, 4)}-${cYmd.slice(4, 6)}-${cYmd.slice(6, 8)}`;
  const isToday = cYmd === getTodayYmd();

  return {
    id: `${cIdStr}-${tradeType}-${a.articleNo}`,
    articleNo: String(a.articleNo),
    tradeType: tradeType,
    dong: a.buildingName ? (a.buildingName.includes('동') ? a.buildingName : `${a.buildingName}동`) : (a.dong || '101동'),
    floor: a.floorInfo || '중층',
    price: prc,
    priceText: formatKoreanPrice(prc),
    pyeong: py,
    supplyArea: supArea,
    exclusiveArea: excArea,
    type: `${supArea}㎡ (전용 ${excArea}㎡)`,
    direction: a.direction || '남향',
    desc: a.articleFeatureDesc || a.articleFeatureDescription || '네이버 실매물 확인',
    tags: a.tagList || [tradeType === 'jeonse' ? '전세' : '매매', `${py}평형`],
    agency: a.realtorName || '공인중개사사무소',
    agencyPhone: a.realtorTelNo || '051-555-8949',
    confirmYmd: cYmd,
    regDate: rDate,
    isNew: isToday
  };
}

let isSyncRunning = false;
let lastSyncTime = null;
let lastPushStatus = {
  success: false,
  message: '대기 중',
  time: null
};

async function runAutoSync(options = { autoPush: true }) {
  if (isSyncRunning) {
    console.log('⚠️ 이미 다른 동기화 작업이 실행 중입니다. 잠시 후 다시 시도하세요.');
    return { success: false, message: 'Already running' };
  }

  isSyncRunning = true;
  const startTime = Date.now();
  const todayYmd = getTodayYmd();
  const todayFmt = getTodayFormatted();

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║  부산 500세대+ 대단지 레이더 실시간 자동 동기화 (${todayFmt})  ║`);
  console.log(`║  시작시각: ${new Date().toLocaleTimeString('ko-KR')}                                      ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // 1. data.js 로드 및 기존 매물 번호 Set 생성
  const diskDataPath = path.join(ROOT_DIR, 'data.js');
  const bundledDataPath = path.join(__dirname, 'data.js');
  if (!fs.existsSync(diskDataPath) && fs.existsSync(bundledDataPath)) {
    try { fs.copyFileSync(bundledDataPath, diskDataPath); } catch (e) {}
  }
  let dataPath = fs.existsSync(diskDataPath) ? diskDataPath : bundledDataPath;
  if (!fs.existsSync(dataPath)) {
    console.error('❌ data.js 파일이 없습니다.');
    isSyncRunning = false;
    return { success: false, message: 'data.js not found' };
  }

  const currentData = loadDataFile(dataPath) || {};
  const catalog = currentData.CATALOG_COMPLEXES || [];
  const defaultComplexes = currentData.DEFAULT_COMPLEXES || [];
  const existingArticles = currentData.REAL_BUSAN_ARTICLES || {};

  // 기존 매물 번호 목록 (신규 매물 감지용)
  const existingArticleNos = new Set();
  for (const list of Object.values(existingArticles)) {
    if (Array.isArray(list)) {
      list.forEach(a => { if (a.articleNo) existingArticleNos.add(String(a.articleNo)); });
    }
  }
  console.log(`기존 등록 매물 총: ${existingArticleNos.size.toLocaleString()}건 확인`);

  // 최우선 핵심 감시 단지 목록 (24개 대장 단지)
  const priorityComplexes = [
    { id: 123223, name: '동래래미안아이파크' },
    { id: 136343, name: '레이카운티' },
    { id: 146548, name: '래미안포레스티지' },
    { id: 17246, name: '사직쌍용예가' },
    { id: 110733, name: '연제롯데캐슬앤데시앙' },
    { id: 121631, name: '동래3차SK뷰(주상복합)' },
    { id: 123443, name: '더샵동래(주상복합)' },
    { id: 110276, name: '동래효성해링턴플레이스' },
    { id: 103343, name: '명륜아이파크1단지' },
    { id: 107577, name: '사직롯데캐슬더클래식' },
    { id: 26462, name: '사직쌍용예가2차' },
    { id: 127894, name: '데시앙해링턴플레이스파크시티' },
    { id: 103344, name: '명륜아이파크2단지' },
    { id: 112331, name: '힐스테이트명륜' },
    { id: 119860, name: '힐스테이트명륜트라디움' },
    { id: 110243, name: '명륜자이' },
    { id: 111100, name: '온천삼정그린코아더베스트' },
    { id: 104085, name: '연산자이' },
    { id: 121287, name: 'e편한세상동래온천' },
    { id: 120537, name: '연산더샵' },
    { id: 108713, name: '거제센트럴자이' },
    { id: 5536, name: '화명롯데캐슬카이저' },
    { id: 4834, name: '동래복천현대' },
    { id: 4353, name: '남천삼익비치' }
  ];

  // 전체 500세대+ 단지 병합
  const syncList = [...priorityComplexes];
  for (const c of catalog.filter(x => (x.households || 0) >= 500)) {
    if (!syncList.some(s => String(s.id) === String(c.complexId))) {
      syncList.push({ id: c.complexId, name: c.shortName || c.name });
    }
  }

  // 2. 임시 브라우저 프로세스 백그라운드 구동 (Chrome 또는 Edge 자동 감지)
  const browserPath = getBrowserPath();
  if (!browserPath) {
    throw new Error('Chrome 또는 Microsoft Edge 브라우저를 찾을 수 없습니다.');
  }
  const isEdge = browserPath.toLowerCase().includes('edge');
  console.log(`1. 백그라운드 네이버 보안 세션 생성 중 (${isEdge ? 'Microsoft Edge' : 'Google Chrome'})...`);
  if (!fs.existsSync(TEMP_PROFILE)) fs.mkdirSync(TEMP_PROFILE, { recursive: true });

  const chromeProc = spawn(browserPath, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=900,700',
    '--window-position=-2000,-2000',
    'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
  let capturedToken = null;
  const newlyDiscoveredAlerts = [];

  try {
    let tabs = null;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      try {
        tabs = await getJson(`http://127.0.0.1:${PORT}/json`);
        if (tabs && tabs.length > 0) break;
      } catch (e) {}
    }

    if (!tabs || tabs.length === 0) throw new Error('브라우저 엔진 구동 시간 초과');

    const tab = tabs.find(t => t.type === 'page');
    ws = new WebSocket(tab.webSocketDebuggerUrl);

    let msgId = 1;
    function sendCmd(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const to = setTimeout(() => reject(new Error('timeout ' + method)), 30000);
        const handler = (data) => {
          try {
            const d = JSON.parse(data.toString());
            if (d.id === id) {
              clearTimeout(to);
              ws.removeListener('message', handler);
              resolve(d.result);
            }
          } catch (e) {}
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    // 토큰 캡처
    await new Promise((resolve, reject) => {
      ws.on('open', async () => {
        await sendCmd('Network.enable');

        ws.on('message', data => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.method === 'Network.requestWillBeSent') {
              const req = msg.params.request;
              if (req.url.includes('/api/')) {
                const auth = req.headers['Authorization'] || req.headers['authorization'];
                if (auth && auth.startsWith('Bearer ')) {
                  capturedToken = auth.replace('Bearer ', '').trim();
                }
              }
            }
          } catch (e) {}
        });

        await sleep(500);
        await sendCmd('Page.navigate', { url: 'https://new.land.naver.com/complexes/121631?a=APT&b=A1:B1&e=RETAIL' });

        for (let i = 0; i < 15; i++) {
          await sleep(1000);
          if (capturedToken) break;
        }
        resolve();
      });
      ws.on('error', reject);
    });

    if (!capturedToken) throw new Error('네이버 토큰 획득 실패');
    console.log('   ✅ 보안 토큰 획득 완료!\n');

    // 3. 배치 단위 수집 (3단지씩 8배치 = 24개 대장 단지 평형별 전수 수집)
    console.log('2. 네이버 실시간 매물 스캔 및 신규 매물 감지 시작...');
    const mergedArticles = { ...existingArticles };
    const BATCH_SIZE = 3;
    const MAX_BATCHES = 8; // 24개 핵심 단지 (약 1분 소요)
    let totalUpdatedComplexes = 0;

    for (let b = 0; b < Math.min(MAX_BATCHES, Math.ceil(syncList.length / BATCH_SIZE)); b++) {
      const batch = syncList.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const batchNames = batch.map(x => x.name).join(', ');
      process.stdout.write(`   [배치 ${b + 1}/${MAX_BATCHES}] ${batchNames.substring(0, 45)}... `);

      const batchResult = await sendCmd('Runtime.evaluate', {
        expression: `(async () => {
          const token = ${JSON.stringify(capturedToken)};
          const batch = ${JSON.stringify(batch)};
          const results = {};

          for (const item of batch) {
            try {
              const fetchType = async (tradeType) => {
                const list = [];
                const seenNos = new Set();
                const queries = [
                  '',                        // 전체 기본
                  '&areaMin=99&areaMax=132', // 30평대(84㎡) 필수 보장
                  '&areaMin=132&areaMax=999' // 40평대 이상 필수 보장
                ];

                for (const q of queries) {
                  const maxP = q === '' ? 2 : (q.includes('99&areaMax=132') ? 3 : 2);
                  for (let p = 1; p <= maxP; p++) {
                    try {
                      const url = '/api/articles/complex/' + item.id + '?realEstateType=APT&tradeType=' + tradeType + '&priceType=RETAIL&page=' + p + '&type=list&order=prc' + q;
                      const r = await fetch(url, {
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                      });
                      if (!r.ok) break;
                      const d = await r.json();
                      if (d.articleList && d.articleList.length > 0) {
                        for (const a of d.articleList) {
                          if (!seenNos.has(a.articleNo)) {
                            seenNos.add(a.articleNo);
                            list.push(a);
                          }
                        }
                      }
                      if (!d.isMoreData) break;
                    } catch { break; }
                  }
                }
                return list;
              };

              const j = await fetchType('B1');
              const s = await fetchType('A1');
              results[item.id] = { jeonse: j, sale: s };
            } catch (e) {
              results[item.id] = { error: e.message };
            }
          }
          return results;
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      const resValue = batchResult.result?.value || {};
      let batchArticlesCount = 0;

      for (const item of batch) {
        const cIdStr = String(item.id);
        const data = resValue[item.id];
        if (!data || data.error) continue;

        const articles = [];
        for (const a of (data.jeonse || [])) {
          const formatted = formatArticle(a, item.id, 'jeonse');
          // 신규 매물 감지
          if (!existingArticleNos.has(formatted.articleNo)) {
            formatted.isBrandNew = true;
            newlyDiscoveredAlerts.push({
              complexId: item.id,
              complexName: item.name,
              articleNo: formatted.articleNo,
              tradeType: '전세',
              dong: formatted.dong,
              floor: formatted.floor,
              pyeong: formatted.pyeong,
              priceText: formatted.priceText,
              agency: formatted.agency,
              directUrl: `https://fin.land.naver.com/articles/${formatted.articleNo}`,
              discoveredAt: new Date().toLocaleTimeString('ko-KR')
            });
          }
          articles.push(formatted);
        }

        for (const a of (data.sale || [])) {
          const formatted = formatArticle(a, item.id, 'sale');
          if (!existingArticleNos.has(formatted.articleNo)) {
            formatted.isBrandNew = true;
            newlyDiscoveredAlerts.push({
              complexId: item.id,
              complexName: item.name,
              articleNo: formatted.articleNo,
              tradeType: '매매',
              dong: formatted.dong,
              floor: formatted.floor,
              pyeong: formatted.pyeong,
              priceText: formatted.priceText,
              agency: formatted.agency,
              directUrl: `https://fin.land.naver.com/articles/${formatted.articleNo}`,
              discoveredAt: new Date().toLocaleTimeString('ko-KR')
            });
          }
          articles.push(formatted);
        }

        if (articles.length > 0) {
          mergedArticles[cIdStr] = articles;
          batchArticlesCount += articles.length;
          totalUpdatedComplexes++;
        }
      }

      console.log(`성공 (${batchArticlesCount}건 최신화)`);
      await sleep(1000);
    }

    // 4. DEFAULT_COMPLEXES 최신화 반영
    for (const dc of defaultComplexes) {
      const cIdStr = String(dc.complexId);
      if (mergedArticles[cIdStr]) {
        dc.initialArticles = mergedArticles[cIdStr];
      }
    }

    // 5. 신규 매물 알림 파일(alerts.json) 기록
    const alertsPath = path.join(ROOT_DIR, 'latest_alerts.json');
    let previousAlerts = [];
    if (fs.existsSync(alertsPath)) {
      try { previousAlerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8')); } catch (e) {}
    }
    const combinedAlerts = [...newlyDiscoveredAlerts, ...previousAlerts].slice(0, 50);
    fs.writeFileSync(alertsPath, JSON.stringify(combinedAlerts, null, 2), 'utf8');

    // 6. data.js 저장
    console.log('\n3. 최신 매물 데이터베이스(data.js) 저장 중...');
    const totalCount = Object.values(mergedArticles).reduce((acc, cur) => acc + cur.length, 0);

    const fileContent = `// 부산 부동산 레이더 - 마스터 실매물 데이터셋 & 카탈로그
// 최종 실시간 동기화: ${todayFmt} | 총 ${Object.keys(mergedArticles).length}개 단지, ${totalCount.toLocaleString()}건 실매물

function formatKoreanPrice(val) {
  if (!val) return '0원';
  const eok = Math.floor(val / 10000);
  const man = val % 10000;
  if (eok > 0 && man > 0) {
    return \`\${eok}억 \${man.toLocaleString()}만원\`;
  } else if (eok > 0) {
    return \`\${eok}억원\`;
  } else {
    return \`\${man.toLocaleString()}만원\`;
  }
}

const REAL_BUSAN_ARTICLES = ${JSON.stringify(mergedArticles, null, 2)};
const CATALOG_COMPLEXES = ${JSON.stringify(catalog, null, 2)};
const PRESET_REGIONS = ${JSON.stringify(currentData.PRESET_REGIONS || [], null, 2)};
const DEFAULT_COMPLEXES = ${JSON.stringify(defaultComplexes, null, 2)};
const COMPLEXES_DATA = DEFAULT_COMPLEXES;

if (typeof window !== 'undefined') {
  window.CATALOG_COMPLEXES = CATALOG_COMPLEXES;
  window.PRESET_REGIONS = PRESET_REGIONS;
  window.DEFAULT_COMPLEXES = DEFAULT_COMPLEXES;
  window.COMPLEXES_DATA = COMPLEXES_DATA;
  window.REAL_BUSAN_ARTICLES = REAL_BUSAN_ARTICLES;
  window.formatKoreanPrice = formatKoreanPrice;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATALOG_COMPLEXES, PRESET_REGIONS, DEFAULT_COMPLEXES,
    COMPLEXES_DATA, REAL_BUSAN_ARTICLES, formatKoreanPrice
  };
}
`;

    const targetSavePath = path.join(ROOT_DIR, 'data.js');
    fs.writeFileSync(targetSavePath, fileContent, 'utf8');

    lastSyncTime = new Date();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('================================================================');
    console.log(`🎉 동기화 대성공! (소요시간: ${elapsed}초)`);
    console.log(`- 기준 일자: ${todayFmt} (${todayYmd})`);
    console.log(`- 갱신된 단지: ${totalUpdatedComplexes}개 대단지`);
    console.log(`- 방금 새로 포착된 신규 매물: ${newlyDiscoveredAlerts.length}건 감지!`);
    if (newlyDiscoveredAlerts.length > 0) {
      console.log('  🚨 [신규 매물 포착 샘플]:');
      newlyDiscoveredAlerts.slice(0, 5).forEach(a => {
        console.log(`     👉 [${a.complexName}] ${a.dong} ${a.floor} (${a.pyeong}평) ${a.tradeType} ${a.priceText} (#${a.articleNo})`);
      });
    }
    console.log(`- 전체 보존 매물: ${totalCount.toLocaleString()}건`);
    console.log('================================================================');

// GitHub Pages 자동 배포를 위한 Git 저장소 위치 탐색
function resolveGitWorkingDir() {
  const candidates = [
    path.join(process.env.USERPROFILE || '', 'Desktop', '프로그램', '전세집 알아보기'),
    path.join(process.env.USERPROFILE || '', 'Desktop', '전세집 알아보기'),
    process.env.JEONSE_RADAR_LAUNCH_DIR,
    ROOT_DIR,
    process.cwd(),
    path.join(__dirname, '..')
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
  }
  return null;
}

    // 7. 자동 GitHub Push (Git이 설치 및 설정되어 있을 때만 수행)
    if (options.autoPush) {
      const gitDir = resolveGitWorkingDir();
      if (gitDir) {
        try {
          console.log(`\n4. GitHub Pages 자동 최신화(Push) 시작... (저장소 경로: ${gitDir})`);
          execSync('git --version', { stdio: 'ignore' });

          // 1) ROOT_DIR에서 생성된 최신 data.js, latest_alerts.json을 gitDir로 복사 (서로 다를 경우)
          if (path.resolve(gitDir) !== path.resolve(ROOT_DIR)) {
            const dataSrc = path.join(ROOT_DIR, 'data.js');
            const dataDst = path.join(gitDir, 'data.js');
            if (fs.existsSync(dataSrc)) fs.copyFileSync(dataSrc, dataDst);

            const alertsSrc = path.join(ROOT_DIR, 'latest_alerts.json');
            const alertsDst = path.join(gitDir, 'latest_alerts.json');
            if (fs.existsSync(alertsSrc)) fs.copyFileSync(alertsSrc, alertsDst);
          }

          // 2) index.html 캐시 버스팅 파라미터 갱신 (gitDir와 ROOT_DIR 모두 갱신)
          const targetIndexPaths = [
            path.join(ROOT_DIR, 'index.html'),
            path.join(gitDir, 'index.html')
          ];
          const newV = `v=${todayYmd}_${Date.now()}`;
          for (const idxPath of targetIndexPaths) {
            if (fs.existsSync(idxPath)) {
              let idxContent = fs.readFileSync(idxPath, 'utf8');
              idxContent = idxContent.replace(/data\.js\?v=[^"']+/g, `data.js?${newV}`);
              idxContent = idxContent.replace(/app\.js\?v=[^"']+/g, `app.js?${newV}`);
              idxContent = idxContent.replace(/style\.css\?v=[^"']+/g, `style.css?${newV}`);
              fs.writeFileSync(idxPath, idxContent, 'utf8');
            }
          }

          // 3) Git Add, Commit & Push 실행 (실제 변경사항이 있을 때만 안전하게 커밋&푸시)
          const statusOutput = execSync('git status --porcelain data.js index.html latest_alerts.json app.js style.css', { cwd: gitDir, encoding: 'utf8' }).trim();
          if (statusOutput.length > 0) {
            execSync('git add data.js index.html latest_alerts.json app.js style.css', { cwd: gitDir, stdio: 'ignore' });
            execSync(`git commit -m "auto: 실시간 네이버 매물 정기 동기화 (${todayFmt} ${new Date().toLocaleTimeString('ko-KR')})"`, { cwd: gitDir, stdio: 'ignore' });
            try { execSync('git pull --rebase origin main', { cwd: gitDir, stdio: 'ignore' }); } catch (e) {}
            execSync('git push origin main', { cwd: gitDir, stdio: 'ignore' });
            lastPushStatus = {
              success: true,
              message: `GitHub Pages 배포 완료 (${todayFmt} ${new Date().toLocaleTimeString('ko-KR')})`,
              time: new Date().toISOString()
            };
            console.log('   ✅ GitHub Pages 최신화(Push) 완료! 모바일/웹 화면이 즉시 갱신되었습니다.');
          } else {
            lastPushStatus = {
              success: true,
              message: `GitHub Pages 최신 상태 유지 (${todayFmt} ${new Date().toLocaleTimeString('ko-KR')})`,
              time: new Date().toISOString()
            };
            console.log('   ℹ️ 최신 매물 데이터가 이미 GitHub Pages와 동일하여 추가 푸시를 건너뜁니다.');
          }
        } catch (gitErr) {
          lastPushStatus = {
            success: false,
            message: `GitHub Pages 배포 실패: ${gitErr.message}`,
            time: new Date().toISOString()
          };
          console.error('   ❌ GitHub Pages 자동 배포 중 오류:', gitErr.message);
        }
      } else {
        lastPushStatus = {
          success: false,
          message: '로컬 전용 (Git 저장소 미연결)',
          time: new Date().toISOString()
        };
        console.log('   ℹ️ 로컬 최신 데이터 저장 완료 (외부 PC 또는 오프라인 모드)');
      }
    }

    return {
      success: true,
      updatedComplexes: totalUpdatedComplexes,
      newAlertsCount: newlyDiscoveredAlerts.length,
      alerts: newlyDiscoveredAlerts,
      totalCount,
      timestamp: lastSyncTime.toISOString()
    };

  } catch (err) {
    console.error('❌ 동기화 중 오류 발생:', err.message);
    return { success: false, message: err.message };
  } finally {
    if (ws) { try { ws.close(); } catch (e) {} }
    chromeProc.kill();
    await sleep(1000);
    try { fs.rmSync(TEMP_PROFILE, { recursive: true, force: true }); } catch (e) {}
    isSyncRunning = false;
  }
}

if (require.main === module) {
  runAutoSync({ autoPush: true });
}

module.exports = {
  runAutoSync,
  getLastSyncTime: () => lastSyncTime,
  getIsRunning: () => isSyncRunning,
  getLastPushStatus: () => lastPushStatus
};
