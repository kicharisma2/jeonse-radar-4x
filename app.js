/**
 * 동래·연제 전세 4분할 레이더 (JeonseRadar 4X) - Main Application Logic
 */

// 애플리케이션 상태 (사용자 요구조건 기본값 반영)
const state = {
  tradeType: 'jeonse',
  priceMin: 43000, // 4억 3,000만원
  priceMax: 55000, // 5억 5,000만원
  pyeongType: '30', // 30평대 (30~39평)
  minHouseholds: 500,
  buildAge: 'within20', // 20년 이내 (신축/준신축)
  sort: 'newest',
  notificationsEnabled: false,
  soloComplexId: null,
  nextCheckSeconds: 25,
  articles: {}, // complexId => articles array
  notifications: [],
  theme: 'dark'
};

// 4개 단지별 활성 윈도우 핸들러 참조 (재사용 및 윈도우 제어용)
const windowHandles = {};

// Web Audio API를 이용한 네이티브 차임음 생성기 (외부 오디오 파일 없이 순수 웹 신디사이저)
function playChimeSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    
    // 1차 톤 (맑은 벨 소리)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.8);

    // 2차 톤 (화음 하모니)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.28); // D6
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 1.2);
  } catch (err) {
    console.warn('Audio chime play error:', err);
  }
}

// -------------------------------------------------------------
// 네이버 부동산 딥링크 URL 빌더
// -------------------------------------------------------------
function buildNaverRealEstateUrl(complex) {
  // 사용자가 설정한 필터 조건이 반영된 네이버 부동산 URL
  const baseUrl = 'https://fin.land.naver.com/map';
  const params = new URLSearchParams();

  // 거래유형: 전세 (B1)
  params.set('tradeTypes', 'B1');
  // 매물종류: 아파트 (A01)
  params.set('realEstateTypes', 'A01');
  // 가격 범위 (만원 단위)
  params.set('priceMin', String(state.priceMin));
  params.set('priceMax', String(state.priceMax));

  // 평형 조건
  if (state.pyeongType === '30') {
    params.set('areaMin', '99');
    params.set('areaMax', '132');
  } else if (state.pyeongType === '20') {
    params.set('areaMin', '66');
    params.set('areaMax', '99');
  } else if (state.pyeongType === '40') {
    params.set('areaMin', '132');
    params.set('areaMax', '999');
  }

  // 단지 고유 네이버 지도 레이어
  if (complex.naverLayer) {
    params.set('layer', complex.naverLayer);
  }

  return `${baseUrl}?${params.toString()}`;
}

// -------------------------------------------------------------
// 핵심 기능 1: 1클릭 화면 4분할 네이버 창 동시 실행 (사용자 요구)
// -------------------------------------------------------------
function launchFourWindows() {
  const availW = window.screen.availWidth || window.innerWidth;
  const availH = window.screen.availHeight || window.innerHeight;
  const availLeft = window.screen.availLeft || 0;
  const availTop = window.screen.availTop || 0;

  const halfW = Math.floor(availW / 2);
  const halfH = Math.floor(availH / 2);

  // 4개 단지 분할 좌표 (좌상, 우상, 좌하, 우하)
  const windowLayouts = [
    { index: 0, x: availLeft, y: availTop, w: halfW, h: halfH, title: '동래래미안아이파크' },
    { index: 1, x: availLeft + halfW, y: availTop, w: halfW, h: halfH, title: '레이카운티' },
    { index: 2, x: availLeft, y: availTop + halfH, w: halfW, h: halfH, title: '동래래미안포레스티지' },
    { index: 3, x: availLeft + halfW, y: availTop + halfH, w: halfW, h: halfH, title: '효성해링턴' }
  ];

  let blockedCount = 0;

  windowLayouts.forEach(layout => {
    const complex = COMPLEXES_DATA[layout.index];
    if (!complex) return;

    const url = buildNaverRealEstateUrl(complex);
    const winName = `NaverWindow_${complex.id}`;
    const windowFeatures = `left=${layout.x},top=${layout.y},width=${layout.w},height=${layout.h},menubar=no,toolbar=no,location=yes,status=yes,resizable=yes,scrollbars=yes`;

    try {
      const newWin = window.open(url, winName, windowFeatures);
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        blockedCount++;
      } else {
        windowHandles[complex.id] = newWin;
      }
    } catch (e) {
      blockedCount++;
    }
  });

  if (blockedCount > 0) {
    showPopupHelpModal();
    showToast('⚠️ 팝업 차단 감지', '브라우저 주소창 우측에서 팝업을 허용해주세요.', 'warning');
  } else {
    showToast('🚀 네이버 4창 분할 실행 완료', '화면 4분면에 4대 단지 네이버 부동산 창이 정렬되었습니다!', 'success');
  }
}

