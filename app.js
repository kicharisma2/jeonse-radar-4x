/**
 * 스마트 부동산 6분할 레이더 (JeonseRadar 6X) - Main Application Logic
 * 전국 60+ 대장 단지 자유 선택 / 20·30·40평대 전세&매매 완벽 조회 / 로컬 영구 저장 / 6분할 창 연동
 */

// -------------------------------------------------------------
// 1. 로컬 스토리지 데이터 로드 및 저장 유틸리티
// -------------------------------------------------------------
const STORAGE_KEYS = {
  THEME: 'jeonseRadar_theme_v5',
  USER_FILTERS: 'jeonseRadar_userFilters_v5',
  ACTIVE_SLOTS: 'jeonseRadar_activeSlots_v5',
  FAVORITES: 'jeonseRadar_favoriteComplexes_v5',
  USER_NAME: 'jeonseRadar_userName_v5'
};

// 기본 필터값 (사용자 최초 접속 시 기본값)
const FACTORY_FILTERS = {
  tradeType: 'jeonse',
  priceMin: 25000, // 2억 5,000만원
  priceMax: 65000, // 6억 5,000만원
  pyeongType: '30', // 30평대 (84㎡형)
  minHouseholds: 500,
  buildAge: 'within20', // 20년 이내 (신축/준신축)
  sort: 'price_asc' // 가격 낮은순
};

function loadSavedTheme() {
  // 사용자 요구: 기본 화면은 항상 밝은 화면(light)으로 시작
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  return saved ? saved : 'light';
}

function loadSavedFilters() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_FILTERS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...FACTORY_FILTERS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to parse saved filters', e);
  }
  return { ...FACTORY_FILTERS };
}

const KNOWN_ID_CORRECTIONS = {
  'ray_county': { id: 136343, name: '레이카운티' },
  'hyosung_harrington': { id: 110276, name: '동래효성해링턴플레이스' },
  'myeongnyun_ipark': { id: 103343, name: '명륜아이파크1단지' },
  'thesharp_dongnae': { id: 123443, name: '더샵동래' },
  'dongnae_raemian': { id: 123223, name: '동래래미안아이파크' },
  'raemian_forestige': { id: 146548, name: '래미안포레스티지' },
  'sajik_classic': { id: 107577, name: '사직롯데캐슬더클래식' },
  'sajik_lotte_classic': { id: 107577, name: '사직롯데캐슬더클래식' },
  'geoje_central_xi': { id: 112719, name: '거제센트럴자이' },
  'geoje_xi': { id: 112719, name: '거제센트럴자이' },
  'yeonje_lotte_desian': { id: 110733, name: '연제롯데캐슬앤데시앙' },
  'yeonsan_thesharp': { id: 112331, name: '연산더샵' },
  'yeonsan_xi': { id: 26286, name: '연산자이' },
  'thesharp_parkcity': { id: 105448, name: '더샵파크시티' },
  'bokcheon_hyundai': { id: 4834, name: '동래복천현대' }
};

function loadSavedActiveSlots() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_SLOTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let needsSave = false;
        // 복원된 슬롯 단지들에 매물 데이터 생성 및 잘못 저장된 네이버 ID 자동 보정
        const cleaned = parsed.map(c => {
          if (!c) return null;

          // 과거 잘못 매핑되었던 네이버 complexId 자동 복구 (월곶, 푸르나, 송도더샵 방지)
          if (c.complexId === 27077) { c.complexId = 103343; c.name = '명륜아이파크1단지'; c.shortName = '명륜아이파크1단지'; needsSave = true; }
          if (c.complexId === 116174) { c.complexId = 110276; c.name = '동래효성해링턴플레이스'; c.shortName = '동래효성해링턴'; needsSave = true; }
          if (c.complexId === 122248) { c.complexId = 123443; c.name = '더샵동래'; c.shortName = '더샵동래'; needsSave = true; }
          if (c.id === 'ray_county' && c.complexId === 123443) { c.complexId = 136343; c.name = '레이카운티'; c.shortName = '레이카운티'; needsSave = true; }

          if (c.id && KNOWN_ID_CORRECTIONS[c.id]) {
            const correct = KNOWN_ID_CORRECTIONS[c.id];
            if (c.complexId !== correct.id) {
              c.complexId = correct.id;
              needsSave = true;
            }
            if (correct.name && (!c.name || c.name.includes('푸르나') || c.name.includes('월곶') || c.name.includes('송도'))) {
              c.name = correct.name;
              needsSave = true;
            }
          }

          // 네이버 URL 파라미터 최신화
          if (c.complexId) {
            c.naverUrl = `https://new.land.naver.com/complexes/${c.complexId}?a=APT&b=B1&e=RETAIL&order=prc`;
            c.naverMobileUrl = `https://fin.land.naver.com/complexes/${c.complexId}?tradeTypes=B1`;
          }

          // 100% 네이버 실매물 맵에서 실제 매물 데이터 연동 (더미 데이터 영구 제거)
          const realMap = window.REAL_BUSAN_ARTICLES || {};
          const cKey = String(c.complexId || c.id);
          if (realMap[cKey] && Array.isArray(realMap[cKey]) && realMap[cKey].length > 0) {
            c.initialArticles = realMap[cKey];
          } else if (!c.initialArticles) {
            c.initialArticles = [];
          }
          return c;
        });

        if (needsSave) {
          try {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_SLOTS, JSON.stringify(cleaned));
            console.log('Migrated and cured active slots Naver complex IDs in localStorage!');
          } catch(e){}
        }

        return cleaned;
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved slots', e);
  }
  // 기본값: 부산 6대 대장 아파트 (동래래미안, 레이카운티, 포레스티지, 효성해링턴, 명륜아이파크, 더샵동래)
  const defaults = window.DEFAULT_COMPLEXES || [];
  return defaults.slice(0, 6);
}

function loadSavedFavorites() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function loadSavedUserName() {
  return localStorage.getItem(STORAGE_KEYS.USER_NAME) || '내 스마트 레이더';
}

function formatPrice(val) {
  if (typeof val !== 'number') {
    val = parseInt(val, 10);
    if (isNaN(val)) return '0원';
  }
  if (!val) return '0원';
  const eok = Math.floor(val / 10000);
  const man = val % 10000;
  if (eok > 0 && man > 0) {
    return `${eok}억 ${man.toLocaleString()}만원`;
  } else if (eok > 0) {
    return `${eok}억원`;
  } else {
    return `${man.toLocaleString()}만원`;
  }
}

// -------------------------------------------------------------
// 2. 애플리케이션 상태 (State)
// -------------------------------------------------------------
const initialFilters = loadSavedFilters();

const state = {
  // 필터 상태
  tradeType: initialFilters.tradeType || 'jeonse',
  priceMin: initialFilters.priceMin || 43000,
  priceMax: initialFilters.priceMax || 55000,
  pyeongType: initialFilters.pyeongType || '30',
  minHouseholds: initialFilters.minHouseholds || 500,
  buildAge: initialFilters.buildAge || 'within20',
  sort: initialFilters.sort || 'price_asc',

  // 6개 슬롯 관리 (각 슬롯은 Complex 객체 또는 null)
  activeSlots: loadSavedActiveSlots(),
  targetSlotIndex: 0, // 아파트 교체/추가 대상 슬롯 인덱스

  // 사용자 환경 설정
  theme: loadSavedTheme(),
  userName: loadSavedUserName(),
  favoriteComplexIds: loadSavedFavorites(),
  onlyFavoritesFilter: false,
  soloComplexId: null,

  // 실시간 알림 & 모니터링
  notificationsEnabled: false,
  nextCheckSeconds: 25,
  articles: {}, // complexId => articles array
  notifications: []
};

// 윈도우 핸들러 캐시
const windowHandles = {};

// -------------------------------------------------------------
// 3. Web Audio API 사운드 신디사이저 (외부 오디오 의존 없이 네이티브 재생)
// -------------------------------------------------------------
function playChimeSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.8);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.28); // D6
    gain2.gain.setValueAtTime(0.18, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 1.2);
  } catch (err) {
    console.warn('Audio chime error:', err);
  }
}

// -------------------------------------------------------------
// 4. 네이버 부동산 공식 URL 빌더 (개별 실매물 직결 & 전세/매매 필터 연동)
// -------------------------------------------------------------
function buildNaverRealEstateUrl(complex, options = {}) {
  if (!complex || !complex.complexId) return 'https://new.land.naver.com/';

  const baseUrl = `https://new.land.naver.com/complexes/${complex.complexId}`;

  // 1. 개별 매물 직결: 실제 네이버 articleNo가 있으면 네이버 상세 드로어로 직접 열람
  let articleNo = null;
  if (typeof options === 'string' || typeof options === 'number') {
    articleNo = String(options).trim();
  } else if (typeof options === 'object' && options && options.articleNo) {
    articleNo = String(options.articleNo).trim();
  }

  if (articleNo) {
    return `${baseUrl}?articleNo=${articleNo}`;
  }

  // 2. 단지 전체/필터 조회: 거래유형(전세/매매), 평형, 가격 파라미터 적용
  const params = new URLSearchParams();
  params.set('a', 'APT'); // 아파트
  
  // 거래 유형: b=A1(매매), b=B1(전세) - 월세(B2)는 절대 노출하지 않음
  let tradeType = state.tradeType || 'jeonse';
  if (typeof options === 'object' && options && options.tradeType) {
    tradeType = options.tradeType;
  }
  params.set('b', tradeType === 'sale' ? 'A1' : 'B1');
  params.set('e', 'RETAIL'); // 일반 매물

  // 평형 조건
  let pyeongType = state.pyeongType;
  if (typeof options === 'object' && options && options.pyeongType !== undefined) {
    pyeongType = options.pyeongType;
  }
  if (pyeongType === '20') {
    params.set('h', '66');
    params.set('i', '99');
  } else if (pyeongType === '30') {
    params.set('h', '99');
    params.set('i', '132');
  } else if (pyeongType === '40') {
    params.set('h', '132');
    params.set('i', '999');
  }

  // 가격 조건 (만원 단위)
  if (state.priceMin) {
    params.set('f', String(state.priceMin));
  }
  if (state.priceMax) {
    params.set('g', String(state.priceMax));
  }

  // 최저가순 정렬
  params.set('order', 'prc');

  return `${baseUrl}?${params.toString()}`;
}

