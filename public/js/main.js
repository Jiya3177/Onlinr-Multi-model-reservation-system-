const searchForm = document.getElementById('searchForm');
const tabWrap = document.querySelector('[data-search-tabs]');

function applySearchMode(type) {
  const sourceLabel = document.getElementById('sourceLabel');
  const sourceInput = document.getElementById('sourceInput');
  const destinationLabel = document.getElementById('destinationLabel');
  const destinationInput = document.getElementById('destinationInput');
  const dateLabel = document.getElementById('dateLabel');
  const dateInput = document.getElementById('dateInput');
  const classTypeLabel = document.getElementById('classTypeLabel');
  const peopleLabel = document.getElementById('peopleLabel');
  const searchHint = document.getElementById('searchHint');

  if (!sourceLabel || !sourceInput || !destinationLabel || !destinationInput || !dateLabel || !dateInput) return;

  if (type === 'hotel') {
    sourceLabel.style.display = 'none';
    sourceInput.required = false;
    sourceInput.value = '';

    destinationLabel.firstChild.textContent = 'City';
    destinationInput.placeholder = 'Hotel city';
    destinationInput.required = true;

    dateLabel.firstChild.textContent = 'Check-in Date';
    dateInput.required = true;

    if (classTypeLabel) classTypeLabel.firstChild.textContent = 'Room Type';
    if (peopleLabel) peopleLabel.firstChild.textContent = 'Guests';
    if (searchHint) searchHint.textContent = 'Search stays by city with smart alternatives by rating and price.';
  } else {
    sourceLabel.style.display = '';
    sourceInput.required = true;

    destinationLabel.firstChild.textContent = 'To';
    destinationInput.placeholder = 'Destination city';
    destinationInput.required = true;

    dateLabel.firstChild.textContent = 'Date';
    dateInput.required = true;

    if (classTypeLabel) classTypeLabel.firstChild.textContent = 'Class / Room Type';
    if (peopleLabel) peopleLabel.firstChild.textContent = 'Passengers / Guests';
    if (searchHint) searchHint.textContent = 'Search direct routes first, then nearest-date alternatives automatically.';
  }
}

if (tabWrap) {
  const typeInput = document.getElementById('searchType');
  const tabs = tabWrap.querySelectorAll('.tab-btn');

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      if (typeInput) typeInput.value = btn.dataset.type;
      applySearchMode(btn.dataset.type);
    });
  });

  applySearchMode(typeInput ? typeInput.value : 'flight');
}

async function fetchCitySuggestions(value, listEl) {
  if (!value || value.length < 2) return;

  try {
    const res = await fetch(`/search/suggestions?q=${encodeURIComponent(value)}`);
    if (!res.ok) return;

    const cities = await res.json();
    listEl.innerHTML = '';

    cities.forEach((city) => {
      const option = document.createElement('option');
      option.value = city;
      listEl.appendChild(option);
    });
  } catch (err) {
    // suggestion errors should not block booking flow
  }
}

if (searchForm) {
  const sourceInput = searchForm.querySelector('input[name="source"]');
  const destinationInput = searchForm.querySelector('input[name="destination"]');
  const dateInput = searchForm.querySelector('input[name="date"]');
  const typeInput = searchForm.querySelector('input[name="type"]');
  const cityList = document.getElementById('cityList');
  const submitBtn = document.getElementById('searchSubmitBtn');

  [sourceInput, destinationInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', (event) => fetchCitySuggestions(event.target.value.trim(), cityList));
  });

  searchForm.addEventListener('submit', (event) => {
    const type = typeInput ? typeInput.value : 'flight';
    const source = sourceInput.value.trim();
    const destination = destinationInput.value.trim();

    if (type === 'hotel') {
      if (!destination) {
        event.preventDefault();
        alert('Please enter hotel city.');
        return;
      }

      if (!dateInput.value) {
        event.preventDefault();
        alert('Please select check-in date.');
        return;
      }
    } else {
      if (!source || !destination) {
        event.preventDefault();
        alert('Source and destination are required.');
        return;
      }

      if (source.toLowerCase() === destination.toLowerCase()) {
        event.preventDefault();
        alert('Source and destination cannot be the same.');
        return;
      }

      if (!dateInput.value) {
        event.preventDefault();
        alert('Please select a travel date.');
        return;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Searching options...';
    }
  });
}

const slider = document.querySelector('[data-hero-slider]');
if (slider) {
  const slides = Array.from(slider.querySelectorAll('.hero-slide'));
  let index = 0;

  setInterval(() => {
    slides[index].classList.remove('active');
    index = (index + 1) % slides.length;
    slides[index].classList.add('active');
  }, 2800);
}

const revealItems = document.querySelectorAll('.reveal');
if (revealItems.length) {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-show');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('reveal-show'));
  }
}