// -------------------------------------------------------------
// 핵심 기능 2: 신규 매물 실시간 알림 시스템
// -------------------------------------------------------------
async function toggleNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('알림 미지원', '현재 브라우저가 데스크탑 알림을 지원하지 않습니다.', 'warning');
    return;
  }

  if (Notification.permission === 'granted') {
    state.notificationsEnabled = !state.notificationsEnabled;
    updateNotifyButtonUI();
    showToast(
      state.notificationsEnabled ? '🔔 알림 활성화' : '🔕 알림 비활성화',
      state.notificationsEnabled ? '신규 매물이 감지되면 즉시 알려드립니다.' : '알림 수신이 일시 중지되었습니다.'
    );
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      state.notificationsEnabled = true;
      updateNotifyButtonUI();
      showToast('🎉 알림 허용 완료', '새로운 전세 매물이 등록되면 데스크탑 알림을 보내드립니다!', 'success');
      // 웰컴 테스트 알림
      new Notification('🏢 동래·연제 전세 4분할 레이더', {
        body: '실시간 전세 모니터링 알림이 정상적으로 등록되었습니다.',
        icon: 'https://ssl.pstatic.net/static.land/static/space/20231122/img/common/favicon.ico'
      });
      playChimeSound();
    } else {
      showToast('알림 권한 거부됨', '브라우저 설정에서 알림 권한을 허용해주세요.', 'warning');
    }
  } else {
    showToast('알림 권한 필요', '브라우저 사이트 설정에서 알림 권한을 허용해주세요.', 'warning');
  }
}

function updateNotifyButtonUI() {
  const btn = document.getElementById('btnNotifyToggle');
  const icon = document.getElementById('notifyIcon');
  const label = document.getElementById('notifyLabel');

  if (state.notificationsEnabled) {
    btn.classList.add('active');
    icon.textContent = '🔔';
    label.textContent = '알림 켜짐';
  } else {
    btn.classList.remove('active');
    icon.textContent = '🔕';
    label.textContent = '알림 켜기';
  }
}

// 신규 매물 감지 시 실행되는 알림 디스패처
function triggerNewListingAlert(complex, article) {
  playChimeSound();

  const title = `🔔 [${complex.name}] 신규 전세 매물!`;
  const body = `${article.dong} ${article.floor} | 전세 ${article.priceText} (${article.pyeong}평형)`;

  // 1. 데스크탑 푸시 알림
  if (state.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body: `${body}\n${article.tags.join(' ')}`,
        tag: article.id,
        icon: 'https://ssl.pstatic.net/static.land/static/space/20231122/img/common/favicon.ico'
      });
      notif.onclick = () => {
        window.focus();
        highlightArticle(complex.id, article.id);
      };
    } catch (e) {
      console.warn('Push error:', e);
    }
  }

  // 2. 인앱 토스트 팝업
  showToast(title, `${body} - ${article.agency}`, 'listing', () => {
    highlightArticle(complex.id, article.id);
  });

  // 3. 알림 센터 내역 누적
  const notifRecord = {
    id: 'notif-' + Date.now(),
    complexId: complex.id,
    complexName: complex.name,
    articleId: article.id,
    title: title,
    body: body,
    tags: article.tags,
    agency: article.agency,
    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    isUnread: true
  };

  state.notifications.unshift(notifRecord);
  renderNotificationFeed();
  updateUnreadCount();
}

// -------------------------------------------------------------
// 신규 매물 시뮬레이션 테스트
// -------------------------------------------------------------
let simPoolIndex = 0;
function simulateNewListing() {
  if (NEW_LISTING_POOL.length === 0) return;
  const poolItem = NEW_LISTING_POOL[simPoolIndex % NEW_LISTING_POOL.length];
  simPoolIndex++;

  const complex = COMPLEXES_DATA.find(c => c.id === poolItem.complexId);
  if (!complex) return;

  const newArticle = { ...poolItem.item, id: `${poolItem.item.id}-${Date.now()}` };

  // 단지 매물 목록 맨 앞에 추가
  state.articles[complex.id].unshift(newArticle);

  // 렌더링 갱신
  renderComplexCard(complex);
  updateTotalMatches();

  // 알림 발송
  triggerNewListingAlert(complex, newArticle);
}

