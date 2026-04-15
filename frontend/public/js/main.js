const searchForm = document.getElementById('searchForm');
const tabWrap = document.querySelector('[data-search-tabs]');
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

function setButtonBusy(button, nextLabel, isBusy) {
  if (!button) return;
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent.trim();
  }

  button.disabled = Boolean(isBusy);
  button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  button.textContent = isBusy ? nextLabel : button.dataset.defaultLabel;
}

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

  sourceLabel.style.display = '';
  sourceInput.required = true;

  destinationLabel.firstChild.textContent = 'To';
  destinationInput.placeholder = 'Destination city';
  destinationInput.required = true;

  dateLabel.firstChild.textContent = 'Date';
  dateInput.required = true;

  if (classTypeLabel) classTypeLabel.firstChild.textContent = 'Class / Room Type';
  if (peopleLabel) peopleLabel.firstChild.textContent = 'Passengers / Guests';
  if (searchHint) searchHint.textContent = 'Search direct routes first, then nearest-date transport alternatives automatically.';
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
    const cities = await requestJson(`/search/suggestions?q=${encodeURIComponent(value)}`);
    if (!Array.isArray(cities)) return;
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
    const source = sourceInput.value.trim();
    const destination = destinationInput.value.trim();

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

    if (submitBtn) {
      setButtonBusy(submitBtn, 'Searching options...', true);
    }
  });
}