const seatShell = document.getElementById('seatLayoutShell');
if (seatShell) {
  const type = seatShell.dataset.type;
  const itemId = seatShell.dataset.itemId;
  const seatMapEl = document.getElementById('seatMap');
  const seatInfoEl = document.getElementById('seatSelectionInfo');
  const seatLabelsInput = document.getElementById('seatLabelsInput');
  const seatCountInput = document.getElementById('seatCountInput');
  const genderSelect = document.getElementById('passengerGender');
  const bookingForm = document.getElementById('bookingForm');

  let unitPayload = null;
  let selected = new Set();

  function getSelectedGender() {
    return genderSelect ? String(genderSelect.value || '').toUpperCase() : '';
  }

  function canPickUnit(unit) {
    if (unit.status === 'BOOKED') return false;
    if (unit.isLadyReserved && getSelectedGender() !== 'FEMALE') return false;
    return true;
  }

  function syncOutput() {
    const labels = Array.from(selected);
    const labelWord = type === 'hotel' ? 'Rooms' : 'Seats';

    if (seatLabelsInput) seatLabelsInput.value = labels.join(',');
    if (seatCountInput) seatCountInput.value = labels.length;

    if (!labels.length) {
      seatInfoEl.textContent = `Select ${labelWord.toLowerCase()} from the 2D map.`;
      return;
    }

    seatInfoEl.textContent = `Selected ${labelWord}: ${labels.join(', ')}`;
  }

  function renderUnits() {
    if (!unitPayload || !seatMapEl) return;

    seatMapEl.innerHTML = '';
    seatMapEl.style.setProperty('--seat-cols', unitPayload.layout.columns.length);

    const colIndexMap = new Map(unitPayload.layout.columns.map((col, idx) => [col, idx]));

    unitPayload.units.forEach((unit) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seat-cell';
      btn.textContent = unit.label;

      const col = (unit.label.match(/[A-Z]+/) || [''])[0];
      const cIdx = colIndexMap.has(col) ? colIndexMap.get(col) : 0;
      if (cIdx === unitPayload.layout.aisleAfter - 1) {
        btn.classList.add('seat-aisle-cut');
      }

      if (unit.status === 'BOOKED') {
        btn.classList.add('seat-state-booked');
      } else if (unit.isLadyReserved) {
        btn.classList.add('seat-state-lady');
      } else if (unit.isWindow) {
        btn.classList.add('seat-state-window');
      } else {
        btn.classList.add('seat-state-available');
      }

      if (selected.has(unit.label)) {
        btn.classList.add('seat-state-selected');
      }

      const selectable = canPickUnit(unit);
      if (!selectable) {
        btn.disabled = true;
        btn.classList.add('seat-disabled');
      }

      btn.title = unit.status === 'BOOKED'
        ? `${unit.label} (Reserved)`
        : unit.isLadyReserved && getSelectedGender() !== 'FEMALE'
          ? `${unit.label} (Ladies reserved)`
          : unit.isWindow
            ? `${unit.label} (Window)`
            : `${unit.label}`;

      btn.addEventListener('click', () => {
        if (!canPickUnit(unit)) return;

        if (selected.has(unit.label)) {
          selected.delete(unit.label);
        } else {
          selected.add(unit.label);
        }

        renderUnits();
        syncOutput();
      });

      seatMapEl.appendChild(btn);
    });
  }

  async function loadSeatMap() {
    try {
      seatInfoEl.textContent = 'Loading 2D seat/room map...';
      const response = await fetch(`/booking/seatmap/${type}/${itemId}`);
      if (!response.ok) {
        seatInfoEl.textContent = 'Seat/room map not available right now.';
        return;
      }

      unitPayload = await response.json();
      renderUnits();
      syncOutput();
    } catch (err) {
      seatInfoEl.textContent = 'Unable to load seat/room map right now.';
    }
  }

  if (genderSelect) {
    genderSelect.addEventListener('change', () => {
      const nextSelected = new Set();
      if (unitPayload) {
        unitPayload.units.forEach((unit) => {
          if (selected.has(unit.label) && canPickUnit(unit)) {
            nextSelected.add(unit.label);
          }
        });
      }
      selected = nextSelected;
      renderUnits();
      syncOutput();
    });
  }

  if (bookingForm) {
    bookingForm.addEventListener('submit', (event) => {
      if (selected.size === 0) {
        event.preventDefault();
        alert(type === 'hotel' ? 'Please select at least one room from map.' : 'Please select at least one seat from map.');
      }
    });
  }

  loadSeatMap();
}

const parallaxPanel = document.querySelector('[data-parallax-panel]');
if (parallaxPanel) {
  parallaxPanel.addEventListener('mousemove', (event) => {
    const rect = parallaxPanel.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    const rotateY = (x - 0.5) * 6;
    const rotateX = (0.5 - y) * 6;

    parallaxPanel.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  parallaxPanel.addEventListener('mouseleave', () => {
    parallaxPanel.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
  });
}

const interactiveCards = document.querySelectorAll('.card-glass, .result-card-v2, .offer-card, .metric-tile, .feature-tile');
interactiveCards.forEach((card) => {
  card.addEventListener('mousemove', (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(1100px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-5px)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

const pulseButtons = document.querySelectorAll('.btn, .btn-sm, .btn-xs');
pulseButtons.forEach((btn) => {
  btn.addEventListener('mouseenter', () => {
    btn.style.transition = 'transform 0.18s ease, box-shadow 0.2s ease';
    btn.style.transform = 'translateY(-2px) scale(1.02)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
  });
});

const glow = document.createElement('div');
glow.className = 'cursor-glow';
document.body.appendChild(glow);

let rafPending = false;
window.addEventListener('pointermove', (event) => {
  if (rafPending) return;
  rafPending = true;
  window.requestAnimationFrame(() => {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
    rafPending = false;
  });
});