// -------------------------------------------------------------
// 매물 필터링 및 정렬 로직
// -------------------------------------------------------------
function filterArticles(articles, complex) {
  return articles.filter(item => {
    // 1. 가격 범위
    if (item.price < state.priceMin || item.price > state.priceMax) return false;

    // 2. 평형
    if (state.pyeongType === '30' && (item.pyeong < 30 || item.pyeong >= 40)) return false;
    if (state.pyeongType === '20' && (item.pyeong < 20 || item.pyeong >= 30)) return false;
    if (state.pyeongType === '40' && item.pyeong < 40) return false;

    // 3. 단지 조건: 500세대 이상
    if (complex.households < state.minHouseholds) return false;

    // 4. 사용승인일
    if (state.buildAge === 'within20' && complex.ageYears > 20) return false;
    if (state.buildAge === 'over20' && complex.ageYears <= 20) return false;

    return true;
  }).sort((a, b) => {
    if (state.sort === 'price_asc') return a.price - b.price;
    if (state.sort === 'price_desc') return b.price - a.price;
    if (state.sort === 'area_desc') return b.exclusiveArea - a.exclusiveArea;
    // newest 기본
    return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
  });
}

// -------------------------------------------------------------
// DOM 렌더링: 4개 단지 카드 렌더링
// -------------------------------------------------------------
function renderAllComplexes() {
  COMPLEXES_DATA.forEach(complex => {
    renderComplexCard(complex);
  });
  updateTotalMatches();
}

function renderComplexCard(complex) {
  const cardElem = document.getElementById(getCardElementId(complex.id));
  if (!cardElem) return;

  const rawArticles = state.articles[complex.id] || [];
  const filtered = filterArticles(rawArticles, complex);
  const naverUrl = buildNaverRealEstateUrl(complex);

  const minPrice = filtered.length ? Math.min(...filtered.map(a => a.price)) : 0;
  const maxPrice = filtered.length ? Math.max(...filtered.map(a => a.price)) : 0;
  const priceRangeSummary = filtered.length 
    ? `${(minPrice/10000).toFixed(1)}억 ~ ${(maxPrice/10000).toFixed(1)}억`
    : '매물 없음';

  const isSolo = state.soloComplexId === complex.id;

  cardElem.innerHTML = `
    <!-- 카드 헤더 -->
    <div class="card-header">
      <div class="complex-info">
        <div class="complex-title-row">
          <h2 class="complex-name">${complex.name}</h2>
          <span class="badge-complex-stat">${complex.households.toLocaleString()}세대 · ${complex.ageYears}년차</span>
        </div>
        <div class="complex-meta">
          <span class="meta-item">📍 <strong>${complex.district}</strong></span>
          <span class="meta-item">🚇 ${complex.metro}</span>
        </div>
      </div>
      <div class="card-header-actions">
        <!-- 딥링크 네이버 부동산 바로보기 -->
        <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="btn-naver-direct" title="네이버 부동산에서 이 단지의 필터 매물을 봅니다">
          <span>네이버 바로보기</span> ↗
        </a>
        <!-- 단독 확대 토글 -->
        <button class="btn-card-icon btn-solo-toggle" data-id="${complex.id}" title="${isSolo ? '4분할 뷰로 복귀' : '이 단지만 단독 크게보기'}">
          ${isSolo ? '🗗' : '🔲'}
        </button>
      </div>
    </div>

    <!-- 요약 리본 -->
    <div class="card-summary-ribbon">
      <div class="summary-left">
        <span>조건 일치 매물: <strong class="match-count-badge">${filtered.length}개</strong></span>
        <span class="price-range-info">| 전세 호가: ${priceRangeSummary}</span>
      </div>
      <div class="summary-right">
        <span>준공: ${complex.buildYear}.${complex.buildMonth}</span>
      </div>
    </div>

    <!-- 카드 본문: 매물 리스트 -->
    <div class="card-body" id="list_${complex.id}">
      ${filtered.length === 0 ? `
        <div class="empty-listings">
          <span class="empty-listings-icon">🔍</span>
          <p>현재 설정한 필터 조건에 맞는 전세 매물이 없습니다.</p>
          <small>보증금 범위나 평형 필터를 조금 넓혀보세요.</small>
        </div>
      ` : filtered.map(item => `
        <article class="listing-card ${item.isNew ? 'highlight-new' : ''}" id="article_${item.id}">
          <div class="listing-top-row">
            <div class="listing-price-area">
              <span class="listing-badge-jeonse">전세</span>
              <span class="listing-price">${item.priceText}</span>
              ${item.isNew ? '<span class="listing-new-tag">NEW 신규</span>' : ''}
            </div>
            <div class="listing-actions">
              <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="btn-listing-link" title="네이버 부동산 원본 매물 페이지 열기">
                네이버 상세 ↗
              </a>
            </div>
          </div>

          <div class="listing-spec-row">
            <span class="listing-dong">${item.dong}</span>
            <span class="listing-floor">${item.floor}/${item.maxFloor}</span>
            <span class="listing-area">${item.pyeong}평형 (${item.type})</span>
            <span class="listing-direction">${item.direction}</span>
          </div>

          <div class="listing-tags">
            ${item.tags.map((tag, idx) => `
              <span class="tag-chip ${idx === 0 ? 'accent' : ''}">#${tag}</span>
            `).join('')}
          </div>

          <p class="listing-desc" title="${item.desc}">${item.desc}</p>

          <div class="listing-bottom-row">
            <div class="agency-info">
              <span class="agency-name">🏠 ${item.agency}</span>
              <span class="agency-phone">☎ ${item.agencyPhone}</span>
            </div>
            <span class="listing-date">${item.regDate}</span>
          </div>
        </article>
      `).join('')}
    </div>
  `;

  // 단독 모드 클래스 반영
  if (isSolo) {
    cardElem.classList.add('is-solo');
  } else {
    cardElem.classList.remove('is-solo');
  }
}