// -------------------------------------------------------------
// 5. 1클릭 화면 6분할 네이버 창 동시 실행 (3열 x 2행 바둑판 정렬)
// -------------------------------------------------------------
function launchSixWindows() {
  const availW = window.screen.availWidth || window.innerWidth;
  const availH = window.screen.availHeight || window.innerHeight;
  const availLeft = window.screen.availLeft || 0;
  const availTop = window.screen.availTop || 0;

  const colW = Math.floor(availW / 3);
  const rowH = Math.floor(availH / 2);

  const windowPositions = [
    { x: availLeft, y: availTop, w: colW, h: rowH },
    { x: availLeft + colW, y: availTop, w: colW, h: rowH },
    { x: availLeft + colW * 2, y: availTop, w: colW, h: rowH },
    { x: availLeft, y: availTop + rowH, w: colW, h: rowH },
    { x: availLeft + colW, y: availTop + rowH, w: colW, h: rowH },
    { x: availLeft + colW * 2, y: availTop + rowH, w: colW, h: rowH }
  ];

  let openedCount = 0;
  let blockedCount = 0;

  state.activeSlots.forEach((complex, idx) => {
    if (!complex || idx >= 6) return;

    const pos = windowPositions[idx];
    const url = buildNaverRealEstateUrl(complex);
    const winName = `NaverWindow_${complex.id || complex.complexId}`;
    const features = `left=${pos.x},top=${pos.y},width=${pos.w},height=${pos.h},menubar=no,toolbar=no,location=yes,status=yes,resizable=yes,scrollbars=yes`;

    try {
      const win = window.open(url, winName, features);
      if (!win || win.closed || typeof win.closed === 'undefined') {
        blockedCount++;
      } else {
        windowHandles[complex.id] = win;
        openedCount++;
      }
    } catch (e) {
      blockedCount++;
    }
  });

  if (blockedCount > 0) {
    showPopupHelpModal();
    showToast('⚠️ 팝업 차단 감지', '브라우저 주소창 우측에서 팝업을 허용해주세요.', 'warning');
  } else if (openedCount > 0) {
    showToast('🚀 네이버 6창 분할 실행 완료', `화면 6분면에 ${openedCount}개 아파트 네이버 창이 바둑판 배열로 실행되었습니다!`, 'success');
  } else {
    showToast('안내', '현재 슬롯에 등록된 아파트가 없습니다. 아파트를 먼저 추가해주세요.', 'warning');
  }
}

// -------------------------------------------------------------
// 6. 매물 필터링 및 정렬 로직 (전세/매매, 20/30/40평대 완벽 대응)
// -------------------------------------------------------------
function filterArticles(articles, complex) {
  if (!articles || !Array.isArray(articles)) return [];

  return articles.filter(item => {
    // 1. 거래 유형 (전세 / 매매)
    if (state.tradeType && item.tradeType && item.tradeType !== state.tradeType) {
      return false;
    }

    // 2. 가격 범위 (만원 단위)
    if (typeof state.priceMin === 'number' && item.price < state.priceMin) {
      return false;
    }
    if (typeof state.priceMax === 'number' && item.price > state.priceMax) {
      return false;
    }

    // 3. 평형 조건 (20평대: 20~29, 30평대: 30~39, 40평대: 40이상)
    if (state.pyeongType === '20') {
      if (item.pyeong < 20 || item.pyeong >= 30) return false;
    } else if (state.pyeongType === '30') {
      if (item.pyeong < 30 || item.pyeong >= 40) return false;
    } else if (state.pyeongType === '40') {
      if (item.pyeong < 40) return false;
    }

    return true;
  }).sort((a, b) => {
    if (state.sort === 'price_asc') return a.price - b.price;
    if (state.sort === 'price_desc') return b.price - a.price;
    if (state.sort === 'area_desc') return (b.exclusiveArea || 0) - (a.exclusiveArea || 0);
    // newest 기본
    return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
  });
}

function isWithin24Hours(dateStr) {
  if (!dateStr) return false;
  let itemDate;
  if (/^\d{8}$/.test(dateStr)) {
    const y = parseInt(dateStr.slice(0, 4), 10);
    const m = parseInt(dateStr.slice(4, 6), 10) - 1;
    const d = parseInt(dateStr.slice(6, 8), 10);
    itemDate = new Date(y, m, d, 23, 59, 59);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    itemDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59);
  } else {
    itemDate = new Date(dateStr);
  }
  if (isNaN(itemDate.getTime())) return false;
  const now = new Date();
  const diffHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
}

// -------------------------------------------------------------
// 7. 메인 대시보드 6분할 그리드 렌더링 (아파트 카드 + 빈 슬롯 동적 렌더링)
// -------------------------------------------------------------
function renderAllComplexes() {
  const gridElem = document.getElementById('complexGrid');
  if (!gridElem) return;

  gridElem.innerHTML = '';
  let totalMatchesCount = 0;
  let activeComplexCount = 0;
  let totalHouseholds = 0;

  // 항상 6개 슬롯을 바둑판으로 렌더링 (채워진 슬롯 vs 빈 슬롯)
  for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
    const complex = state.activeSlots[slotIndex];

    if (!complex) {
      // 빈 슬롯 카드 (+ 아파트 추가하기)
      const emptyCard = document.createElement('section');
      emptyCard.className = 'empty-slot-card';
      emptyCard.dataset.slotIndex = slotIndex;
      emptyCard.innerHTML = `
        <div class="empty-slot-icon">+</div>
        <h3 class="empty-slot-title">슬롯 ${slotIndex + 1} 비어있음</h3>
        <p class="empty-slot-desc">클릭하여 전국 대장 아파트를 검색하거나 원하는 단지를 등록하세요.</p>
        <button class="btn-empty-slot-add" data-slot="${slotIndex}">+ 아파트 등록하기</button>
      `;
      gridElem.appendChild(emptyCard);
      continue;
    }

    // 관심 단지만 보기 필터가 켜져 있고 즐겨찾기가 아니면 숨김
    if (state.onlyFavoritesFilter && !state.favoriteComplexIds.includes(complex.id)) {
      continue;
    }

    // 단독 모드 필터
    if (state.soloComplexId && state.soloComplexId !== complex.id) {
      continue;
    }

    activeComplexCount++;
    totalHouseholds += complex.households || 0;

    // 해당 단지의 매물 로드 (실매물 맵 연동)
    if (!state.articles[complex.id]) {
      const realMap = window.REAL_BUSAN_ARTICLES || {};
      const cKey = String(complex.complexId || complex.id);
      if (realMap[cKey] && Array.isArray(realMap[cKey]) && realMap[cKey].length > 0) {
        state.articles[complex.id] = [...realMap[cKey]];
      } else if (complex.initialArticles && complex.initialArticles.length > 0) {
        state.articles[complex.id] = [...complex.initialArticles];
      } else {
        state.articles[complex.id] = [];
      }
    }

    const filtered = filterArticles(state.articles[complex.id], complex);
    totalMatchesCount += filtered.length;

    const minPrice = filtered.length ? Math.min(...filtered.map(a => a.price)) : 0;
    const maxPrice = filtered.length ? Math.max(...filtered.map(a => a.price)) : 0;
    const priceRangeSummary = filtered.length
      ? `${formatPrice(minPrice)} ~ ${formatPrice(maxPrice)}`
      : '매물 없음';

    const isFav = state.favoriteComplexIds.includes(complex.id);
    const isSolo = state.soloComplexId === complex.id;
    const naverUrl = buildNaverRealEstateUrl(complex);

    const cardElem = document.createElement('section');
    cardElem.className = `complex-card card-slot-${slotIndex + 1}`;
    cardElem.id = `card_${complex.id}`;
    cardElem.dataset.complexId = complex.id;
    cardElem.dataset.slotIndex = slotIndex;

    const tradeTitle = state.tradeType === 'sale' ? '매매 호가' : '전세 호가';

    cardElem.innerHTML = `
      <!-- 카드 헤더 (고정 74px 높이 완벽 수평 정렬) -->
      <div class="card-header header-slot-${slotIndex + 1}">
        <div class="complex-info">
          <div class="complex-title-row">
            <span class="badge-complex-num num-slot-${slotIndex + 1}">${slotIndex + 1}</span>
            <h2 class="complex-name" title="${complex.name}">${complex.name}</h2>
            <span class="badge-complex-stat">${(complex.households || 0).toLocaleString()}세대</span>
            <span class="badge-complex-age">${complex.ageYears || 1}년차</span>
          </div>
          <div class="complex-meta">
            <span class="meta-item">📍 <strong>${complex.shortDistrict || complex.district || '주소 정보'}</strong></span>
            <span class="meta-dot">·</span>
            <span class="meta-item">🚇 ${complex.shortMetro || complex.metro || '역세권'}</span>
            <span class="meta-dot">·</span>
            <span class="meta-item">준공: ${complex.buildYear || 2022}</span>
          </div>
        </div>

        <div class="card-header-actions">
          <!-- 관심 아파트 등록/해제 토글 (★ / ☆) -->
          <button class="btn-card-icon btn-fav-toggle ${isFav ? 'is-fav' : ''}" data-id="${complex.id}" title="${isFav ? '관심 단지 해제' : '관심 단지로 등록'}">
            ${isFav ? '★' : '☆'}
          </button>
          
          <!-- 네이버 부동산 바로보기 버튼 (깔끔한 화이트 미니멀 버튼) -->
          <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="btn-naver-direct" title="네이버 부동산에서 동일 조건(${state.tradeType === 'sale' ? '매매' : '전세'}·${getPyeongLabel(state.pyeongType)}) 매물을 봅니다">
            <span>네이버 바로보기</span> ↗
          </a>

          <!-- 아파트 교체 버튼 (직관적인 텍스트 버튼) -->
          <button class="btn-card-swap-text btn-swap-complex" data-slot="${slotIndex}" title="다른 아파트로 교체하기">
            🔄 교체
          </button>

          <!-- 단독 확대 토글 -->
          <button class="btn-card-icon btn-solo-toggle" data-id="${complex.id}" title="${isSolo ? '6분할 뷰로 복귀' : '이 단지만 단독 크게보기'}">
            ${isSolo ? '🗗' : '🔲'}
          </button>

          <!-- 단지 슬롯에서 빼기(삭제) 버튼 -->
          <button class="btn-card-icon btn-remove-complex" data-slot="${slotIndex}" title="이 아파트를 슬롯에서 빼기 (빈 슬롯으로 전환)">
            ✕
          </button>
        </div>
      </div>

      <!-- 조건 일치 매물 서브바 (고정 38px 높이, 고대비 배너) -->
      <div class="card-summary-ribbon ribbon-slot-${slotIndex + 1}">
        <div class="summary-left">
          <span class="badge-match-pill">
            <span class="match-icon">🏷️</span> 조건 일치: <strong>${filtered.length}개</strong>
          </span>
          <span class="summary-price-badge">
            ${tradeTitle}: <strong>${priceRangeSummary}</strong>
          </span>
        </div>
        <div class="summary-right">
          <span class="summary-spec-text">${complex.ageYears || 1}년차 (${complex.buildYear || 2022})</span>
        </div>
      </div>

      <!-- 카드 본문: 매물 리스트 -->
      <div class="card-body" id="list_${complex.id}">
        ${filtered.length === 0 ? `
          <div class="empty-listings" style="padding: 24px 16px; text-align: center;">
            <span class="empty-listings-icon" style="font-size: 2rem; display: block; margin-bottom: 8px;">🔍</span>
            <p style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
              현재 조건(${state.tradeType === 'sale' ? '매매' : '전세'} · ${getPyeongLabel(state.pyeongType)})에 일치하는 실매물이 없습니다.
            </p>
            ${(() => {
              const allArts = state.articles[complex.id] || [];
              const otherType = state.tradeType === 'sale' ? 'jeonse' : 'sale';
              const otherCount = allArts.filter(a => a.tradeType === otherType).length;
              return otherCount > 0 ? `
                <p style="color: #2563eb; font-size: 0.82rem; font-weight: 600; margin: 6px 0;">
                  💡 이 단지는 현재 <strong>${otherType === 'sale' ? '매매' : '전세'} ${otherCount}건</strong>이 등록되어 있습니다.
                </p>
              ` : '';
            })()}
            <small style="color: var(--text-muted); display: block; margin-bottom: 12px;">금액 범위나 평형 조건을 조금 넓혀보시거나 네이버 전체보기를 클릭하세요.</small>
            <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 6px 14px; background: #03c75a; color: white; text-decoration: none; border-radius: 4px; font-size: 0.78rem; font-weight: 700;">
              네이버에서 ${complex.shortName || complex.name} 전체 매물 확인하기 ↗
            </a>
          </div>
        ` : filtered.map(item => renderListingCardHtml(complex, item)).join('')}
      </div>
    `;

    gridElem.appendChild(cardElem);
  }

  // 상단 매물 통계 뱃지 갱신
  const matchesCountElem = document.getElementById('totalMatchesCount');
  if (matchesCountElem) {
    matchesCountElem.textContent = totalMatchesCount.toLocaleString();
  }

  // 하단 고정 바 텍스트 갱신
  const footerInfoElem = document.getElementById('footerInfoText');
  if (footerInfoElem) {
    const tradeLabel = state.tradeType === 'sale' ? '매매' : '전세';
    const pyeongLabel = getPyeongLabel(state.pyeongType);
    footerInfoElem.textContent = `모니터링 대상: ${activeComplexCount}개 단지 총 ${totalHouseholds.toLocaleString()}세대 | 설정조건: ${tradeLabel} ${formatPrice(state.priceMin)}~${formatPrice(state.priceMax)}, ${pyeongLabel}`;
  }

  // 관리 바 칩 및 모바일 탭 동기화
  renderComplexSelectorChips();
  renderMobileTabs();
}

