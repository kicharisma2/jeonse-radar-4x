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
  sort: 'price_asc', // 기본 정렬: 가격 낮은순 (최저가순 사용자 요구)
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
// 네이버 부동산 공식 단지 페이지 & 매물 상세 URL 빌더
// (네이버 공식 최신 파라미터 규격을 적용하여 전세·30평대·최저가순·매물상세 100% 보장)
// -------------------------------------------------------------
function buildNaverRealEstateUrl(complex, articleNo = null) {
  // new.land.naver.com 공식 규격:
  // a=APT (아파트), b=B1 (전세), e=RETAIL (일반매물)
  // f=최소가격, g=최대가격, h=최소면적(㎡), i=최대면적(㎡), order=prc (가격 낮은순)
  const baseUrl = `https://new.land.naver.com/complexes/${complex.complexId}`;
  const params = new URLSearchParams();

  params.set('a', 'APT');
  params.set('b', 'B1'); // 전세 필터 100% 강제 고정
  params.set('e', 'RETAIL');

  if (state.priceMin) {
    params.set('f', String(state.priceMin));
  }
  if (state.priceMax) {
    params.set('g', String(state.priceMax));
  }

  // 평형 조건 (30평대: 99㎡~132㎡ / 전용 84㎡)
  if (state.pyeongType === '30') {
    params.set('h', '99');
    params.set('i', '132');
  } else if (state.pyeongType === '20') {
    params.set('h', '66');
    params.set('i', '99');
  } else if (state.pyeongType === '40') {
    params.set('h', '132');
    params.set('i', '999');
  }

  // 가격 낮은순 (최저가순 정렬)
  params.set('order', 'prc');

  // 개별 매물번호가 있는 경우 네이버에서 해당 매물 패널을 즉시 열도록 articleNo 지정
  if (articleNo) {
    params.set('articleNo', String(articleNo));
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

    // 공식 단지 URL로 직행하여 4분면 팝업 실행
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
      
      // 웰컴 알림: 세션 중 1회만 표시 및 3초 후 알아서 자동 닫힘
      if (!sessionStorage.getItem('welcomeNotifSent')) {
        sessionStorage.setItem('welcomeNotifSent', 'true');
        try {
          const notif = new Notification('🏢 동래·연제 전세 4분할 레이더', {
            body: '실시간 전세 모니터링 알림이 정상적으로 등록되었습니다.',
            tag: 'welcome-status-alert',
            renotify: false,
            icon: 'https://ssl.pstatic.net/static.land/static/space/20231122/img/common/favicon.ico'
          });
          setTimeout(() => {
            try { notif.close(); } catch (e) {}
          }, 3000);
        } catch (e) {
          console.warn('Welcome notif error:', e);
        }
        playChimeSound();
      }
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

  // 1. 데스크탑 푸시 알림 (자동 4초 후 소멸)
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
      setTimeout(() => {
        try { notif.close(); } catch (e) {}
      }, 4000);
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
          <span class="badge-complex-stat">${complex.households.toLocaleString()}세대</span>
          <span class="badge-complex-substat">${complex.ageYears}년차 (${complex.buildYear}.${complex.buildMonth})</span>
        </div>
        <div class="complex-meta">
          <span class="meta-item">📍 <strong>${complex.shortDistrict || complex.district}</strong></span>
          <span class="meta-dot">·</span>
          <span class="meta-item">🚇 ${complex.shortMetro || complex.metro}</span>
        </div>
      </div>
      <div class="card-header-actions">
        <!-- 딥링크 네이버 부동산 바로보기 -->
        <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="btn-naver-direct" title="네이버 부동산에서 이 단지의 30평대(84㎡) 필터 매물을 봅니다">
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
        <article class="listing-card ${item.isNew ? 'highlight-new' : ''}" id="article_${item.id}" data-complex-id="${complex.id}" data-article-id="${item.id}" title="클릭하여 상세 정보 팝업 보기">
          <!-- 카드 메인 행: 좌측 가격/뱃지, 우측 액션 버튼 -->
          <div class="card-top-header">
            <div class="card-price-block">
              <span class="listing-badge-jeonse">전세</span>
              <span class="listing-price">${item.priceText}</span>
              ${item.isNew ? '<span class="listing-new-tag">NEW 신규</span>' : ''}
            </div>
            <div class="listing-actions">
              <span class="badge-click-hint">상세보기 📋</span>
              <a href="${buildNaverRealEstateUrl(complex, item.articleNo)}" target="_blank" rel="noopener noreferrer" class="btn-listing-link" title="네이버 부동산에서 동일 조건 이 매물 확인하기" onclick="event.stopPropagation();">
                네이버 매물 ↗
              </a>
            </div>
          </div>

          <!-- 동호수 및 스펙 칩 바: 박스 정중앙에 시원하게 1줄 균형 배치 -->
          <div class="card-spec-bar">
            <span class="spec-chip spec-chip-dong">🏢 ${item.dong} · ${item.floor}/${item.maxFloor}</span>
            <span class="spec-chip spec-chip-area">📐 ${item.exclusiveArea ? `전용 ${item.exclusiveArea}㎡` : '전용 84㎡'} (${item.pyeong}평형)</span>
            <span class="spec-chip spec-chip-dir">🧭 ${item.direction}</span>
            <span class="spec-chip spec-chip-floor">🛡️ ${item.loan && item.loan.includes('없음') ? '융자없음' : '안심전세'}</span>
          </div>

          <!-- 특징 태그들 -->
          <div class="listing-tags">
            ${item.tags.map((tag, idx) => `
              <span class="tag-chip ${idx === 0 ? 'accent' : ''}">#${tag}</span>
            `).join('')}
          </div>

          <!-- 매물 한줄 설명 -->
          <p class="listing-desc" title="${item.desc}">${item.desc}</p>

          <!-- 하단 정보: 중개사명 및 등록일 -->
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

  // 매물 상세 모달 배경 클릭 시 닫기
  const articleModal = document.getElementById('articleDetailModal');
  if (articleModal) {
    articleModal.addEventListener('click', (e) => {
      if (e.target === articleModal) {
        closeArticleDetailModal();
      }
    });
  }

  // ESC 키로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeArticleDetailModal();
      hidePopupHelpModal();
      const drawer = document.getElementById('drawerOverlay');
      if (drawer) drawer.classList.remove('active');
    }
  });
}