const hotelSearchForm = document.getElementById('hotelSearchForm');
if (hotelSearchForm) {
  const hotelDestinationInput = document.getElementById('hotelDestinationInput');
  const hotelCheckinInput = document.getElementById('hotelCheckinInput');
  const hotelCheckoutInput = document.getElementById('hotelCheckoutInput');
  const hotelSubmitBtn = document.getElementById('hotelSearchSubmitBtn');
  const cityList = document.getElementById('cityList');

  if (hotelDestinationInput) {
    hotelDestinationInput.addEventListener('input', (event) => {
      fetchCitySuggestions(event.target.value.trim(), cityList);
    });
  }

  hotelSearchForm.addEventListener('submit', (event) => {
    const city = hotelDestinationInput ? hotelDestinationInput.value.trim() : '';

    if (!city) {
      event.preventDefault();
      alert('Please enter hotel city.');
      return;
    }

    if (!hotelCheckinInput || !hotelCheckinInput.value) {
      event.preventDefault();
      alert('Please select check-in date.');
      return;
    }

    if (!hotelCheckoutInput || !hotelCheckoutInput.value) {
      event.preventDefault();
      alert('Please select check-out date.');
      return;
    }

    if (new Date(hotelCheckoutInput.value) <= new Date(hotelCheckinInput.value)) {
      event.preventDefault();
      alert('Check-out date must be after check-in date.');
      return;
    }

    if (hotelSubmitBtn) {
      setButtonBusy(hotelSubmitBtn, 'Searching hotels...', true);
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
      seatShell.classList.add('is-loading');
      seatInfoEl.textContent = 'Loading 2D seat/room map...';
      unitPayload = await requestJson(`/booking/seatmap/${type}/${itemId}`);
      renderUnits();
      syncOutput();
    } catch (err) {
      seatInfoEl.textContent = err.message || 'Unable to load seat/room map right now.';
    } finally {
      seatShell.classList.remove('is-loading');
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
        return;
      }

      const submitButton = bookingForm.querySelector('button[type="submit"]');
      setButtonBusy(submitButton, 'Preparing payment...', true);
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

const upiFlow = document.getElementById('upiPaymentFlow');
if (upiFlow) {
  const bookingId = upiFlow.dataset.bookingId;
  const reservationId = upiFlow.dataset.reservationId;
  const amount = upiFlow.dataset.amount;
  const merchantName = upiFlow.dataset.merchantName;
  const upiId = upiFlow.dataset.upiId;
  const simulatePaymentBtn = document.getElementById('simulatePaymentBtn');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const feedbackEl = document.getElementById('upiFeedback');
  const qrCodeEl = document.getElementById('upiQrCode');
  const otpDigits = Array.from(document.querySelectorAll('.otp-digit'));
  const countdownEl = document.getElementById('upiCountdown');
  const walletBalanceDisplay = document.getElementById('walletBalanceDisplay');
  const paymentPasswordInput = document.getElementById('paymentPasswordInput');
  let paymentSession = null;
  let countdownTimer = null;
  let paymentSessionPromise = null;

  function setFeedback(message, type = '') {
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.className = `upi-feedback ${type}`.trim();
  }

  function switchStep(stepName) {
    const steps = upiFlow.querySelectorAll('.upi-step');
    steps.forEach((step) => {
      step.classList.toggle('upi-step-active', step.dataset.step === stepName);
    });
  }

  function renderQrCode(payload) {
    if (!qrCodeEl || typeof window.QRCode === 'undefined') return;
    qrCodeEl.innerHTML = '';
    new window.QRCode(qrCodeEl, {
      text: payload,
      width: 180,
      height: 180,
      colorDark: '#5F259F',
      colorLight: '#ffffff'
    });
  }

  function getPaymentPassword() {
    return paymentPasswordInput ? paymentPasswordInput.value : '';
  }

  function handlePaymentAuthFailure(payload, fallbackMessage) {
    const errorMessage = payload && payload.error ? payload.error : fallbackMessage;
    setFeedback(errorMessage, 'error');
    if (payload && payload.bookingCancelled && payload.redirectTo) {
      window.setTimeout(() => {
        window.location.href = payload.redirectTo;
      }, 1200);
    }
  }

  function startCountdown(expiresAt) {
    if (countdownTimer) window.clearInterval(countdownTimer);

    function tick() {
      const msLeft = new Date(expiresAt).getTime() - Date.now();
      if (msLeft <= 0) {
        if (countdownEl) countdownEl.textContent = '00:00';
        if (simulatePaymentBtn) simulatePaymentBtn.disabled = true;
        setFeedback('Payment session expired. Refresh the page to restart the UPI flow.', 'error');
        window.clearInterval(countdownTimer);
        return;
      }

      const totalSeconds = Math.floor(msLeft / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      if (countdownEl) countdownEl.textContent = `${minutes}:${seconds}`;
    }

    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  async function startPaymentSession() {
    if (paymentSession) return paymentSession;
    if (paymentSessionPromise) return paymentSessionPromise;

    setFeedback('Preparing UPI session...');
    paymentSessionPromise = (async () => {
      const payload = await requestJson('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ bookingId })
      });

      paymentSession = payload;
      renderQrCode(payload.qrPayload);
      startCountdown(payload.expiresAt);
      if (walletBalanceDisplay) walletBalanceDisplay.textContent = `INR ${Number(payload.walletBalance).toFixed(2)}`;
      setFeedback(`Ready to pay INR ${Number(amount).toFixed(2)} to ${merchantName} using ${upiId}.`, 'success');
      return paymentSession;
    })();

    try {
      return await paymentSessionPromise;
    } catch (error) {
      paymentSession = null;
      handlePaymentAuthFailure({ error: error.message }, 'Unable to start payment.');
      return null;
    } finally {
      paymentSessionPromise = null;
    }
  }

  async function completeUpiPayment() {
    const loginPassword = getPaymentPassword();
    if (!loginPassword) {
      setFeedback('Enter your login password to finalize payment.', 'error');
      if (paymentPasswordInput) paymentPasswordInput.focus();
      return;
    }

    try {
      setButtonBusy(simulatePaymentBtn, 'Processing...', true);
      const payload = await requestJson('/api/confirm-upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ bookingId, loginPassword })
      });

      document.getElementById('successTransactionId').textContent = payload.transactionRef;
      document.getElementById('successAmount').textContent = `INR ${Number(payload.amount).toFixed(2)}`;
      document.getElementById('successTime').textContent = payload.paidAt;
      document.getElementById('successWalletBalance').textContent = `INR ${Number(payload.walletBalance).toFixed(2)}`;
      if (walletBalanceDisplay) walletBalanceDisplay.textContent = `INR ${Number(payload.walletBalance).toFixed(2)}`;
      switchStep('success');
      setFeedback('Payment confirmed. Booking status updated to CONFIRMED.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    } finally {
      setButtonBusy(simulatePaymentBtn, 'Processing...', false);
    }
  }

  function collectOtpValue() {
    return otpDigits.map((input) => input.value.trim()).join('');
  }

  otpDigits.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
      if (input.value && otpDigits[index + 1]) {
        otpDigits[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && otpDigits[index - 1]) {
        otpDigits[index - 1].focus();
      }
    });
  });

  if (simulatePaymentBtn) {
    simulatePaymentBtn.addEventListener('click', async () => {
      setButtonBusy(simulatePaymentBtn, 'Processing...', true);

      if (!paymentSession) {
        await startPaymentSession();
      }

      if (!paymentSession) {
        setButtonBusy(simulatePaymentBtn, 'Processing...', false);
        return;
      }

      if (paymentSession.requiresOtp) {
        setButtonBusy(simulatePaymentBtn, 'Processing...', false);
        switchStep('otp');
        setFeedback(`OTP sent to ${paymentSession.otpPhone}. Enter it to confirm the payment.`, 'success');
        if (otpDigits[0]) otpDigits[0].focus();
      } else {
        await completeUpiPayment();
      }
    });
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      const otp = collectOtpValue();
      if (otp.length !== 6) {
        setFeedback('Enter the full 6-digit OTP.', 'error');
        return;
      }

      setButtonBusy(verifyOtpBtn, 'Verifying...', true);

      try {
        const loginPassword = getPaymentPassword();
        if (!loginPassword) {
          setFeedback('Enter your login password to finalize payment.', 'error');
          if (paymentPasswordInput) paymentPasswordInput.focus();
          return;
        }

        const payload = await requestJson('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ bookingId, otp, loginPassword })
        });

        document.getElementById('successTransactionId').textContent = payload.transactionRef;
        document.getElementById('successAmount').textContent = `INR ${Number(payload.amount).toFixed(2)}`;
        document.getElementById('successTime').textContent = payload.paidAt;
        document.getElementById('successWalletBalance').textContent = `INR ${Number(payload.walletBalance).toFixed(2)}`;
        if (walletBalanceDisplay) walletBalanceDisplay.textContent = `INR ${Number(payload.walletBalance).toFixed(2)}`;
        switchStep('success');
        setFeedback('Payment confirmed. Booking status updated to CONFIRMED.', 'success');
      } catch (error) {
        setFeedback(error.message, 'error');
      } finally {
        setButtonBusy(verifyOtpBtn, 'Verifying...', false);
      }
    });
  }

  renderQrCode(`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${encodeURIComponent(Number(amount).toFixed(2))}&tn=${encodeURIComponent(reservationId || bookingId)}&tr=${encodeURIComponent(bookingId)}`);
  setFeedback('Preparing UPI session...', '');
  startPaymentSession();
}