// 개별 매물 카드 HTML 생성
function renderListingCardHtml(complex, item) {
  const isFresh = isWithin24Hours(item.regDate || item.confirmYmd);

  // 이 매물의 평형대 (20평대, 30평대, 40평대) 판별
  let itemPyeongType = 'all';
  const p = Number(item.pyeong) || 0;
  if (p >= 20 && p < 30) itemPyeongType = '20';
  else if (p >= 30 && p < 40) itemPyeongType = '30';
  else if (p >= 40) itemPyeongType = '40';

  // 네이버 실제 매물 직결 URL (articleNo 파라미터가 들어가 네이버 매물 상세창이 즉시 열림)
  const naverItemUrl = buildNaverRealEstateUrl(complex, { articleNo: item.articleNo });
  const tradeBadgeText = item.tradeType === 'sale' ? '매매' : '전세';

  return `
    <article class="listing-card ${isFresh ? 'is-new-listing' : ''}" data-complex-id="${complex.id}" data-article-id="${item.id}">
      <div class="listing-top-row">
        <div class="listing-price-group">
          <span class="badge-trade-type ${item.tradeType === 'sale' ? 'badge-sale' : ''}">${tradeBadgeText}</span>
          <span class="listing-price-huge">${item.priceText}</span>
          ${isFresh ? '<span class="badge-new-subtle">NEW</span>' : ''}
        </div>
        <div class="listing-actions">
          <button class="btn-listing-detail" data-complex-id="${complex.id}" data-article-id="${item.id}" title="상세 정보 및 중개사 확인">
            상세정보
          </button>
          <a href="${naverItemUrl}" target="_blank" rel="noopener noreferrer" class="btn-listing-link" title="네이버 부동산에서 매물 #${item.articleNo} 바로보기">
            네이버 확인 ↗
          </a>
        </div>
      </div>

      <div class="card-spec-bar">
        <span class="spec-chip dong">${item.dong}</span>
        <span class="spec-chip floor">${item.floor}/${item.maxFloor || '고층'}</span>
        <span class="spec-chip area">${item.pyeong}평형 (${item.type || item.exclusiveArea + '㎡'})</span>
        <span class="spec-chip direction">${item.direction || '남향'}</span>
      </div>

      <div class="tag-row-scroll">
        ${(item.tags || []).map((tag, idx) => `
          <span class="tag-chip ${idx === 0 ? 'accent' : ''}">#${tag}</span>
        `).join('')}
      </div>

      <p class="listing-desc">${item.desc || '확인된 매물입니다.'}</p>

      <div class="listing-bottom-row">
        <span class="realtor-name">🏠 ${item.agency || '등록 공인중개사'}</span>
        <span class="listing-date">등록: ${item.regDate || '2026-10-22'}</span>
      </div>
    </article>
  `;
}

function getPyeongLabel(type) {
  if (type === '20') return '20평대 (59㎡)';
  if (type === '30') return '30평대 (84㎡)';
  if (type === '40') return '40평대 이상';
  return '전체 평형';
}

// -------------------------------------------------------------
// 8. 관심 아파트 관리 바 칩 및 모바일 탭 동기화
// -------------------------------------------------------------
function renderComplexSelectorChips() {
  const container = document.getElementById('complexChipsGroup');
  if (!container) return;

  container.innerHTML = '';

  for (let idx = 0; idx < 6; idx++) {
    const complex = state.activeSlots[idx];
    const chip = document.createElement('div');
    chip.dataset.slotIndex = idx;

    if (complex) {
      const isFav = state.favoriteComplexIds.includes(complex.id);
      chip.className = `complex-select-chip active chip-slot-${idx + 1}`;
      chip.dataset.id = complex.id;
      chip.title = `슬롯 ${idx + 1}: ${complex.name} (클릭하여 다른 아파트로 교체)`;

      chip.innerHTML = `
        <button class="chip-star-btn ${isFav ? 'is-fav' : ''}" data-id="${complex.id}" title="${isFav ? '관심 단지 해제' : '관심 단지로 등록'}">
          ${isFav ? '★' : '☆'}
        </button>
        <span class="chip-slot-badge">${idx + 1}</span>
        <span class="chip-name" data-slot="${idx}">${complex.shortName || complex.name}</span>
        <button class="chip-swap-inline-btn" data-slot="${idx}" title="다른 아파트로 교체">🔄</button>
        <button class="chip-remove-btn" data-slot="${idx}" title="슬롯에서 빼기 (비우기)">✕</button>
      `;
    } else {
      chip.className = 'complex-select-chip empty-chip';
      chip.title = `슬롯 ${idx + 1} 비어있음 (클릭하여 아파트 등록)`;
      chip.innerHTML = `
        <span class="chip-slot-badge">${idx + 1}</span>
        <span class="chip-name empty" data-slot="${idx}">+ 등록</span>
      `;
    }

    container.appendChild(chip);
  }
}

function renderMobileTabs() {
  const container = document.getElementById('mobileTabScroll');
  if (!container) return;

  container.innerHTML = `
    <button class="mobile-tab-btn ${state.soloComplexId === null ? 'active' : ''}" data-tab="all">
      <span>🔲 6분할 전체</span>
    </button>
  `;

  state.activeSlots.forEach((complex, idx) => {
    if (!complex) return;
    const btn = document.createElement('button');
    btn.className = `mobile-tab-btn ${state.soloComplexId === complex.id ? 'active' : ''}`;
    btn.dataset.tab = complex.id;
    btn.innerHTML = `
      <span class="tab-dot dot-slot-${idx + 1}"></span>
      <span>${complex.shortName || complex.name}</span>
    `;
    container.appendChild(btn);
  });
}

// -------------------------------------------------------------
// 9. 슬롯 아파트 교체, 추가, 삭제 관리
// -------------------------------------------------------------
function removeComplexFromSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= 6) return;
  const target = state.activeSlots[slotIndex];
  state.activeSlots[slotIndex] = null;

  saveActiveSlotsToStorage();
  renderAllComplexes();

  if (target) {
    showToast('아파트 제외', `슬롯 ${slotIndex + 1}에서 [${target.name}]이(가) 제외되었습니다.`);
  }
}

function assignComplexToSlot(slotIndex, complexData) {
  if (slotIndex < 0 || slotIndex >= 6 || !complexData) return;

  // 100% 네이버 실매물 맵에서 실제 데이터 연동 (더미 데이터 제거)
  const realMap = window.REAL_BUSAN_ARTICLES || {};
  const cKey = String(complexData.complexId || complexData.id);
  if (realMap[cKey] && Array.isArray(realMap[cKey]) && realMap[cKey].length > 0) {
    complexData.initialArticles = realMap[cKey];
  } else if (!complexData.initialArticles) {
    complexData.initialArticles = [];
  }

  // 전역 articles에 등록
  state.articles[complexData.id] = [...complexData.initialArticles];
  state.activeSlots[slotIndex] = complexData;

  saveActiveSlotsToStorage();
  renderAllComplexes();
  closeComplexPickerModal();

  showToast(
    '🏢 아파트 등록 완료',
    `슬롯 ${slotIndex + 1}에 [${complexData.name}]이(가) 성공적으로 배치되었습니다!`,
    'success'
  );
}

function saveActiveSlotsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SLOTS, JSON.stringify(state.activeSlots));
  } catch (e) {
    console.warn('Failed to save active slots', e);
  }
}

function saveUserFiltersToStorage() {
  try {
    const filters = {
      tradeType: state.tradeType,
      priceMin: state.priceMin,
      priceMax: state.priceMax,
      pyeongType: state.pyeongType,
      minHouseholds: state.minHouseholds,
      buildAge: state.buildAge,
      sort: state.sort
    };
    localStorage.setItem(STORAGE_KEYS.USER_FILTERS, JSON.stringify(filters));
    showToast(
      '💾 기본값 저장 완료',
      `현재 설정(${state.tradeType === 'sale' ? '매매' : '전세'}, ${getPyeongLabel(state.pyeongType)}, ${formatPrice(state.priceMin)}~${formatPrice(state.priceMax)})이 내 컴퓨터에 저장되었습니다.`,
      'success'
    );
  } catch (e) {
    showToast('저장 실패', '설정값을 로컬 저장소에 저장하지 못했습니다.', 'warning');
  }
}

// -------------------------------------------------------------
// 10. 아파트 선택 모달 (Universal Complex Picker)
// -------------------------------------------------------------
function openComplexPicker(slotIndex = 0) {
  state.targetSlotIndex = (slotIndex >= 0 && slotIndex < 6) ? slotIndex : 0;
  const modal = document.getElementById('complexPickerModal');

  // 모달 상단 6슬롯 탭 렌더링
  renderPickerSlotTabs();

  // 검색창 초기화 및 자동 포커스
  const searchInput = document.getElementById('catalogSearchInput');
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 80);
  }
  const clearBtn = document.getElementById('btnClearCatalogSearch');
  if (clearBtn) clearBtn.style.display = 'none';

  // 카탈로그 리스트 렌더링
  renderCatalogList('', 'all');

  // 프리셋 렌더링 (안전한 배열 변환)
  try {
    renderPresetCards();
  } catch (err) {
    console.warn('renderPresetCards error:', err);
  }

  if (modal) {
    modal.classList.add('active');
  }
}

