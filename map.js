document.addEventListener('DOMContentLoaded', () => {
  const map = L.map('map').setView([55.7558, 37.6176], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  let places = [];
  const markers = L.layerGroup().addTo(map);
  let currentPlaceIdForReview = null;

  window.openZoomModal = function(src) {
    const zoomModal = document.getElementById('zoom-modal');
    const zoomedPhoto = document.getElementById('zoomed-photo');
    if (zoomModal && zoomedPhoto) {
      zoomedPhoto.src = src;
      zoomModal.classList.add('active');
    }
  };

  window.closeZoomModal = function() {
    const zoomModal = document.getElementById('zoom-modal');
    if (zoomModal) zoomModal.classList.remove('active');
  };

  fetch('/api/me').then(r => r.json()).then(data => {
    if (data.logged_in) {
      updateHeaderForLoggedInUser(data.username, data.avatar);
    } else {
      const hash = window.location.hash;
      if (hash === '#login') setTimeout(() => openAuthModal('login'), 500);
      else if (hash === '#register') setTimeout(() => openAuthModal('register'), 500);
    }
  });

  fetch('/api/places')
    .then(res => res.json())
    .then(data => {
      places = data;
      renderMarkers(places);
      const urlParams = new URLSearchParams(window.location.search);
      const placeId = urlParams.get('id');
      if (placeId) {
        const place = places.find(p => p.id == placeId);
        if (place) setTimeout(() => showPlaceDetails(place), 600);
      }
    })
    .catch(err => console.error('Ошибка загрузки мест:', err));

  function renderMarkers(filteredPlaces) {
    markers.clearLayers();
    filteredPlaces.forEach(place => {
      if (isNaN(place.lat) || isNaN(place.lng)) return;
      const marker = L.marker([place.lat, place.lng]).addTo(markers);
      marker.on('click', () => showPlaceDetails(place));
    });
  }

  function showPlaceDetails(place) {
    currentPlaceIdForReview = place.id;
    document.getElementById('place-name').textContent = place.name;
    document.getElementById('place-rating').textContent = `⭐ ${place.rating}`;
    document.getElementById('place-address').textContent = place.address;
    document.getElementById('place-price').textContent = place.price;
    document.getElementById('place-district').textContent = place.district;
    document.getElementById('place-category').textContent =
      place.category === 'cafe' ? 'Кафе' : place.category === 'restaurant' ? 'Ресторан' : 'Бар';
    document.getElementById('place-description').textContent = place.description || 'Описание отсутствует';

    const webContainer = document.getElementById('place-website-container');
    if (place.website) {
      webContainer.style.display = 'block';
      document.getElementById('place-website').href = place.website;
      document.getElementById('place-website').textContent = place.website;
    } else {
      webContainer.style.display = 'none';
    }

    const breakfastTranslations = {
      'all_day': 'Весь день',
      'weekends_only': 'Только по выходным',
      'specific_time': 'В определённое время'
    };
    let bText = breakfastTranslations[place.breakfast_time] || place.breakfast_time;
    if (place.breakfast_time === 'specific_time' && place.breakfast_hours)
      bText += ` (${place.breakfast_hours})`;
    document.getElementById('place-breakfast-time').textContent = bText;

    initCarousel(place.photos || []);
    loadReviews(place.id);
    document.getElementById('place-details').classList.add('active');
  }

  function initCarousel(photos) {
    const carousel = document.getElementById('photo-carousel');
    if (!carousel) return;

    carousel.innerHTML = '';

    if (!photos || photos.length === 0) {
      carousel.innerHTML = '<div style="width:100%; height:100%; background: var(--card-bg, #eee); display:flex; align-items:center; justify-content:center; color:#999;">Нет фото</div>';
      return;
    }

    const photosContainer = document.createElement('div');
    photosContainer.style.cssText = 'position: relative; width: 100%; height: 100%;';


    photos.forEach((src, i) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `Photo ${i + 1}`;
      img.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: ${i === 0 ? '1' : '0'};
        transition: opacity 0.3s ease;
        cursor: zoom-in;
      `;
      img.className = i === 0 ? 'active' : '';
      img.onclick = () => window.openZoomModal(src);
      photosContainer.appendChild(img);
    });

    carousel.appendChild(photosContainer);


    if (photos.length > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.innerHTML = '‹';
      prevBtn.style.cssText = `
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(255,255,255,0.9);
        border: none;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        font-size: 24px;
        cursor: pointer;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      `;
      prevBtn.onmouseover = () => prevBtn.style.background = 'white';
      prevBtn.onmouseout = () => prevBtn.style.background = 'rgba(255,255,255,0.9)';


      const nextBtn = document.createElement('button');
      nextBtn.innerHTML = '›';
      nextBtn.style.cssText = `
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(255,255,255,0.9);
        border: none;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        font-size: 24px;
        cursor: pointer;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      `;
      nextBtn.onmouseover = () => nextBtn.style.background = 'white';
      nextBtn.onmouseout = () => nextBtn.style.background = 'rgba(255,255,255,0.9)';

      let currentIndex = 0;

      function showImage(index) {
        const imgs = photosContainer.querySelectorAll('img');
        imgs.forEach((img, i) => {
          img.style.opacity = i === index ? '1' : '0';
          img.classList.toggle('active', i === index);
        });
        currentIndex = index;
      }

      prevBtn.onclick = (e) => {
        e.stopPropagation();
        const newIndex = currentIndex === 0 ? photos.length - 1 : currentIndex - 1;
        showImage(newIndex);
      };

      nextBtn.onclick = (e) => {
        e.stopPropagation();
        const newIndex = currentIndex === photos.length - 1 ? 0 : currentIndex + 1;
        showImage(newIndex);
      };

      carousel.appendChild(prevBtn);
      carousel.appendChild(nextBtn);


      const indicators = document.createElement('div');
      indicators.style.cssText = `
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        z-index: 10;
      `;

      photos.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.style.cssText = `
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${i === 0 ? '#FF6B35' : 'rgba(255,255,255,0.6)'};
          cursor: pointer;
          transition: background 0.2s;
        `;
        dot.onclick = (e) => {
          e.stopPropagation();
          showImage(i);
          indicators.querySelectorAll('div').forEach((d, idx) => {
            d.style.background = idx === i ? '#FF6B35' : 'rgba(255,255,255,0.6)';
          });
        };
        indicators.appendChild(dot);
      });

      carousel.appendChild(indicators);
    }
  }

  function loadReviews(placeId) {
    const list = document.getElementById('reviews-list');
    if (!list) return;
    list.innerHTML = '<p style="color:#999;">Загрузка отзывов...</p>';

    fetch(`/api/reviews/${placeId}`)
      .then(res => res.ok ? res.json() : Promise.reject('Error'))
      .then(reviews => {
        if (!Array.isArray(reviews) || reviews.length === 0) {
          list.innerHTML = '<p>Пока нет отзывов. Будьте первым!</p>';
        } else {
          list.innerHTML = reviews.map(r => {
            const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Дата неизвестна';
            return `
              <div class="review-card" onclick='openReviewDetail(${JSON.stringify(r)})'>
                <div class="review-header">
                  <span class="review-author">${r.username}</span>
                  <span class="review-stars">⭐ ${r.rating_total}</span>
                </div>
                <div class="review-text">${r.text}</div>
                <small class="review-date">${dateStr}</small>
              </div>
            `;
          }).join('');
        }
        const btnContainer = document.getElementById('add-review-for-place-container');
        if (btnContainer) {
          fetch('/api/me').then(r => r.json()).then(authData => {
            if (authData.logged_in) btnContainer.style.display = 'block';
            else {
              btnContainer.style.display = 'none';
              list.innerHTML += `<p style="margin-top:1rem;"><a href="/map#login" style="color:#FF6B35;">Войдите</a>, чтобы оставить отзыв.</p>`;
            }
          });
        }
      })
      .catch(err => {
        console.error('❌ Ошибка загрузки отзывов:', err);
        list.innerHTML = '<p style="color:red;">Не удалось загрузить отзывы</p>';
      });
  }

  window.openReviewDetail = function(review) {
    const reviewIdInput = document.getElementById('current-review-id');
    if (reviewIdInput) reviewIdInput.value = review.id;
    const modal = document.getElementById('review-detail-modal');
    document.getElementById('detail-review-author').textContent = review.username || 'Аноним';
    document.getElementById('detail-review-date').textContent = review.created_at ? new Date(review.created_at).toLocaleString() : 'Дата неизвестна';
    document.getElementById('detail-review-text').textContent = review.text || 'Текст отсутствует';
    const avatarImg = document.getElementById('detail-review-avatar');
    if (avatarImg) {
      if (review.user_avatar) { avatarImg.src = review.user_avatar; avatarImg.style.display = 'block'; }
      else avatarImg.style.display = 'none';
    }
    const setStars = (elementId, rating) => {
      const el = document.getElementById(elementId);
      if (el) el.innerHTML = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    };
    setStars('detail-rating-total', review.rating_total || 0);
    setStars('detail-rating-staff', review.rating_staff || 0);
    setStars('detail-rating-food', review.rating_food || 0);
    setStars('detail-rating-interior', review.rating_interior || 0);
    const photosContainer = document.getElementById('detail-review-photos');
    if (photosContainer) {
      photosContainer.innerHTML = '';
      if (review.images && Array.isArray(review.images) && review.images.length > 0) {
        review.images.forEach(src => {
          const img = document.createElement('img');
          img.src = src;
          img.className = 'review-detail-photo';
          img.onclick = () => window.openZoomModal(src);
          photosContainer.appendChild(img);
        });
      } else {
        photosContainer.innerHTML = '<p style="color:#999; font-size:0.9rem;">Нет фотографий</p>';
      }
    }
    if (modal) modal.classList.add('active');
  };

  window.closeReviewDetailModal = function() {
    const modal = document.getElementById('review-detail-modal');
    if (modal) modal.classList.remove('active');
  };

  let reviewPhotosBase64Map = [];
  window.openReviewModalFromMap = function() {
    if (!currentPlaceIdForReview) { alert('Выберите место на карте'); return; }
    const modal = document.getElementById('review-modal-map');
    if (modal) { modal.classList.add('active'); resetReviewFormMap(); }
  };
  window.closeReviewModalMap = function() {
    const modal = document.getElementById('review-modal-map');
    if (modal) modal.classList.remove('active');
  };
  function resetReviewFormMap() {
    const textArea = document.getElementById('review-text-map');
    if (textArea) textArea.value = '';
    ['rating-staff', 'rating-food', 'rating-interior', 'rating-total'].forEach(id => {
      const el = document.getElementById(`${id}-map`);
      if (el) el.value = '0';
    });
    reviewPhotosBase64Map = [];
    updateReviewPhotosPreviewMap();
    document.querySelectorAll('#review-modal-map .star-rating .star').forEach(star => star.classList.remove('active'));
    const errorMsg = document.getElementById('review-error-msg-map');
    if (errorMsg) errorMsg.style.display = 'none';
  }
  window.previewReviewPhotosMap = function(input) {
    if (input.files) {
      Array.from(input.files).forEach(file => {
        if (reviewPhotosBase64Map.length >= 5) { alert('Максимум 5 фото на отзыв'); return; }
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.src = e.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const MAX_WIDTH = 300;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            reviewPhotosBase64Map.push(base64);
            updateReviewPhotosPreviewMap();
          };
        };
        reader.readAsDataURL(file);
      });
    }
    input.value = '';
  };
  function updateReviewPhotosPreviewMap() {
    const container = document.getElementById('review-photos-preview-map');
    if (!container) return;
    container.innerHTML = '';
    reviewPhotosBase64Map.forEach((base64, index) => {
      const div = document.createElement('div');
      div.className = 'review-photo-preview-container';
      div.innerHTML = `<img src="${base64}" class="review-photo-preview" alt="Photo ${index + 1}"><button class="review-photo-remove" onclick="removeReviewPhotoMap(${index})">×</button>`;
      container.appendChild(div);
    });
  }
  window.removeReviewPhotoMap = function(index) {
    reviewPhotosBase64Map.splice(index, 1);
    updateReviewPhotosPreviewMap();
  };
  document.querySelectorAll('#review-modal-map .star-rating').forEach(container => {
    const criterion = container.dataset.criterion;
    const stars = container.querySelectorAll('.star');
    const hiddenInput = document.getElementById(`rating-${criterion}-map`);
    if (!hiddenInput) return;
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.value);
        hiddenInput.value = value;
        stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= value));
      });
      star.addEventListener('mouseenter', () => {
        const hoverValue = parseInt(star.dataset.value);
        stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= hoverValue));
      });
    });
    container.addEventListener('mouseleave', () => {
      const currentValue = parseInt(hiddenInput.value);
      stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= currentValue));
    });
  });
  window.submitReviewFromMap = function() {
    const textEl = document.getElementById('review-text-map');
    const text = textEl ? textEl.value.trim() : '';
    const getVal = (id) => { const el = document.getElementById(id); return el ? parseInt(el.value) : 0; };
    const ratingStaff = getVal('rating-staff-map');
    const ratingFood = getVal('rating-food-map');
    const ratingInterior = getVal('rating-interior-map');
    const ratingTotal = getVal('rating-total-map');
    if (!text) { showReviewErrorMap('Напишите текст отзыва'); return; }
    if (!ratingStaff || !ratingFood || !ratingInterior || !ratingTotal) { showReviewErrorMap('Заполните все оценки'); return; }
    fetch('/api/reviews', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ place_id: currentPlaceIdForReview, text, rating_staff: ratingStaff, rating_food: ratingFood, rating_interior: ratingInterior, rating_total: ratingTotal, images: reviewPhotosBase64Map })
    })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') { alert('Отзыв успешно отправлен!'); closeReviewModalMap(); loadReviews(currentPlaceIdForReview); }
      else showReviewErrorMap(data.error || 'Ошибка отправки отзыва');
    })
    .catch(() => showReviewErrorMap('Ошибка сети'));
  };
  function showReviewErrorMap(msg) { const el = document.getElementById('review-error-msg-map'); if (el) { el.textContent = msg; el.style.display = 'block'; } }
  window.deleteCurrentReview = function() {
    const reviewIdInput = document.getElementById('current-review-id');
    const reviewId = reviewIdInput ? reviewIdInput.value : null;
    if (!reviewId) { alert('Ошибка: ID отзыва не определён'); return; }
    if (!confirm('Вы уверены, что хотите удалить этот отзыв?')) return;
    fetch(`/api/reviews/${reviewId}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') { alert('Отзыв успешно удалён!'); closeReviewDetailModal(); if (currentPlaceIdForReview) loadReviews(currentPlaceIdForReview); }
      else alert(data.error || 'Ошибка при удалении отзыва');
    })
    .catch(() => alert('Ошибка сети'));
  };
  let authMode = 'login';
  window.openAuthModal = (mode) => {
    authMode = mode;
    const title = document.getElementById('auth-title');
    const modal = document.getElementById('auth-modal');
    const error = document.getElementById('auth-error');
    if (title) title.textContent = mode === 'login' ? 'Вход' : 'Регистрация';
    if (modal) modal.style.display = 'flex';
    if (error) error.style.display = 'none';
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
  };
  window.closeAuthModal = () => { const modal = document.getElementById('auth-modal'); if (modal) modal.style.display = 'none'; };
  window.submitAuth = () => {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!username || !password) return alert('Заполните все поля');
    const url = authMode === 'login' ? '/api/login' : '/api/register';
    fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password}) })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') { closeAuthModal(); location.href = '/map'; }
      else { const errEl = document.getElementById('auth-error'); if (errEl) { errEl.textContent = data.error; errEl.style.display = 'block'; } }
    })
    .catch(() => alert('Ошибка сети'));
  };
  window.logout = () => { fetch('/api/logout', {method: 'POST'}).then(() => location.href = '/'); };
  function updateHeaderForLoggedInUser(username, avatar) {
    const authButtons = document.getElementById('auth-buttons-main');
    const userInfo = document.getElementById('user-info-main');
    const usernameDisplay = document.getElementById('username-display-main');
    const avatarDisplay = document.getElementById('user-avatar-display');
    if (authButtons && userInfo) {
      authButtons.style.display = 'none';
      userInfo.style.display = 'flex';
      if (usernameDisplay) usernameDisplay.textContent = username;
      if (avatar && avatarDisplay) { avatarDisplay.src = avatar; avatarDisplay.style.display = 'block'; }
    }
  }
  const closeDetails = document.getElementById('close-details');
  if (closeDetails) closeDetails.onclick = () => document.getElementById('place-details').classList.remove('active');
  const zoomModal = document.getElementById('zoom-modal');
  if (zoomModal) zoomModal.onclick = (e) => { if (e.target.id === 'zoom-modal' || e.target.id === 'zoomed-photo') window.closeZoomModal(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const details = document.getElementById('place-details');
      if (details) details.classList.remove('active');
      const zm = document.getElementById('zoom-modal');
      if (zm) zm.classList.remove('active');
      closeAuthModal();
      closeReviewModalMap();
      closeReviewDetailModal();
    }
  });
  function applyFilters() {
    const d = document.getElementById('district-filter').value;
    const c = document.getElementById('category-filter').value;
    const b = document.getElementById('breakfast-time-filter').value;
    const filtered = places.filter(p => (!d || p.district === d) && (!c || p.category === c) && (!b || p.breakfast_time === b));
    renderMarkers(filtered);
  }
  ['district-filter', 'category-filter', 'breakfast-time-filter'].forEach(id => document.getElementById(id).addEventListener('change', applyFilters));
});