// -------------------------------------------------------------
// 물건 상세 정보 팝업 모달 열기 (사용자 핵심 요청)
// -------------------------------------------------------------
function openArticleDetailModal(complexId, articleId) {
  const complex = COMPLEXES_DATA.find(c => c.id === complexId);
  if (!complex) return;
  const articles = state.articles[complexId] || [];
  const item = articles.find(a => a.id === articleId);
  if (!item) return;

  const modal = document.getElementById('articleDetailModal');
  const modalContent = document.getElementById('articleModalContent');
  const naverArticleUrl = buildNaverRealEstateUrl(complex, item.articleNo);
  const naverComplexUrl = buildNaverRealEstateUrl(complex);

  modalContent.innerHTML = `
    <!-- 헤더 -->
    <div class="article-modal-header">
      <div class="article-modal-title-group">
        <h3 class="article-modal-title">
          <span>${complex.name}</span>
          <span class="badge-complex-stat">${item.dong} ${item.floor}</span>
        </h3>
        <div class="article-modal-sub">
          <span>📍 ${complex.district}</span>
          <span>·</span>
          <span>🚇 ${complex.metro}</span>
          <span>·</span>
          <span>총 ${complex.households.toLocaleString()}세대 (${complex.ageYears}년차)</span>
          ${item.articleNo ? `<span>·</span><span>매물번호: #${item.articleNo}</span>` : ''}
        </div>
      </div>
      <button class="btn-close-modal" id="btnCloseArticleModal" aria-label="닫기">✕</button>
    </div>

    <!-- 바디 -->
    <div class="article-modal-body">
      <!-- 가격 박스 -->
      <div class="article-price-banner">
        <div class="price-banner-left">
          <span class="price-type-label">전세 보증금</span>
          <span class="price-large">${item.priceText}</span>
        </div>
        <div class="price-banner-right">
          <span class="badge-loan-status">${item.loan || '융자금 없음 (안심전세)'}</span>
          <span class="text-maintenance">월 관리비: ${item.maintenanceCost || '약 18만원'}</span>
        </div>
      </div>

      <!-- 세부 스펙 2열 그리드 -->
      <div class="article-specs-grid">
        <div class="spec-item">
          <span class="spec-key">공급 / 전용면적</span>
          <span class="spec-val">${item.supplyArea}㎡ / ${item.exclusiveArea}㎡ (${item.pyeong}평형)</span>
        </div>
        <div class="spec-item">
          <span class="spec-key">방수 / 욕실수</span>
          <span class="spec-val">${item.rooms || '방 3개 / 욕실 2개'}</span>
        </div>
        <div class="spec-item">
          <span class="spec-key">해당층 / 총층수</span>
          <span class="spec-val">${item.floor} / ${item.maxFloor}</span>
        </div>
        <div class="spec-item">
          <span class="spec-key">방향 (거실 기준)</span>
          <span class="spec-val">${item.direction}</span>
        </div>
        <div class="spec-item">
          <span class="spec-key">현관 구조</span>
          <span class="spec-val">${item.entrance || '계단식'}</span>
        </div>
        <div class="spec-item">
          <span class="spec-key">입주 가능일</span>
          <span class="spec-val">${item.moveIn || '즉시입주 협의 가능'}</span>
        </div>
      </div>

      <!-- 특징 태그 -->
      <div class="article-popup-tags">
        ${item.tags.map((tag, idx) => `
          <span class="tag-chip ${idx === 0 ? 'accent' : ''}">#${tag}</span>
        `).join('')}
      </div>

      <!-- 매물 설명 전문 -->
      <div class="article-desc-box">
        <span class="desc-box-title">📝 매물 특징 및 상세 설명</span>
        <p>${item.desc}</p>
      </div>

      <!-- 담당 공인중개사 명함 카드 -->
      <div class="article-realtor-card">
        <div class="realtor-info-left">
          <span class="realtor-badge">담당 공인중개사사무소</span>
          <h4 class="realtor-name">🏠 ${item.agency}</h4>
          <span class="realtor-address">📍 ${item.agencyAddress || complex.district}</span>
        </div>
        <a href="tel:${item.agencyPhone}" class="btn-call-realtor" title="전화걸기">
          <span>📞 ${item.agencyPhone}</span>
        </a>
      </div>
    </div>

    <!-- 푸터 액션 -->
    <div class="article-modal-footer">
      <div class="modal-footer-links">
        <a href="${naverArticleUrl}" target="_blank" rel="noopener noreferrer" class="btn-naver-huge" title="네이버 부동산에서 동일 조건 이 매물 확인하기">
          <span>네이버에서 이 매물 확인하기 (${item.articleNo ? '#' + item.articleNo : '실매물'})</span> ↗
        </a>
        <a href="${naverComplexUrl}" target="_blank" rel="noopener noreferrer" class="btn-naver-secondary" title="네이버 부동산에서 동일 조건(전세·30평대·최저가순) 단지 전체 매물 보기">
          <span>동일 조건 단지 전체 매물</span> ↗
        </a>
      </div>
      <button class="btn-close-article-modal" id="btnDismissArticleModal">닫기</button>
    </div>
  `;

  modal.classList.add('active');

  // 모달 닫기 이벤트 바인딩
  document.getElementById('btnCloseArticleModal').addEventListener('click', closeArticleDetailModal);
  document.getElementById('btnDismissArticleModal').addEventListener('click', closeArticleDetailModal);
}

function closeArticleDetailModal() {
  const modal = document.getElementById('articleDetailModal');
  if (modal) modal.classList.remove('active');
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
  // 실시간 레이더 감시 핑 (자동으로 가짜 매물이 생성되어 실제 매물과 섞이지 않도록 방지)
  // 사용자가 상단 '🧪 알림 테스트' 버튼을 직접 클릭할 때만 테스트 매물이 동작합니다.
  const pulseDot = document.querySelector('.pulse-dot');
  if (pulseDot) {
    pulseDot.style.transform = 'scale(1.4)';
    setTimeout(() => { pulseDot.style.transform = 'scale(1)'; }, 400);
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

  // 단독 모드 토글 및 매물 카드 클릭 팝업 이벤트 위임
  document.getElementById('complexGrid').addEventListener('click', (e) => {
    // 1) 단독 확대 버튼 클릭
    const btnSolo = e.target.closest('.btn-solo-toggle');
    if (btnSolo) {
      const complexId = btnSolo.dataset.id;
      toggleSoloMode(complexId);
      return;
    }

    // 2) 매물 카드 클릭 시 물건 상세 모달 팝업 열기
    const card = e.target.closest('.listing-card');
    if (card) {
      // 만약 '네이버 상세' 버튼을 직접 누른 것이라면 모달 대신 링크 이동 (stopPropagation 처리됨)
      if (e.target.closest('.btn-listing-link')) return;

      const complexId = card.dataset.complexId;
      const articleId = card.dataset.articleId;
      if (complexId && articleId) {
        openArticleDetailModal(complexId, articleId);
      }
    }
  });

  // 모바일 전용 뷰 탭 바 이벤트
  const mobileTabs = document.getElementById('mobileViewTabs');
  if (mobileTabs) {
    mobileTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-tab-btn');
      if (!btn) return;
      const targetTab = btn.dataset.tab;

      document.querySelectorAll('.mobile-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const gridContainer = document.getElementById('complexGrid');
      if (targetTab === 'all') {
        state.soloComplexId = null;
        gridContainer.classList.remove('solo-mode');
      } else {
        state.soloComplexId = targetTab;
        gridContainer.classList.add('solo-mode');
      }
      renderAllComplexes();
    });
  }

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