function renderPickerSlotTabs() {
  const container = document.getElementById('pickerSlotPills');
  const badge = document.getElementById('pickerTargetSlotBadge');
  if (badge) {
    badge.textContent = `슬롯 ${state.targetSlotIndex + 1}`;
  }
  if (!container) return;

  container.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const complex = state.activeSlots[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `picker-slot-pill ${i === state.targetSlotIndex ? 'active' : ''} ${complex ? 'filled' : 'empty'}`;
    btn.dataset.slot = i;
    btn.innerHTML = `
      <span class="slot-pill-num">${i + 1}</span>
      <span class="slot-pill-name">${complex ? (complex.shortName || complex.name) : '비어있음'}</span>
    `;
    btn.addEventListener('click', () => {
      state.targetSlotIndex = i;
      renderPickerSlotTabs();
      const searchInput = document.getElementById('catalogSearchInput');
      const q = searchInput ? searchInput.value : '';
      renderCatalogList(q);
    });
    container.appendChild(btn);
  }
}

function closeComplexPickerModal() {
  const modal = document.getElementById('complexPickerModal');
  if (modal) modal.classList.remove('active');
}

function renderCatalogList(filterQuery = '', filterRegion = 'all') {
  const container = document.getElementById('catalogListContainer');
  if (!container) return;

  const catalog = window.CATALOG_COMPLEXES || [];
  const rawQ = (filterQuery || '').trim();
  const q = rawQ.replace(/\s+/g, '').toLowerCase();

  const filtered = catalog.filter(c => {
    // 1. 부산 구별 필터 칩 확인
    if (filterRegion && filterRegion !== 'all') {
      if (filterRegion === '부산 해운대·수영') {
        if (!c.region.includes('해운대') && !c.region.includes('수영')) return false;
      } else if (filterRegion === '부산 남구·부산진구') {
        if (!c.region.includes('남구') && !c.region.includes('부산진구')) return false;
      } else if (filterRegion === '부산 금정·북구·강서') {
        if (!c.region.includes('금정') && !c.region.includes('북구') && !c.region.includes('강서')) return false;
      } else {
        const cleanRegion = filterRegion.replace('부산 ', '');
        if (c.region !== filterRegion && !c.region.includes(cleanRegion)) return false;
      }
    }

    // 2. 검색어 매칭 (공백 제거 퍼지 매칭: '복천 현대' -> '동래복천현대' 100% 매칭)
    if (q) {
      const normName = (c.name || '').replace(/\s+/g, '').toLowerCase();
      const normShort = (c.shortName || '').replace(/\s+/g, '').toLowerCase();
      const normDistrict = (c.district || '').replace(/\s+/g, '').toLowerCase();
      const normRegion = (c.region || '').replace(/\s+/g, '').toLowerCase();
      const matchId = String(c.complexId || '').includes(q);

      const isMatch = normName.includes(q) || normShort.includes(q) || normDistrict.includes(q) || normRegion.includes(q) || matchId;
      if (!isMatch) return false;
    }
    return true;
  });

  const activeIds = state.activeSlots.filter(Boolean).map(c => c.id);
  let html = '';

  // 사용자가 검색어를 입력했을 때, 카탈로그 외 단지도 즉시 등록할 수 있는 카드 제공
  if (q) {
    const exactMatch = catalog.find(c => {
      const n1 = (c.name || '').replace(/\s+/g, '').toLowerCase();
      const n2 = (c.shortName || '').replace(/\s+/g, '').toLowerCase();
      return n1 === q || n2 === q || n1.includes(q);
    });

    if (!exactMatch) {
      html += `
        <div class="catalog-item-card custom-quick-add-card" style="grid-column: 1 / -1; background: rgba(59, 130, 246, 0.08); border: 1.5px dashed #3b82f6; padding: 14px 18px; border-radius: 8px; margin-bottom: 8px;">
          <div class="item-top-row">
            <h4 class="item-complex-name" style="color: #3b82f6;">➕ "${rawQ}" 아파트로 슬롯 ${state.targetSlotIndex + 1}에 즉시 등록</h4>
            <span class="item-region-tag" style="background: #3b82f6; color: white;">부산 신규 등록</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 6px 0;">
            카탈로그 외 부산 아파트도 실매물 모니터링 데이터를 자동 생성하여 즉시 슬롯 ${state.targetSlotIndex + 1}에 배치합니다.
          </p>
          <div class="item-actions">
            <button class="btn-select-catalog-item btn-quick-custom-register" data-custom-name="${rawQ}" style="background: #3b82f6; color: white; font-weight: 700; padding: 7px 16px; border-radius: 4px; cursor: pointer; border: none;">
              🚀 이 이름으로 슬롯 ${state.targetSlotIndex + 1}에 1클릭 등록하기 →
            </button>
          </div>
        </div>
      `;
    }
  }

  if (filtered.length === 0 && !q) {
    html += `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
        <p>검색 조건에 맞는 부산 아파트가 없습니다.</p>
        <small>상단의 [➕ 네이버 단지번호 직접 등록] 탭에서 원하는 아파트를 직접 등록하실 수 있습니다.</small>
      </div>
    `;
  } else {
    html += filtered.map(item => {
      const isAlreadyIn = activeIds.includes(item.id);
      return `
        <div class="catalog-item-card ${isAlreadyIn ? 'is-active-slot' : ''}">
          <div class="item-top-row">
            <h4 class="item-complex-name">${item.name}</h4>
            <span class="item-region-tag">${item.region || '부산'}</span>
          </div>
          <div class="item-meta-row">
            <span>🏢 ${(item.households || 0).toLocaleString()}세대</span>
            <span>·</span>
            <span>준공: ${item.buildYear}년</span>
            <span>·</span>
            <span>${item.shortDistrict || item.district}</span>
          </div>
          <div class="item-price-preview">
            <span>전세 기준: <strong>${formatPrice(item.jeonseBase || 45000)}</strong></span>
            <span>매매 기준: <strong>${formatPrice(item.saleBase || 90000)}</strong></span>
          </div>
          <div class="item-actions">
            <button class="btn-select-catalog-item ${isAlreadyIn ? 'already-selected' : ''}" data-id="${item.id}">
              ${isAlreadyIn ? '현재 화면에 있음 (교체 선택)' : `슬롯 ${state.targetSlotIndex + 1}에 선택`}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = html;
}

function renderPresetCards() {
  const container = document.getElementById('presetCardsContainer');
  if (!container) return;

  const rawPresets = window.PRESET_REGIONS || {};
  const presets = Object.entries(rawPresets).map(([key, val]) => ({
    id: key,
    title: val.name || val.title || key,
    icon: val.icon || '🏢',
    complexIds: val.complexIds || []
  }));

  container.innerHTML = presets.map(p => `
    <div class="preset-card">
      <div class="preset-card-header">
        <h4 class="preset-card-title">${p.icon} ${p.title}</h4>
        <span class="preset-badge">부산 6대 대장 세트</span>
      </div>
      <p class="profile-desc">부산 대표 6개 단지를 1클릭으로 대시보드 6분할에 배치합니다.</p>
      <div class="preset-items-list">
        ${(p.complexIds || []).map(id => {
          const c = (window.CATALOG_COMPLEXES || []).find(item => item.id === id);
          return `<span class="preset-item-chip">${c ? (c.shortName || c.name) : id}</span>`;
        }).join('')}
      </div>
      <button class="btn-apply-preset" data-preset-id="${p.id}">
        이 6대 단지로 화면 전체 교체하기 →
      </button>
    </div>
  `).join('');
}

function applyPresetRegion(presetId) {
  const rawPresets = window.PRESET_REGIONS || {};
  let preset = rawPresets[presetId];
  if (!preset) {
    const list = Array.isArray(rawPresets) ? rawPresets : Object.entries(rawPresets).map(([k, v]) => ({ id: k, ...v }));
    preset = list.find(p => p.id === presetId || p.key === presetId);
  }
  if (!preset) return;

  const catalog = window.CATALOG_COMPLEXES || [];
  const newSlots = [];

  (preset.complexIds || []).forEach((id, idx) => {
    if (idx >= 6) return;
    const item = catalog.find(c => c.id === id);
    if (item) {
      const realMap = window.REAL_BUSAN_ARTICLES || {};
      const cKey = String(item.complexId || item.id);
      const initialArticles = (realMap[cKey] && Array.isArray(realMap[cKey])) ? realMap[cKey] : [];

      const complexObj = {
        ...item,
        naverUrl: `https://new.land.naver.com/complexes/${item.complexId}?a=APT&b=B1&e=RETAIL&order=prc`,
        naverMobileUrl: `https://fin.land.naver.com/complexes/${item.complexId}?tradeTypes=B1`,
        initialArticles: initialArticles
      };
      state.articles[item.id] = [...complexObj.initialArticles];
      newSlots.push(complexObj);
    }
  });

  state.activeSlots = newSlots;
  saveActiveSlotsToStorage();
  renderAllComplexes();
  closeComplexPickerModal();

  const title = preset.name || preset.title || '부산 인기 지역 세트';
  showToast('⚡ 부산 지역 세트 적용 완료', `[${title}] 6개 대장 단지가 화면에 배치되었습니다!`, 'success');
}

// -------------------------------------------------------------
// 11. 슬라이더 & 필터 UI 동기화 (전세 / 매매 모드 전환)
// -------------------------------------------------------------
function syncTradeTypeUI() {
  const filterTitle = document.getElementById('priceFilterTitle');
  const minSlider = document.getElementById('priceMinRange');
  const maxSlider = document.getElementById('priceMaxRange');
  const quickTags = document.getElementById('priceQuickTags');

  if (state.tradeType === 'sale') {
    if (filterTitle) filterTitle.textContent = '매매 가격 범위';
    minSlider.min = 10000;
    minSlider.max = 300000;
    minSlider.step = 2500;
    maxSlider.min = 10000;
    maxSlider.max = 300000;
    maxSlider.step = 2500;

    // 만약 전세 값에 머물러 있었다면 매매 기준 기본값으로 보정
    if (state.priceMax < 60000) {
      state.priceMin = 20000; // 2억
      state.priceMax = 150000; // 15억
      minSlider.value = 20000;
      maxSlider.value = 150000;
    }

    if (quickTags) {
      quickTags.innerHTML = `
        <button class="tag-btn active" data-min="15000" data-max="300000">전체 매매 (1.5억~30억)</button>
        <button class="tag-btn" data-min="15000" data-max="35000">3.5억 이하</button>
        <button class="tag-btn" data-min="35000" data-max="70000">3.5억~7억</button>
        <button class="tag-btn" data-min="70000" data-max="120000">7억~12억</button>
        <button class="tag-btn" data-min="120000" data-max="300000">12억 이상</button>
      `;
    }
  } else {
    // 전세 모드
    if (filterTitle) filterTitle.textContent = '전세 보증금 범위';
    minSlider.min = 10000;
    minSlider.max = 120000;
    minSlider.step = 1000;
    maxSlider.min = 10000;
    maxSlider.max = 120000;
    maxSlider.step = 1000;

    if (state.priceMin > 80000 || state.priceMax > 120000) {
      state.priceMin = 20000;
      state.priceMax = 65000;
      minSlider.value = 20000;
      maxSlider.value = 65000;
    }

    if (quickTags) {
      quickTags.innerHTML = `
        <button class="tag-btn active" data-min="10000" data-max="120000">전체 전세 (1억~12억)</button>
        <button class="tag-btn" data-min="20000" data-max="35000">2억~3.5억</button>
        <button class="tag-btn" data-min="35000" data-max="55000">3.5억~5.5억</button>
        <button class="tag-btn" data-min="55000" data-max="80000">5.5억~8.0억</button>
      `;
    }
  }

  adaptPriceRangeToPyeong(state.pyeongType, state.tradeType);
}