function getCardElementId(complexId) {
  switch (complexId) {
    case 'dongnae_raemian': return 'cardDongnaeRaemian';
    case 'ray_county': return 'cardRayCounty';
    case 'raemian_forestige': return 'cardRaemianForestige';
    case 'hyosung_harrington': return 'cardHyosungHarrington';
    default: return '';
  }
}

function updateTotalMatches() {
  let count = 0;
  COMPLEXES_DATA.forEach(c => {
    const raw = state.articles[c.id] || [];
    count += filterArticles(raw, c).length;
  });
  const elem = document.getElementById('totalMatchesCount');
  if (elem) elem.textContent = String(count);
}

function highlightArticle(complexId, articleId) {
  // 만약 다른 단지가 solo 모드라면 해제
  if (state.soloComplexId && state.soloComplexId !== complexId) {
    toggleSoloMode(complexId);
  }

  const el = document.getElementById(`article_${articleId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-new');
    setTimeout(() => {
      el.classList.remove('highlight-new');
    }, 4000);
  }
}

function toggleSoloMode(complexId) {
  const container = document.getElementById('complexGrid');
  if (state.soloComplexId === complexId) {
    state.soloComplexId = null;
    container.classList.remove('solo-mode');
  } else {
    state.soloComplexId = complexId;
    container.classList.add('solo-mode');
  }
  renderAllComplexes();
}

// -------------------------------------------------------------
// 슬라이더 및 필터 인터랙션 이벤트 핸들러
// -------------------------------------------------------------
function setupFilterListeners() {
  const minSlider = document.getElementById('priceMinRange');
  const maxSlider = document.getElementById('priceMaxRange');
  const priceDisplay = document.getElementById('priceRangeDisplay');
  const priceTrack = document.getElementById('priceTrack');

  function updateSliderUI() {
    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    if (minVal > maxVal) {
      const temp = minVal;
      minVal = maxVal;
      maxVal = temp;
    }

    state.priceMin = minVal;
    state.priceMax = maxVal;

    // 텍스트 포맷: 4억 3,000만 ~ 5억 5,000만원
    priceDisplay.textContent = `${formatPrice(minVal)} ~ ${formatPrice(maxVal)}원`;

    // 슬라이더 트랙 채우기 (퍼센트 계산: 30000 ~ 70000)
    const minPercent = ((minVal - 30000) / 40000) * 100;
    const maxPercent = ((maxVal - 30000) / 40000) * 100;
    priceTrack.style.background = `linear-gradient(to right, var(--bg-tertiary) ${minPercent}%, var(--naver-green) ${minPercent}%, var(--naver-green) ${maxPercent}%, var(--bg-tertiary) ${maxPercent}%)`;

    renderAllComplexes();
  }

  minSlider.addEventListener('input', updateSliderUI);
  maxSlider.addEventListener('input', updateSliderUI);

  // 가격 퀵 프리셋 태그
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const min = parseInt(btn.dataset.min);
      const max = parseInt(btn.dataset.max);

      minSlider.value = min;
      maxSlider.value = max;
      updateSliderUI();
    });
  });

  // 평형 선택 버튼
  document.querySelectorAll('[data-type="pyeong"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-type="pyeong"]').forEach(b => {
        b.classList.remove('active');
        const check = b.querySelector('.pill-check');
        if (check) check.remove();
      });

      btn.classList.add('active');
      const checkSpan = document.createElement('span');
      checkSpan.className = 'pill-check';
      checkSpan.textContent = '✓ ';
      btn.prepend(checkSpan);

      state.pyeongType = btn.dataset.value;
      renderAllComplexes();
    });
  });

  // 사용승인일 선택 드롭다운
  const buildAgeSelect = document.getElementById('selectBuildAge');
  buildAgeSelect.addEventListener('change', () => {
    state.buildAge = buildAgeSelect.value;
    renderAllComplexes();
  });

  // 정렬 순서
  const sortSelect = document.getElementById('selectSort');
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    renderAllComplexes();
  });

  // 필터 초기화 버튼
  document.getElementById('btnResetFilters').addEventListener('click', () => {
    minSlider.value = 43000;
    maxSlider.value = 55000;
    state.pyeongType = '30';
    state.buildAge = 'within20';
    state.sort = 'newest';
    buildAgeSelect.value = 'within20';
    sortSelect.value = 'newest';

    // UI 동기화
    document.querySelectorAll('[data-type="pyeong"]').forEach(b => {
      b.classList.remove('active');
      const check = b.querySelector('.pill-check');
      if (check) check.remove();
      if (b.dataset.value === '30') {
        b.classList.add('active');
        const c = document.createElement('span');
        c.className = 'pill-check';
        c.textContent = '✓ ';
        b.prepend(c);
      }
    });

    document.querySelectorAll('.tag-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.min === '43000' && b.dataset.max === '55000');
    });

    updateSliderUI();
    showToast('필터 초기화', '사용자 지정 기본 필터(4.3억~5.5억, 30평대)로 복원되었습니다.');
  });
}

function formatPrice(val) {
  const eok = Math.floor(val / 10000);
  const man = val % 10000;
  if (man === 0) return `${eok}억`;
  return `${eok}억 ${man.toLocaleString()}만`;
}

// -------------------------------------------------------------
// 알림 센터 드로어
// -------------------------------------------------------------
function setupNotificationDrawer() {
  const drawerOverlay = document.getElementById('drawerOverlay');
  const btnOpen = document.getElementById('btnOpenNotificationCenter');
  const btnClose = document.getElementById('btnCloseDrawer');
  const btnClear = document.getElementById('btnClearNotifs');
  const btnTestInDrawer = document.getElementById('btnTestNotifInDrawer');

  btnOpen.addEventListener('click', () => {
    drawerOverlay.classList.add('active');
    // 알림 읽음 처리
    state.notifications.forEach(n => n.isUnread = false);
    updateUnreadCount();
  });

  btnClose.addEventListener('click', () => {
    drawerOverlay.classList.remove('active');
  });

  drawerOverlay.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) {
      drawerOverlay.classList.remove('active');
    }
  });

  btnClear.addEventListener('click', () => {
    state.notifications = [];
    renderNotificationFeed();
    updateUnreadCount();
    showToast('알림 내역 삭제', '알림 피드가 비워졌습니다.');
  });

  btnTestInDrawer.addEventListener('click', () => {
    simulateNewListing();
  });
}

function renderNotificationFeed() {
  const container = document.getElementById('notifListContainer');
  if (!container) return;

  if (state.notifications.length === 0) {
    container.innerHTML = `
      <div class="empty-notif">
        <span class="empty-icon">📭</span>
        <p>수신된 신규 매물 알림이 없습니다.</p>
        <p class="empty-sub">새로운 전세 매물이 감지되면 이곳에 실시간으로 기록됩니다.</p>
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
        <button class="btn-drawer-small primary" onclick="highlightArticle('${item.complexId}', '${item.articleId}'); document.getElementById('drawerOverlay').classList.remove('active');">
          매물 바로보기 →
        </button>
      </div>
    </div>
  `).join('');
}

function updateUnreadCount() {
  const badge = document.getElementById('unreadNotifCount');
  const unreadCount = state.notifications.filter(n => n.isUnread).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// -------------------------------------------------------------
// 토스트 메시지 렌더러
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
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" aria-label="닫기">✕</button>
  `;

  if (onClickCallback) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', (e) => {
      if (!e.target.classList.contains('toast-close')) {
        onClickCallback();
      }
    });
  }

  toast.querySelector('.toast-close').addEventListener('click', (e) => {
    e.stopPropagation();
    removeToast(toast);
  });

  container.appendChild(toast);

  setTimeout(() => {
    removeToast(toast);
  }, 4500);
}

