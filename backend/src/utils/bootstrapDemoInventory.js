const {
  City,
  Flight,
  Train,
  Bus,
  Hotel,
  createDocument
} = require('../data/store');
const { getLocalDateString } = require('./dateTime');

const TRANSPORT_CONFIG = {
  flight: {
    Model: Flight,
    idField: 'flight_id',
    codePrefix: 'FL',
    operatorName: 'ORS Airways',
    classType: 'Economy',
    priceBase: 4200,
    totalSeats: 180,
    availableSeats: 96,
    rating: 4.3,
    departureHour: 8,
    durationHours: 2
  },
  train: {
    Model: Train,
    idField: 'train_id',
    codePrefix: 'TR',
    operatorName: 'ORS Rail',
    classType: '3AC',
    priceBase: 1600,
    totalSeats: 720,
    availableSeats: 340,
    rating: 4.2,
    departureHour: 6,
    durationHours: 10
  },
  bus: {
    Model: Bus,
    idField: 'bus_id',
    codePrefix: 'BS',
    operatorName: 'ORS Roadways',
    classType: 'AC Sleeper',
    priceBase: 1100,
    totalSeats: 42,
    availableSeats: 19,
    rating: 4.1,
    departureHour: 21,
    durationHours: 8
  }
};

const HOTEL_VARIANTS = [
  {
    suffix: 'Central Stay',
    roomType: 'Standard',
    amenities: 'WiFi,Breakfast,Housekeeping',
    pricePerNight: 2400,
    totalRooms: 90,
    availableRooms: 34,
    rating: 4.1
  },
  {
    suffix: 'Grand Suites',
    roomType: 'Deluxe',
    amenities: 'WiFi,Pool,Breakfast,Gym',
    pricePerNight: 3600,
    totalRooms: 75,
    availableRooms: 28,
    rating: 4.4
  },
  {
    suffix: 'Skyline Residency',
    roomType: 'Suite',
    amenities: 'WiFi,Gym,Airport Shuttle,Breakfast',
    pricePerNight: 4800,
    totalRooms: 60,
    availableRooms: 22,
    rating: 4.6
  }
];

const DAY_OFFSETS = [2, 10, 25, 45, 75, 120];

function formatDate(date) {
  return getLocalDateString(date);
}

function formatTime(totalHours) {
  const hours = ((Math.floor(totalHours) % 24) + 24) % 24;
  const minutes = Math.round((totalHours - Math.floor(totalHours)) * 60) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function buildTransportCode(codePrefix, sourceCityId, destinationCityId, dayOffset) {
  return `${codePrefix}${sourceCityId}${destinationCityId}${String(dayOffset).padStart(3, '0')}`;
}

function buildTransportRecord(transportType, sourceCity, destinationCity, dayOffset) {
  const config = TRANSPORT_CONFIG[transportType];
  const travelDate = new Date();
  travelDate.setDate(travelDate.getDate() + dayOffset);

  const routeWeight = Math.abs(destinationCity.city_id - sourceCity.city_id) + 1;
  const departureHour = config.departureHour + (routeWeight % 5);
  const durationHours = config.durationHours + routeWeight * (transportType === 'flight' ? 0.25 : transportType === 'train' ? 0.8 : 0.5);
  const dynamicPrice = config.priceBase + routeWeight * (transportType === 'flight' ? 450 : transportType === 'train' ? 180 : 120) + dayOffset * 4;
  const reservedUnits = Math.max(2, Math.floor(config.totalSeats * 0.45));
  const adjustment = Math.floor(Math.min(dayOffset / 4, reservedUnits));

  return {
    code: buildTransportCode(config.codePrefix, sourceCity.city_id, destinationCity.city_id, dayOffset),
    operator_name: `${config.operatorName} ${sourceCity.city_name}-${destinationCity.city_name}`,
    source_city_id: sourceCity.city_id,
    destination_city_id: destinationCity.city_id,
    travel_date: formatDate(travelDate),
    depart_time: formatTime(departureHour),
    arrive_time: formatTime(departureHour + durationHours),
    class_type: config.classType,
    price: dynamicPrice,
    total_seats: config.totalSeats,
    available_seats: Math.max(1, config.availableSeats - adjustment),
    rating: config.rating
  };
}

async function ensureTransportCoverage() {
  const cities = await City.find({}).sort({ city_id: 1 }).lean();
  if (cities.length < 2) return;

  for (const [transportType, config] of Object.entries(TRANSPORT_CONFIG)) {
    for (const sourceCity of cities) {
      for (const destinationCity of cities) {
        if (sourceCity.city_id === destinationCity.city_id) continue;

        const existingCount = await config.Model.countDocuments({
          source_city_id: sourceCity.city_id,
          destination_city_id: destinationCity.city_id,
          travel_date: { $gte: getLocalDateString() }
        });

        if (existingCount > 0) continue;

        for (const dayOffset of DAY_OFFSETS) {
          await createDocument(config.Model, transportType, buildTransportRecord(transportType, sourceCity, destinationCity, dayOffset));
        }
      }
    }
  }
}

async function ensureHotelCoverage() {
  const cities = await City.find({}).sort({ city_id: 1 }).lean();
  if (!cities.length) return;

  for (const city of cities) {
    for (const variant of HOTEL_VARIANTS) {
      const hotelName = `${city.city_name} ${variant.suffix}`;
      const existingHotel = await Hotel.findOne({
        city_id: city.city_id,
        hotel_name: hotelName,
        room_type: variant.roomType
      }).lean();

      if (existingHotel) continue;

      await createDocument(Hotel, 'hotel', {
        hotel_name: hotelName,
        city_id: city.city_id,
        room_type: variant.roomType,
        amenities: variant.amenities,
        price_per_night: variant.pricePerNight + city.city_id * 90,
        total_rooms: variant.totalRooms,
        available_rooms: variant.availableRooms,
        rating: variant.rating
      });
    }
  }
}

async function ensureDemoInventoryCoverage() {
  await ensureTransportCoverage();
  await ensureHotelCoverage();
}

module.exports = { ensureDemoInventoryCoverage };