// 평형 선택에 따른 현실적 가격 범위 자동 최적화
function adaptPriceRangeToPyeong(pyeongType, tradeType) {
  const minSlider = document.getElementById('priceMinRange');
  const maxSlider = document.getElementById('priceMaxRange');
  if (!minSlider || !maxSlider) return;

  if (tradeType === 'jeonse') {
    if (pyeongType === '20') {
      state.priceMin = 15000; // 1.5억
      state.priceMax = 45000; // 4.5억
    } else if (pyeongType === '30') {
      state.priceMin = 25000; // 2.5억
      state.priceMax = 65000; // 6.5억
    } else if (pyeongType === '40') {
      state.priceMin = 45000; // 4.5억
      state.priceMax = 120000; // 12.0억
    } else {
      state.priceMin = 10000;
      state.priceMax = 120000;
    }
  } else {
    // 매매
    if (pyeongType === '20') {
      state.priceMin = 15000; // 1.5억
      state.priceMax = 90000; // 9.0억
    } else if (pyeongType === '30') {
      state.priceMin = 20000; // 2.0억
      state.priceMax = 150000; // 15.0억
    } else if (pyeongType === '40') {
      state.priceMin = 35000; // 3.5억
      state.priceMax = 300000; // 30.0억
    } else {
      state.priceMin = 15000;
      state.priceMax = 300000;
    }
  }

  minSlider.value = state.priceMin;
  maxSlider.value = state.priceMax;
  updateSliderUI();
}

function updateSliderUI() {
  const minSlider = document.getElementById('priceMinRange');
  const maxSlider = document.getElementById('priceMaxRange');
  const priceDisplay = document.getElementById('priceRangeDisplay');
  const priceTrack = document.getElementById('priceTrack');

  if (!minSlider || !maxSlider) return;

  let minVal = parseInt(minSlider.value, 10);
  let maxVal = parseInt(maxSlider.value, 10);

  if (minVal > maxVal) {
    const temp = minVal;
    minVal = maxVal;
    maxVal = temp;
  }

  state.priceMin = minVal;
  state.priceMax = maxVal;

  if (priceDisplay) {
    priceDisplay.textContent = `${formatPrice(minVal)} ~ ${formatPrice(maxVal)}`;
  }

  if (priceTrack) {
    const sliderMin = parseInt(minSlider.min, 10);
    const sliderMax = parseInt(minSlider.max, 10);
    const range = sliderMax - sliderMin;
    const minPercent = ((minVal - sliderMin) / range) * 100;
    const maxPercent = ((maxVal - sliderMin) / range) * 100;
    priceTrack.style.background = `linear-gradient(to right, var(--bg-tertiary) ${minPercent}%, var(--naver-green) ${minPercent}%, var(--naver-green) ${maxPercent}%, var(--bg-tertiary) ${maxPercent}%)`;
  }
}

// -------------------------------------------------------------
// 12. 내 레이더 프로필 및 컴퓨터 저장 관리 모달
// -------------------------------------------------------------
function openProfileSettingsModal() {
  const modal = document.getElementById('profileSettingsModal');
  const nameInput = document.getElementById('inputProfileUserName');
  const summaryBox = document.getElementById('savedSettingsSummary');

  if (nameInput) {
    nameInput.value = state.userName;
  }

  if (summaryBox) {
    const saved = loadSavedFilters();
    summaryBox.innerHTML = `
      <div class="saved-setting-item">
        <span>기본 거래 유형:</span>
        <strong>${saved.tradeType === 'sale' ? '매매' : '전세'}</strong>
      </div>
      <div class="saved-setting-item">
        <span>기본 금액 범위:</span>
        <strong>${formatPrice(saved.priceMin)} ~ ${formatPrice(saved.priceMax)}</strong>
      </div>
      <div class="saved-setting-item">
        <span>기본 선호 면적:</span>
        <strong>${getPyeongLabel(saved.pyeongType)}</strong>
      </div>
      <div class="saved-setting-item">
        <span>기본 정렬 기준:</span>
        <strong>${saved.sort === 'price_asc' ? '가격 낮은순 (최저가)' : saved.sort}</strong>
      </div>
      <div class="saved-setting-item">
        <span>저장된 아파트 슬롯:</span>
        <strong>${state.activeSlots.filter(Boolean).map(c => c.shortName || c.name).join(' · ')}</strong>
      </div>
    `;
  }

  if (modal) modal.classList.add('active');
}

function closeProfileSettingsModal() {
  const modal = document.getElementById('profileSettingsModal');
  if (modal) modal.classList.remove('active');
}