function removeToast(toast) {
  toast.classList.add('toast-out');
  toast.addEventListener('animationend', () => {
    toast.remove();
  });
}

// -------------------------------------------------------------
// 팝업 차단 안내 모달
// -------------------------------------------------------------
function showPopupHelpModal() {
  const modal = document.getElementById('popupHelpModal');
  if (modal) modal.classList.add('active');
}

function hidePopupHelpModal() {
  const modal = document.getElementById('popupHelpModal');
  if (modal) modal.classList.remove('active');
}

function setupModalListeners() {
  document.getElementById('btnCloseHelpModal').addEventListener('click', hidePopupHelpModal);
  document.getElementById('btnDismissModal').addEventListener('click', hidePopupHelpModal);
  document.getElementById('btnRetryLaunch').addEventListener('click', () => {
    hidePopupHelpModal();
    launchFourWindows();
  });
}

// -------------------------------------------------------------
// 주기적 실시간 모니터링 타이머 (Auto Polling Timer)
// -------------------------------------------------------------
function startMonitoringCycle() {
  const timerElem = document.getElementById('nextCheckTimer');
  setInterval(() => {
    state.nextCheckSeconds--;
    if (state.nextCheckSeconds <= 0) {
      state.nextCheckSeconds = 30;
      // 30초마다 가상의 감시 사이클 실행
      runMonitoringCheck();
    }
    if (timerElem) {
      timerElem.textContent = `다음 감시: ${state.nextCheckSeconds}초`;
    }
  }, 1000);
}

