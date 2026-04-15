function generateReservationId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `ORS-${stamp}-${random}`;
}

function getInventoryConfig(type) {
  const map = {
    flight: { id: 'flight_id', availabilityCol: 'available_seats', totalCol: 'total_seats', priceCol: 'price' },
    train: { id: 'train_id', availabilityCol: 'available_seats', totalCol: 'total_seats', priceCol: 'price' },
    bus: { id: 'bus_id', availabilityCol: 'available_seats', totalCol: 'total_seats', priceCol: 'price' },
    hotel: { id: 'hotel_id', availabilityCol: 'available_rooms', totalCol: 'total_rooms', priceCol: 'price_per_night' }
  };
  return map[type];
}

function getUnitLayoutConfig(type) {
  if (type === 'flight') {
    return { columns: ['A', 'B', 'C', 'D', 'E', 'F'], aisleAfter: 3, windowColumns: ['A', 'F'] };
  }

  if (type === 'train') {
    return { columns: ['A', 'B', 'C', 'D', 'E'], aisleAfter: 3, windowColumns: ['A', 'E'] };
  }

  if (type === 'bus') {
    return { columns: ['A', 'B', 'C', 'D'], aisleAfter: 2, windowColumns: ['A', 'D'] };
  }

  return { columns: ['A', 'B', 'C', 'D'], aisleAfter: 2, windowColumns: [] };
}

function generateUnitLabels(type, totalUnits) {
  if (type === 'hotel') {
    const labels = [];
    let floor = 1;
    let room = 1;

    while (labels.length < totalUnits) {
      const roomNo = `${floor}${String(room).padStart(2, '0')}`;
      labels.push(`R${roomNo}`);
      room += 1;
      if (room > 25) {
        room = 1;
        floor += 1;
      }
    }

    return labels;
  }

  const { columns } = getUnitLayoutConfig(type);
  const labels = [];

  let row = 1;
  while (labels.length < totalUnits) {
    for (const col of columns) {
      if (labels.length >= totalUnits) break;
      labels.push(`${col}${row}`);
    }
    row += 1;
  }

  return labels;
}

function isLadyReservedSeat(type, label) {
  if (type === 'hotel') return false;

  const number = Number((label.match(/\d+/) || [0])[0]);
  if (!number) return false;

  if (type === 'bus') return number % 4 === 0;
  if (type === 'train') return number % 6 === 0;
  if (type === 'flight') return number % 5 === 0;

  return false;
}

function isWindowSeat(type, label) {
  if (type === 'hotel') return false;

  const { windowColumns } = getUnitLayoutConfig(type);
  const column = (label.match(/[A-Z]+/) || [''])[0];
  return windowColumns.includes(column);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^\d{10}$/.test(phone);
}

function generateTransactionRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `TXN-${stamp}-${random}`;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
  generateReservationId,
  generateTransactionRef,
  generateOtp,
  getInventoryConfig,
  getUnitLayoutConfig,
  generateUnitLabels,
  isLadyReservedSeat,
  isWindowSeat,
  isValidEmail,
  isValidPhone
};