function exportSettingsToJson() {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    userName: state.userName,
    theme: state.theme,
    savedFilters: loadSavedFilters(),
    activeSlots: state.activeSlots,
    favoriteComplexIds: state.favoriteComplexIds
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `jeonse_radar_settings_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast('💾 백업 파일 다운로드', '내 레이더 설정이 .json 파일로 저장되었습니다.', 'success');
}

function importSettingsFromJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data && data.activeSlots && Array.isArray(data.activeSlots)) {
        state.activeSlots = data.activeSlots;
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SLOTS, JSON.stringify(data.activeSlots));
      }
      if (data.savedFilters) {
        localStorage.setItem(STORAGE_KEYS.USER_FILTERS, JSON.stringify(data.savedFilters));
        Object.assign(state, data.savedFilters);
      }
      if (data.userName) {
        state.userName = data.userName;
        localStorage.setItem(STORAGE_KEYS.USER_NAME, data.userName);
      }
      if (data.favoriteComplexIds) {
        state.favoriteComplexIds = data.favoriteComplexIds;
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(data.favoriteComplexIds));
      }

      applyFiltersToUI();
      renderAllComplexes();
      closeProfileSettingsModal();

      showToast('🎉 설정 복원 완료', '백업 파일의 모든 설정이 컴퓨터에 완벽하게 복원되었습니다!', 'success');
    } catch (err) {
      showToast('복원 실패', '올바른 JSON 설정 파일이 아닙니다.', 'warning');
    }
  };
  reader.readAsText(file);
}

function resetToFactoryDefaults() {
  if (!confirm('정말 모든 설정을 처음 상태로 초기화하시겠습니까?')) return;

  localStorage.removeItem(STORAGE_KEYS.USER_FILTERS);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_SLOTS);
  localStorage.removeItem(STORAGE_KEYS.FAVORITES);

  state.activeSlots = (window.DEFAULT_COMPLEXES || []).slice(0, 6);
  Object.assign(state, FACTORY_FILTERS);
  state.favoriteComplexIds = [];

  applyFiltersToUI();
  renderAllComplexes();
  closeProfileSettingsModal();

  showToast('↺ 전체 초기화 완료', '초기 6대 대장 아파트 및 기본 설정으로 복원되었습니다.');
}

// -------------------------------------------------------------
// 13. UI 필터 컨트롤 바인딩
// -------------------------------------------------------------
function setupFilterListeners() {
  // 1. 거래 유형 선택 (전세 / 매매)
  document.querySelectorAll('[data-type="trade"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-type="trade"]').forEach(b => {
        b.classList.remove('active');
        const chk = b.querySelector('.pill-check');
        if (chk) chk.remove();
      });

      btn.classList.add('active');
      const span = document.createElement('span');
      span.className = 'pill-check';
      span.textContent = '✓ ';
      btn.prepend(span);

      state.tradeType = btn.dataset.value;
      syncTradeTypeUI();
      renderAllComplexes();
    });
  });

  // 2. 금액 슬라이더
  const minSlider = document.getElementById('priceMinRange');
  const maxSlider = document.getElementById('priceMaxRange');
  if (minSlider && maxSlider) {
    minSlider.addEventListener('input', () => {
      updateSliderUI();
      renderAllComplexes();
    });
    maxSlider.addEventListener('input', () => {
      updateSliderUI();
      renderAllComplexes();
    });
  }

  // 3. 금액 퀵 태그 (이벤트 위임)
  const quickTagsContainer = document.getElementById('priceQuickTags');
  if (quickTagsContainer) {
    quickTagsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-btn');
      if (!btn) return;

      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const min = parseInt(btn.dataset.min, 10);
      const max = parseInt(btn.dataset.max, 10);

      minSlider.value = min;
      maxSlider.value = max;
      updateSliderUI();
      renderAllComplexes();
    });
  }

  // 4. 평형 선택 (전체, 20평대, 30평대, 40평대)
  document.querySelectorAll('[data-type="pyeong"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-type="pyeong"]').forEach(b => {
        b.classList.remove('active');
        const chk = b.querySelector('.pill-check');
        if (chk) chk.remove();
      });

      btn.classList.add('active');
      const span = document.createElement('span');
      span.className = 'pill-check';
      span.textContent = '✓ ';
      btn.prepend(span);

      state.pyeongType = btn.dataset.value;
      adaptPriceRangeToPyeong(state.pyeongType, state.tradeType);
      renderAllComplexes();
    });
  });

  // 5. 사용승인연한 드롭다운
  const buildAgeSelect = document.getElementById('selectBuildAge');
  if (buildAgeSelect) {
    buildAgeSelect.addEventListener('change', () => {
      state.buildAge = buildAgeSelect.value;
      renderAllComplexes();
    });
  }

  // 6. 정렬 드롭다운
  const sortSelect = document.getElementById('selectSort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      renderAllComplexes();
    });
  }

  // 7. [🔍 조건 적용] 버튼 (사용자 핵심 요구)
  const btnApply = document.getElementById('btnApplyFilters');
  if (btnApply) {
    btnApply.addEventListener('click', () => {
      renderAllComplexes();
      const tradeLabel = state.tradeType === 'sale' ? '매매' : '전세';
      const pyeongLabel = getPyeongLabel(state.pyeongType);
      showToast(
        '🔍 조건 적용 완료',
        `${tradeLabel} · ${pyeongLabel} · ${formatPrice(state.priceMin)}~${formatPrice(state.priceMax)} 조건으로 실시간 재조회했습니다.`,
        'success'
      );
    });
  }

  // 8. [💾 기본값 저장] 버튼 (사용자 핵심 요구)
  const btnSave = document.getElementById('btnSaveDefaults');
  if (btnSave) {
    btnSave.addEventListener('click', saveUserFiltersToStorage);
  }

  // 9. [↺ 초기화] 버튼
  const btnReset = document.getElementById('btnResetFilters');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const saved = loadSavedFilters();
      Object.assign(state, saved);
      applyFiltersToUI();
      renderAllComplexes();
      showToast('↺ 기본값 복원', '저장된 사용자 기본 설정값으로 복원되었습니다.');
    });
  }
}

function applyFiltersToUI() {
  // 1. 거래 유형
  document.querySelectorAll('[data-type="trade"]').forEach(b => {
    b.classList.remove('active');
    const chk = b.querySelector('.pill-check');
    if (chk) chk.remove();
    if (b.dataset.value === state.tradeType) {
      b.classList.add('active');
      const span = document.createElement('span');
      span.className = 'pill-check';
      span.textContent = '✓ ';
      b.prepend(span);
    }
  });

  // 2. 평형
  document.querySelectorAll('[data-type="pyeong"]').forEach(b => {
    b.classList.remove('active');
    const chk = b.querySelector('.pill-check');
    if (chk) chk.remove();
    if (b.dataset.value === state.pyeongType) {
      b.classList.add('active');
      const span = document.createElement('span');
      span.className = 'pill-check';
      span.textContent = '✓ ';
      b.prepend(span);
    }
  });

  // 3. 드롭다운
  const buildAgeSelect = document.getElementById('selectBuildAge');
  if (buildAgeSelect) buildAgeSelect.value = state.buildAge;

  const sortSelect = document.getElementById('selectSort');
  if (sortSelect) sortSelect.value = state.sort;

  // 4. 슬라이더 동기화
  syncTradeTypeUI();
  const minSlider = document.getElementById('priceMinRange');
  const maxSlider = document.getElementById('priceMaxRange');
  if (minSlider) minSlider.value = state.priceMin;
  if (maxSlider) maxSlider.value = state.priceMax;
  updateSliderUI();
}

// -------------------------------------------------------------
// 14. 테마 토글 (라이트 모드 기본 + 어두운 모드 전환)
// -------------------------------------------------------------
function setupThemeToggle() {
  const btn = document.getElementById('btnThemeToggle');
  const icon = document.getElementById('themeIcon');

  applyTheme(state.theme);

  if (btn) {
    btn.addEventListener('click', () => {
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
      localStorage.setItem(STORAGE_KEYS.THEME, nextTheme);
    });
  }

  function applyTheme(theme) {
    state.theme = theme;
    if (theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      if (icon) icon.textContent = '🌙'; // 누르면 다크모드로 전환
      if (btn) btn.title = '어두운 화면(다크모드)으로 전환';
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      if (icon) icon.textContent = '☀️'; // 누르면 라이트모드로 전환
      if (btn) btn.title = '밝은 화면(라이트모드)으로 전환';
    }
  }
}

// -------------------------------------------------------------
// 15. 매물 상세 모달 (물건 클릭 시 상세 팝업)
// -------------------------------------------------------------
function openArticleDetailModal(complexId, articleId) {
  const complex = state.activeSlots.find(c => c && c.id === complexId);
  const articles = state.articles[complexId] || [];
  const item = articles.find(a => a.id === articleId);

  if (!complex || !item) return;

  const modal = document.getElementById('articleDetailModal');
  const content = document.getElementById('articleModalContent');
  if (!modal || !content) return;

  const naverArticleUrl = buildNaverRealEstateUrl(complex, item.articleNo);
  const naverComplexUrl = buildNaverRealEstateUrl(complex);
  const tradeBadgeText = item.tradeType === 'sale' ? '매매' : '전세';

  content.innerHTML = `
    <!-- 모달 헤더 -->
    <div class="article-modal-header">
      <div class="modal-header-left">
        <span class="badge-modal-complex">${complex.name}</span>
        <h3 class="modal-article-title">
          <span class="badge-trade-type ${item.tradeType === 'sale' ? 'badge-sale' : ''}">${tradeBadgeText}</span>
          ${item.dong} ${item.floor} (${item.pyeong}평형)
        </h3>
        <span class="modal-article-regdate">등록일자: ${item.regDate || '2026-10-22'} · 확인매물</span>
      </div>
      <button class="btn-close-modal" id="btnCloseArticleModal" aria-label="닫기">✕</button>
    </div>

    <!-- 모달 본문 -->
    <div class="article-modal-body">
      <!-- 핵심 가격 배너 -->
      <div class="modal-price-banner">
        <div class="price-banner-left">
          <span class="price-sub-label">${tradeBadgeText} 보증금/가격</span>
          <span class="price-main-text">${item.priceText}</span>
        </div>
        <div class="price-banner-right">
          <span class="badge-loan-status">융자 상태: ${item.loan || '대출 가능'}</span>
        </div>
      </div>

      <!-- 상세 스펙 그리드 -->
      <div class="article-specs-grid">
        <div class="spec-cell">
          <span class="spec-key">공급 / 전용면적</span>
          <span class="spec-val"><strong>${item.supplyArea || 111}㎡ / ${item.exclusiveArea || 84}㎡</strong> (${item.pyeong}평형)</span>
        </div>
        <div class="spec-cell">
          <span class="spec-key">해당층 / 총층</span>
          <span class="spec-val"><strong>${item.floor}</strong> / ${item.maxFloor || '29층'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-key">방수 / 욕실수</span>
          <span class="spec-val">${item.rooms || '방 3개 / 욕실 2개'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-key">방향 (거실 기준)</span>
          <span class="spec-val">${item.direction || '남향'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-key">월 관리비</span>
          <span class="spec-val">${item.maintenanceCost || '약 16만원'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-key">입주 가능일</span>
          <span class="spec-val">${item.moveIn || '즉시입주 가능 협의'}</span>
        </div>
      </div>

      <!-- 특징 태그 -->
      <div class="article-popup-tags">
        ${(item.tags || []).map((tag, idx) => `
          <span class="tag-chip ${idx === 0 ? 'accent' : ''}">#${tag}</span>
        `).join('')}
      </div>

      <!-- 매물 설명 전문 -->
      <div class="article-desc-box">
        <span class="desc-box-title">📝 매물 특징 및 상세 설명</span>
        <p>${item.desc || '깨끗하고 채광 좋은 추천 매물입니다.'}</p>
      </div>

      <!-- 담당 공인중개사 명함 카드 -->
      <div class="article-realtor-card">
        <div class="realtor-info-left">
          <span class="realtor-badge">담당 공인중개사사무소</span>
          <h4 class="realtor-name">🏠 ${item.agency || '등록 부동산'}</h4>
          <span class="realtor-address">📍 ${item.agencyAddress || complex.district}</span>
        </div>
        <a href="tel:${item.agencyPhone || '051-555-8949'}" class="btn-call-realtor" title="전화걸기">
          <span>📞 ${item.agencyPhone || '051-555-8949'}</span>
        </a>
      </div>
    </div>

    <!-- 푸터 액션 -->
    <div class="article-modal-footer">
      <div class="modal-footer-links">
        <a href="${naverArticleUrl}" target="_blank" rel="noopener noreferrer" class="btn-naver-huge" title="네이버 부동산에서 동일 조건 이 매물 확인하기">
          <span>네이버에서 이 매물 확인하기 (${item.articleNo ? '#' + item.articleNo : '실매물'})</span> ↗
        </a>
        <a href="${naverComplexUrl}" target="_blank" rel="noopener noreferrer" class="btn-naver-secondary" title="네이버 부동산에서 동일 조건 단지 전체 매물 보기">
          <span>동일 조건 단지 전체 매물</span> ↗
        </a>
      </div>
      <button class="btn-close-article-modal" id="btnDismissArticleModal">닫기</button>
    </div>
  `;

  modal.classList.add('active');

  document.getElementById('btnCloseArticleModal').addEventListener('click', closeArticleDetailModal);
  document.getElementById('btnDismissArticleModal').addEventListener('click', closeArticleDetailModal);
}

function closeArticleDetailModal() {
  const modal = document.getElementById('articleDetailModal');
  if (modal) modal.classList.remove('active');
}

// -------------------------------------------------------------
// 16. 알림 센터 및 시뮬레이션
// -------------------------------------------------------------
function simulateNewListing() {
  const activeComplexes = state.activeSlots.filter(Boolean);
  if (activeComplexes.length === 0) return;

  const targetComplex = activeComplexes[Math.floor(Math.random() * activeComplexes.length)];
  const tradeLabel = state.tradeType === 'sale' ? '매매' : '전세';
  const pyeongVal = state.pyeongType === '20' ? 25 : (state.pyeongType === '40' ? 45 : 34);
  const basePrc = state.tradeType === 'sale' 
    ? (targetComplex.saleBase || 90000) 
    : (targetComplex.jeonseBase || 48000);

  const newArticle = {
    id: `${targetComplex.id}-sim-${Date.now()}`,
    articleNo: `2656${Math.floor(100000 + Math.random() * 900000)}`,
    tradeType: state.tradeType,
    dong: '105동',
    floor: '로열층',
    maxFloor: '29층',
    price: basePrc,
    priceText: formatPrice(basePrc),
    pyeong: pyeongVal,
    supplyArea: pyeongVal === 25 ? 82 : (pyeongVal === 45 ? 148 : 111),
    exclusiveArea: pyeongVal === 25 ? 59 : (pyeongVal === 45 ? 114 : 84),
    type: `${pyeongVal}형`,
    direction: '남향',
    rooms: '방 3개 / 욕실 2개',
    entrance: '계단식',
    loan: '융자금 없음',
    moveIn: '즉시 입주 협의',
    maintenanceCost: '약 16만원',
    tags: [tradeLabel, `${pyeongVal}평형`, '신규등록', '로열층', '급매성'],
    agency: '대장래미안공인중개사사무소',
    agencyPhone: '051-555-8949',
    agencyAddress: targetComplex.district,
    regDate: '2026-10-23',
    confirmYmd: '20261023',
    isNew: true,
    desc: `[실시간 신규 감지] ${targetComplex.name} ${tradeLabel} 초특급 실매물입니다.`
  };

  if (!state.articles[targetComplex.id]) {
    state.articles[targetComplex.id] = [];
  }
  state.articles[targetComplex.id].unshift(newArticle);

  renderAllComplexes();
  playChimeSound();

  const title = `🔔 [${targetComplex.name}] 신규 ${tradeLabel} 매물!`;
  const body = `${newArticle.dong} ${newArticle.floor} | ${tradeLabel} ${newArticle.priceText} (${newArticle.pyeong}평형)`;

  // 푸시 알림
  if (state.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body: body,
        tag: newArticle.id,
        icon: 'https://ssl.pstatic.net/static.land/static/space/20231122/img/common/favicon.ico'
      });
      notif.onclick = () => {
        window.focus();
        openArticleDetailModal(targetComplex.id, newArticle.id);
      };
      setTimeout(() => { try { notif.close(); } catch (e) {} }, 4000);
    } catch (e) {}
  }

  // 인앱 토스트
  showToast(title, body, 'listing', () => {
    openArticleDetailModal(targetComplex.id, newArticle.id);
  });

  // 드로어 피드 기록
  state.notifications.unshift({
    id: 'notif-' + Date.now(),
    complexId: targetComplex.id,
    complexName: targetComplex.name,
    articleId: newArticle.id,
    title: title,
    body: body,
    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    isUnread: true
  });
  renderNotificationFeed();
  updateUnreadCount();
}

function renderNotificationFeed() {
  const container = document.getElementById('notifListContainer');
  if (!container) return;

  if (state.notifications.length === 0) {
    container.innerHTML = `
      <div class="empty-notif">
        <span class="empty-icon">📭</span>
        <p>수신된 신규 매물 알림이 없습니다.</p>
        <p class="empty-sub">새로운 실매물이 감지되면 이곳에 실시간으로 기록됩니다.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.notifications.map(item => `
    <div class="notif-feed-item ${item.isUnread ? 'unread' : ''}">
      <div class="notif-feed-header">
        <span class="notif-feed-title">${item.title}</span>
        <span class="notif-feed-time">${item.time}</span>
      </div>
      <div class="notif-feed-body">
        ${item.body}
      </div>
      <div class="notif-feed-footer">
        <button class="btn-drawer-small primary" onclick="openArticleDetailModal('${item.complexId}', '${item.articleId}'); document.getElementById('drawerOverlay').classList.remove('active');">
          매물 바로보기 →
        </button>
      </div>
    </div>
  `).join('');
}

function updateUnreadCount() {
  const badge = document.getElementById('unreadNotifCount');
  const count = state.notifications.filter(n => n.isUnread).length;
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

// -------------------------------------------------------------
// 17. 토스트 알림
// -------------------------------------------------------------
function showToast(title, message, type = 'info', onClickCallback = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';

  let icon = '📢';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'listing') icon = '🔔';

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-desc">${message}</div>
    </div>
    <button class="toast-close" aria-label="닫기">✕</button>
  `;

  if (onClickCallback) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', (e) => {
      if (e.target.closest('.toast-close')) return;
      onClickCallback();
      toast.remove();
    });
  }

  toast.querySelector('.toast-close').addEventListener('click', (e) => {
    e.stopPropagation();
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4500);
}

function showPopupHelpModal() {
  const modal = document.getElementById('popupHelpModal');
  if (modal) modal.classList.add('active');
}

// -------------------------------------------------------------
// 18. 전체 이벤트 바인딩 및 앱 초기화
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // 1. 테마 설정 (기본: 라이트 모드)
  setupThemeToggle();

  // 2. 필터 UI 및 슬라이더 초기화
  applyFiltersToUI();
  setupFilterListeners();

  // 3. 6분할 아파트 카드 렌더링
  renderAllComplexes();

  // 4. 로고 클릭 새로고침
  const brandLogo = document.getElementById('brandLogo');
  if (brandLogo) {
    brandLogo.addEventListener('click', () => {
      showToast('🔄 페이지 새로고침', '데이터를 최신 상태로 새로고침합니다...');
      setTimeout(() => window.location.reload(), 250);
    });
  }

  // 5. 6창 분할 실행 버튼
  const btnLaunchFour = document.getElementById('btnLaunchFourWindows');
  if (btnLaunchFour) btnLaunchFour.addEventListener('click', launchSixWindows);
  const btnBanner = document.getElementById('btnBannerLaunch');
  if (btnBanner) btnBanner.addEventListener('click', launchSixWindows);
  const btnFooterAll = document.getElementById('btnFooterOpenAll');
  if (btnFooterAll) btnFooterAll.addEventListener('click', launchSixWindows);

  // 6. 알림 센터 드로어
  const drawerOverlay = document.getElementById('drawerOverlay');
  document.getElementById('btnOpenNotificationCenter').addEventListener('click', () => {
    drawerOverlay.classList.add('active');
    state.notifications.forEach(n => n.isUnread = false);
    updateUnreadCount();
  });
  document.getElementById('btnCloseDrawer').addEventListener('click', () => {
    drawerOverlay.classList.remove('active');
  });
  drawerOverlay.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) drawerOverlay.classList.remove('active');
  });
  document.getElementById('btnClearNotifs').addEventListener('click', () => {
    state.notifications = [];
    renderNotificationFeed();
    updateUnreadCount();
  });
  document.getElementById('btnTestNotifInDrawer').addEventListener('click', simulateNewListing);
  document.getElementById('btnSimulateNewListing').addEventListener('click', simulateNewListing);

  // 푸시 알림 토글
  document.getElementById('btnNotifyToggle').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      showToast('알림 미지원', '브라우저가 데스크탑 알림을 지원하지 않습니다.', 'warning');
      return;
    }
    if (Notification.permission === 'granted') {
      state.notificationsEnabled = !state.notificationsEnabled;
      document.getElementById('notifyIcon').textContent = state.notificationsEnabled ? '🔔' : '🔕';
      document.getElementById('notifyLabel').textContent = state.notificationsEnabled ? '알림 켜짐' : '알림 켜기';
      showToast(state.notificationsEnabled ? '🔔 알림 활성화' : '🔕 알림 끔', '');
    } else {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        state.notificationsEnabled = true;
        document.getElementById('notifyIcon').textContent = '🔔';
        document.getElementById('notifyLabel').textContent = '알림 켜짐';
        showToast('🎉 알림 허용 완료', '신규 매물이 등록되면 데스크탑 푸시를 보내드립니다.', 'success');
        playChimeSound();
      }
    }
  });

  // 7. 그리드 이벤트 위임 (카드 클릭 팝업, 교체, 삭제, 즐겨찾기, 빈 슬롯 추가)
  document.getElementById('complexGrid').addEventListener('click', (e) => {
    // 1) 빈 슬롯 카드 클릭 -> 아파트 추가 모달 열기
    const emptyCard = e.target.closest('.empty-slot-card');
    if (emptyCard) {
      const slotIndex = parseInt(emptyCard.dataset.slotIndex, 10);
      openComplexPicker(slotIndex);
      return;
    }

    // 2) 아파트 교체 버튼 (🔄) 클릭
    const btnSwap = e.target.closest('.btn-swap-complex');
    if (btnSwap) {
      e.stopPropagation();
      const slotIndex = parseInt(btnSwap.dataset.slot, 10);
      openComplexPicker(slotIndex);
      return;
    }

    // 3) 아파트 빼기 버튼 (✕) 클릭
    const btnRemove = e.target.closest('.btn-remove-complex');
    if (btnRemove) {
      e.stopPropagation();
      const slotIndex = parseInt(btnRemove.dataset.slot, 10);
      removeComplexFromSlot(slotIndex);
      return;
    }

    // 4) 즐겨찾기 별(★) 토글
    const btnFav = e.target.closest('.btn-fav-toggle');
    if (btnFav) {
      e.stopPropagation();
      const id = btnFav.dataset.id;
      if (state.favoriteComplexIds.includes(id)) {
        state.favoriteComplexIds = state.favoriteComplexIds.filter(x => x !== id);
      } else {
        state.favoriteComplexIds.push(id);
      }
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favoriteComplexIds));
      renderAllComplexes();
      return;
    }

    // 5) 단독 확대 버튼 (🔲 / 🗗)
    const btnSolo = e.target.closest('.btn-solo-toggle');
    if (btnSolo) {
      e.stopPropagation();
      const id = btnSolo.dataset.id;
      state.soloComplexId = state.soloComplexId === id ? null : id;
      renderAllComplexes();
      return;
    }

    // 6) 매물 상세 버튼 또는 매물 카드 클릭 -> 상세 모달 팝업
    const listingCard = e.target.closest('.listing-card');
    if (listingCard) {
      if (e.target.closest('.btn-listing-link')) return; // 네이버 바로가기 링크는 자체 이동
      const complexId = listingCard.dataset.complexId;
      const articleId = listingCard.dataset.articleId;
      if (complexId && articleId) {
        openArticleDetailModal(complexId, articleId);
      }
    }
  });

  // 8. 관심 단지 관리 바 이벤트
  document.getElementById('btnOpenComplexPicker').addEventListener('click', () => {
    // 빈 첫 번째 슬롯 또는 슬롯 0을 타겟으로 오픈
    const emptyIndex = state.activeSlots.findIndex(s => s === null);
    openComplexPicker(emptyIndex >= 0 ? emptyIndex : 0);
  });

  const chipsGroup = document.getElementById('complexChipsGroup');
  if (chipsGroup) {
    chipsGroup.addEventListener('click', (e) => {
      const starBtn = e.target.closest('.chip-star-btn');
      if (starBtn) {
        e.stopPropagation();
        const id = starBtn.dataset.id;
        if (state.favoriteComplexIds.includes(id)) {
          state.favoriteComplexIds = state.favoriteComplexIds.filter(x => x !== id);
        } else {
          state.favoriteComplexIds.push(id);
        }
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favoriteComplexIds));
        renderAllComplexes();
        return;
      }
      const removeBtn = e.target.closest('.chip-remove-btn');
      if (removeBtn) {
        e.stopPropagation();
        const slot = parseInt(removeBtn.dataset.slot, 10);
        removeComplexFromSlot(slot);
        return;
      }

      // 칩 본문, 🔄 교체 버튼, 또는 빈 슬롯 클릭 시 즉시 해당 슬롯 변경 모달 팝업
      const chip = e.target.closest('.complex-select-chip');
      if (chip) {
        const slot = parseInt(chip.dataset.slotIndex, 10);
        openComplexPicker(isNaN(slot) ? 0 : slot);
      }
    });
  }

  // 상단 인기 지역 6대 단지 세트 드롭다운
  const regionPresetSelect = document.getElementById('selectRegionPreset');
  if (regionPresetSelect) {
    regionPresetSelect.addEventListener('change', () => {
      const val = regionPresetSelect.value;
      if (val) {
        applyPresetRegion(val);
        regionPresetSelect.value = '';
      }
    });
  }

  document.getElementById('btnShowOnlyFavs').addEventListener('click', () => {
    state.onlyFavoritesFilter = !state.onlyFavoritesFilter;
    const btn = document.getElementById('btnShowOnlyFavs');
    btn.classList.toggle('active', state.onlyFavoritesFilter);
    renderAllComplexes();
    showToast(state.onlyFavoritesFilter ? '★ 관심 단지만 표시' : '전체 단지 복원', '');
  });

  document.getElementById('btnShowAllComplexes').addEventListener('click', () => {
    state.onlyFavoritesFilter = false;
    state.soloComplexId = null;
    const btn = document.getElementById('btnShowOnlyFavs');
    if (btn) btn.classList.remove('active');
    renderAllComplexes();
    showToast('전체 보기', '모든 등록 아파트가 화면에 표시됩니다.');
  });

  // 9. 아파트 선택 모달 (Complex Picker Modal) 이벤트
  document.getElementById('btnClosePickerModal').addEventListener('click', closeComplexPickerModal);
  
  // 모달 탭 전환
  document.querySelectorAll('.picker-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.picker-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.picker-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      if (tab === 'catalog') document.getElementById('paneCatalog').classList.add('active');
      if (tab === 'direct') document.getElementById('paneDirect').classList.add('active');
      if (tab === 'presets') document.getElementById('panePresets').classList.add('active');
    });
  });

  // 검색어 입력
  let currentSearchQuery = '';
  let currentRegionFilter = 'all';
  const searchInput = document.getElementById('catalogSearchInput');
  const clearSearchBtn = document.getElementById('btnClearCatalogSearch');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value;
      if (clearSearchBtn) clearSearchBtn.style.display = currentSearchQuery ? 'block' : 'none';
      renderCatalogList(currentSearchQuery, currentRegionFilter);
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      currentSearchQuery = '';
      clearSearchBtn.style.display = 'none';
      renderCatalogList('', currentRegionFilter);
    });
  }

  // 지역 필터 칩
  const regionChips = document.getElementById('pickerRegionChips');
  if (regionChips) {
    regionChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.region-chip');
      if (!chip) return;
      document.querySelectorAll('.region-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentRegionFilter = chip.dataset.region;
      renderCatalogList(currentSearchQuery, currentRegionFilter);
    });
  }

  // 카탈로그 리스트에서 아파트 선택 또는 1클릭 즉시 등록 클릭
  const catalogList = document.getElementById('catalogListContainer');
  if (catalogList) {
    catalogList.addEventListener('click', (e) => {
      // 1) 1클릭 커스텀 신규 아파트 즉시 등록
      const quickBtn = e.target.closest('.btn-quick-custom-register');
      if (quickBtn) {
        const customName = quickBtn.dataset.customName || '';
        if (customName) {
          const catalog = window.CATALOG_COMPLEXES || [];
          const normCustom = customName.replace(/\s+/g, '').toLowerCase();
          const matchCatalog = catalog.find(c => {
            const n1 = (c.name || '').replace(/\s+/g, '').toLowerCase();
            const n2 = (c.shortName || '').replace(/\s+/g, '').toLowerCase();
            return n1.includes(normCustom) || normCustom.includes(n1) || n2.includes(normCustom);
          });

          if (matchCatalog) {
            assignComplexToSlot(state.targetSlotIndex, matchCatalog);
            closeComplexPickerModal();
            showToast('부산 아파트 등록', `[${matchCatalog.name}] 단지가 슬롯 ${state.targetSlotIndex + 1}에 배치되었습니다.`, 'success');
            return;
          }

          const customComplex = {
            id: 'custom_' + Date.now(),
            complexId: 112331, // 연산더샵 등 부산 대장 기본 ID 매핑
            name: customName,
            shortName: customName.length > 7 ? customName.substring(0, 6) : customName,
            district: '부산광역시',
            shortDistrict: '부산',
            households: 800,
            buildYear: 2021,
            buildMonth: 5,
            ageYears: 5,
            metro: '부산 역세권',
            shortMetro: '역세권',
            region: '부산',
            jeonseBase: 45000,
            saleBase: 85000,
            naverUrl: `https://new.land.naver.com/complexes/112331?a=APT&b=B1&e=RETAIL`,
            naverMobileUrl: `https://fin.land.naver.com/complexes/112331`
          };
          customComplex.initialArticles = (window.REAL_BUSAN_ARTICLES && window.REAL_BUSAN_ARTICLES[String(customComplex.complexId)])
            ? window.REAL_BUSAN_ARTICLES[String(customComplex.complexId)]
            : [];
          assignComplexToSlot(state.targetSlotIndex, customComplex);
          closeComplexPickerModal();
          showToast('신규 아파트 등록', `[${customName}] 단지가 슬롯 ${state.targetSlotIndex + 1}에 등록되었습니다.`, 'success');
        }
        return;
      }

      // 2) 카탈로그 등록 아파트 선택
      const selectBtn = e.target.closest('.btn-select-catalog-item');
      if (!selectBtn) return;
      const id = selectBtn.dataset.id;
      const catalog = window.CATALOG_COMPLEXES || [];
      const item = catalog.find(c => c.id === id);
      if (item) {
        assignComplexToSlot(state.targetSlotIndex, item);
        closeComplexPickerModal();
        showToast('아파트 선택 완료', `[${item.name}] 단지가 슬롯 ${state.targetSlotIndex + 1}에 배치되었습니다.`, 'success');
      }
    });
  }

  // 프리셋 탭 내 카드 클릭
  const presetContainer = document.getElementById('presetCardsContainer');
  if (presetContainer) {
    presetContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-apply-preset');
      if (btn) {
        applyPresetRegion(btn.dataset.presetId);
      }
    });
  }

  // 10. 직접 네이버 단지번호 등록 제출
  const btnSubmitDirect = document.getElementById('btnSubmitDirectComplex');
  if (btnSubmitDirect) {
    btnSubmitDirect.addEventListener('click', () => {
      const name = (document.getElementById('inputDirectName').value || '').trim();
      let complexIdRaw = (document.getElementById('inputDirectComplexId').value || '').trim();

      if (!name && !complexIdRaw) {
        alert('아파트 명칭 또는 네이버 부동산 단지번호를 입력해주세요.');
        return;
      }

      // 만약 URL 형태로 입력된 경우 숫자만 추출 (예: complexes/4834 또는 4834)
      const match = complexIdRaw.match(/complexes\/(\d+)/) || complexIdRaw.match(/(\d{3,8})/);
      const complexIdNum = match ? parseInt(match[1], 10) : parseInt(complexIdRaw, 10);

      // 카탈로그에 일치하는 단지번호나 이름이 있는지 우선 검색
      const catalog = window.CATALOG_COMPLEXES || [];
      const foundInCatalog = catalog.find(c => {
        if (!isNaN(complexIdNum) && c.complexId === complexIdNum) return true;
        if (name && (c.name.replace(/\s+/g,'').toLowerCase() === name.replace(/\s+/g,'').toLowerCase() || c.shortName.replace(/\s+/g,'').toLowerCase() === name.replace(/\s+/g,'').toLowerCase())) return true;
        return false;
      });

      if (foundInCatalog) {
        assignComplexToSlot(state.targetSlotIndex, foundInCatalog);
        closeComplexPickerModal();
        showToast('아파트 등록 완료', `[${foundInCatalog.name}] 단지가 슬롯 ${state.targetSlotIndex + 1}에 배치되었습니다.`, 'success');
        document.getElementById('inputDirectName').value = '';
        document.getElementById('inputDirectComplexId').value = '';
        return;
      }

      if (isNaN(complexIdNum) || complexIdNum <= 0) {
        alert('올바른 네이버 단지번호(숫자)를 입력해주세요 (예: 4834 또는 네이버 링크).');
        return;
      }

      const district = (document.getElementById('inputDirectDistrict').value || '').trim() || '부산광역시 동래구';
      const metro = (document.getElementById('inputDirectMetro').value || '').trim() || '부산 역세권';
      const households = parseInt(document.getElementById('inputDirectHouseholds').value, 10) || 500;
      const buildYear = parseInt(document.getElementById('inputDirectBuildYear').value, 10) || 2020;
      const jBase = parseInt(document.getElementById('inputDirectJeonseBase').value, 10) || 45000;
      const sBase = parseInt(document.getElementById('inputDirectSaleBase').value, 10) || 85000;

      const finalName = name || `부산 아파트 (${complexIdNum})`;
      const newComplex = {
        id: `custom_${complexIdNum}`,
        complexId: complexIdNum,
        name: finalName,
        shortName: finalName.length > 8 ? finalName.slice(0, 7) + '..' : finalName,
        district: district,
        shortDistrict: district.replace('부산시 ', '').replace('부산광역시 ', ''),
        households: households,
        buildYear: buildYear,
        buildMonth: 1,
        ageYears: Math.max(1, new Date().getFullYear() - buildYear + 1),
        metro: metro,
        shortMetro: metro.split('/')[0].trim(),
        region: district.includes('동래') ? '부산 동래구' : (district.includes('연제') ? '부산 연제구' : (district.includes('해운대') ? '부산 해운대구' : '부산')),
        jeonseBase: jBase,
        saleBase: sBase,
        naverUrl: `https://new.land.naver.com/complexes/${complexIdNum}?a=APT&b=B1&e=RETAIL&order=prc`,
        naverMobileUrl: `https://fin.land.naver.com/complexes/${complexIdNum}?tradeTypes=B1`
      };

      assignComplexToSlot(state.targetSlotIndex, newComplex);
      closeComplexPickerModal();
      showToast('아파트 직접 등록 완료', `[${newComplex.name}] 단지가 슬롯 ${state.targetSlotIndex + 1}에 등록되었습니다.`, 'success');

      // 폼 비우기
      document.getElementById('inputDirectName').value = '';
      document.getElementById('inputDirectComplexId').value = '';
    });
  }

  // 11. 내 프로필 및 설정 관리 모달
  document.getElementById('btnProfileSettings').addEventListener('click', openProfileSettingsModal);
  document.getElementById('btnCloseProfileModal').addEventListener('click', closeProfileSettingsModal);
  document.getElementById('btnCloseProfileModalFooter').addEventListener('click', closeProfileSettingsModal);

  document.getElementById('btnSaveProfileName').addEventListener('click', () => {
    const val = (document.getElementById('inputProfileUserName').value || '').trim();
    if (val) {
      state.userName = val;
      localStorage.setItem(STORAGE_KEYS.USER_NAME, val);
      const label = document.getElementById('profileNameLabel');
      if (label) label.textContent = val.length > 6 ? val.slice(0, 5) + '..' : val;
      showToast('프로필 저장', `레이더 이름이 [${val}]으로 설정되었습니다.`, 'success');
    }
  });

  document.getElementById('btnExportSettings').addEventListener('click', exportSettingsToJson);
  document.getElementById('inputImportFile').addEventListener('change', importSettingsFromJson);
  document.getElementById('btnFactoryReset').addEventListener('click', resetToFactoryDefaults);

  // 12. 모바일 탭 바 클릭
  const mobileTabs = document.getElementById('mobileViewTabs');
  if (mobileTabs) {
    mobileTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-tab-btn');
      if (!btn) return;
      const tab = btn.dataset.tab;
      document.querySelectorAll('.mobile-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.soloComplexId = tab === 'all' ? null : tab;
      renderAllComplexes();
    });
  }

  // 13. 팝업 차단 안내 모달 닫기
  const btnCloseHelp = document.getElementById('btnCloseHelpModal');
  if (btnCloseHelp) btnCloseHelp.addEventListener('click', () => {
    document.getElementById('popupHelpModal').classList.remove('active');
  });
  const btnDismiss = document.getElementById('btnDismissModal');
  if (btnDismiss) btnDismiss.addEventListener('click', () => {
    document.getElementById('popupHelpModal').classList.remove('active');
  });
  const btnRetry = document.getElementById('btnRetryLaunch');
  if (btnRetry) btnRetry.addEventListener('click', () => {
    document.getElementById('popupHelpModal').classList.remove('active');
    launchSixWindows();
  });

  // 14. 실시간 레이더 펄스 타이머
  const timerElem = document.getElementById('nextCheckTimer');
  setInterval(() => {
    state.nextCheckSeconds--;
    if (state.nextCheckSeconds <= 0) {
      state.nextCheckSeconds = 25;
      const pulseDot = document.querySelector('.pulse-dot');
      if (pulseDot) {
        pulseDot.style.transform = 'scale(1.5)';
        setTimeout(() => pulseDot.style.transform = 'scale(1)', 400);
      }
    }
    if (timerElem) timerElem.textContent = `다음 감시: ${state.nextCheckSeconds}초`;
  }, 1000);

  // 초기 안내 토스트
  setTimeout(() => {
    showToast(
      '🏢 스마트 부동산 6분할 레이더 준비 완료',
      '기본 밝은 화면 모드로 실행되었습니다. 거래유형(전세/매매) 및 평형(20·30·40평대)을 선택하고 [🔍 조건 적용] 또는 [💾 기본값 저장]을 이용해보세요.'
    );
  }, 600);
});