function runMonitoringCheck() {
  // 실제 사이클에서 4개 단지 매물 변동 체크
  // 낮은 확률(약 20%)로 새 매물 감지 트리거
  if (Math.random() < 0.25) {
    simulateNewListing();
  }
}

// -------------------------------------------------------------
// 테마 토글 (Dark / Light)
// -------------------------------------------------------------
function setupThemeToggle() {
  const btn = document.getElementById('btnThemeToggle');
  const icon = document.getElementById('themeIcon');

  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);

  btn.addEventListener('click', () => {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  });

  function applyTheme(theme) {
    state.theme = theme;
    if (theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      icon.textContent = '🌙';
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      icon.textContent = '☀️';
    }
  }
}

// -------------------------------------------------------------
// 초기화 (Initialization)
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // 1. 단지 데이터 초기화
  COMPLEXES_DATA.forEach(c => {
    state.articles[c.id] = [...c.initialArticles];
  });

  // 2. 카드 렌더링
  renderAllComplexes();

  // 3. 필터 및 슬라이더 이벤트 연결
  setupFilterListeners();

  // 4. 알림 센터 및 모달 이벤트
  setupNotificationDrawer();
  setupModalListeners();

  // 5. 버튼 이벤트
  document.getElementById('btnLaunchFourWindows').addEventListener('click', launchFourWindows);
  document.getElementById('btnBannerLaunch').addEventListener('click', launchFourWindows);
  document.getElementById('btnFooterOpenAll').addEventListener('click', launchFourWindows);
  document.getElementById('btnNotifyToggle').addEventListener('click', toggleNotificationPermission);
  document.getElementById('btnSimulateNewListing').addEventListener('click', simulateNewListing);

  // 단독 모드 토글 이벤트 위임
  document.getElementById('complexGrid').addEventListener('click', (e) => {
    const btnSolo = e.target.closest('.btn-solo-toggle');
    if (btnSolo) {
      const complexId = btnSolo.dataset.id;
      toggleSoloMode(complexId);
    }
  });

  // 6. 테마 토글
  setupThemeToggle();

  // 7. 실시간 감시 타이머 시작
  startMonitoringCycle();

  // 안내 토스트
  setTimeout(() => {
    showToast(
      '🏢 동래·연제 전세 4분할 레이더 준비 완료',
      '상단의 [네이버 4창 분할 실행] 버튼을 누르면 화면 4분할로 네이버 부동산이 열립니다.'
    );
  }, 800);
});
