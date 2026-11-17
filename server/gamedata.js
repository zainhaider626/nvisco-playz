// Static game definitions. Everything here is original content (names, ladders, numbers).
// Costs/incomes are generated from a single exponential ladder so progression is easy to tune in economy.js.

export const REGIONS = [
  { id: 'africa', name: 'Africa', color: '#ff8a00', tagline: 'This is where your empire begins.' },
  { id: 'south_america', name: 'South America', color: '#c26bff', tagline: 'Samba, soy and skyscrapers.' },
  { id: 'asia', name: 'Asia', color: '#ff4d6d', tagline: 'The biggest markets on Earth.' },
  { id: 'europe', name: 'Europe', color: '#3d8bff', tagline: 'Old money, new empires.' },
  { id: 'north_america', name: 'North America', color: '#19c37d', tagline: 'Wall Street and beyond.' },
  { id: 'oceania', name: 'Oceania', color: '#2fd4d4', tagline: 'The final frontier of your conquest.' },
];

export const CATEGORIES = {
  B: { id: 'business', name: 'Business' },
  I: { id: 'industry', name: 'Industries' },
  R: { id: 'realestate', name: 'Real Estate' },
};

// Each region: 20 assets in ascending cost order -> 5 business, 5 industries, 10 real estate.
const ASSET_NAMES = {
  africa: [
    'B Roadside Kiosk', 'R Tin-Roof Shack', 'R Village Plot', 'B Mobile Money Agent', 'R Mud-Brick Home',
    'B Spice Market Stall', 'R Rental Bungalow', 'I Cocoa Cooperative', 'R Town Apartment Block', 'B Telecom Reseller',
    'R Savannah Lodge', 'I Textile Mill', 'R Beach Villa', 'B Safari Tours Co.', 'R City Office Tower',
    'I Gold Refinery', 'R Nile-View Penthouse', 'I Solar Farm Grid', 'R Luxury Resort', 'I Diamond Mine',
  ],
  south_america: [
    'B Street Empanada Cart', 'R Favela Rooftop', 'R Hillside Cottage', 'B Coffee Roastery', 'R Colonial Townhouse',
    'R Surf Hostel', 'B Football Merch Shop', 'I Sugarcane Ethanol Plant', 'R Beachfront Condo', 'B Carnival Event Agency',
    'R Coffee Hacienda', 'I Soybean Processing', 'R Andes Ski Chalet', 'B Digital Bank Startup', 'R Rio Penthouse',
    'I Lithium Brine Works', 'R Amazon Eco-Lodge', 'R Skyline Office Plaza', 'I Offshore Oil Platform', 'I Copper Megamine',
  ],
  asia: [
    'B Noodle Street Stall', 'R Micro Apartment', 'R Rice Paddy Farmhouse', 'B Bubble Tea Chain', 'R Night-Market Shophouse',
    'B Gadget Repair Hub', 'R Suburban Condo', 'I Electronics Assembly Line', 'R Riverside Townhouse', 'B E-Commerce Warehouse',
    'R Tea Plantation Estate', 'I Shipyard Dockworks', 'R Skyline Condo Tower', 'B Ride-Hailing Super App', 'R Heritage Palace Hotel',
    'I Semiconductor Fab', 'R Island Private Villa', 'R Financial District Tower', 'I Bullet Train Network', 'I Robotics Megafactory',
  ],
  europe: [
    'B Corner Bakery', 'R Studio Flat', 'R Countryside Cottage', 'B Craft Brewery', 'R Canal House',
    'B Boutique Fashion Label', 'R Alpine Chalet', 'I Precision Tool Works', 'R Riviera Apartment', 'B Design Studio Group',
    'R Vineyard Chateau', 'I Wind Turbine Plant', 'R Historic Manor House', 'B Luxury Watch House', 'R Parisian Penthouse',
    'I Automotive Factory', 'R Castle Estate', 'R Private Aegean Island', 'I Aerospace Works', 'I Energy Grid Consortium',
  ],
  north_america: [
    'B Food Truck', 'R Starter Home', 'R Lakeside Cabin', 'B Coffee Franchise', 'R Brownstone Flat',
    'B Streaming Studio', 'R Ranch House', 'I Steel Foundry', 'R Beach Mansion', 'B Venture Capital Fund',
    'R Mountain Lodge', 'I Cloud Data Centers', 'R Manhattan Loft', 'B Sports Franchise', 'R Hollywood Hills Estate',
    'I Biotech Labs', 'R Skyscraper Penthouse', 'R Private Ski Resort', 'I Space Launch Company', 'I Global Logistics Fleet',
  ],
  oceania: [
    'B Beach Surf Shack', 'R Bush Cabin', 'R Harbour Flat', 'B Wine Export Co.', 'R Outback Station',
    'B Dive Tour Operator', 'R Coastal Bungalow', 'I Wool Processing Mill', 'R Reef-View Villa', 'B Adventure Tourism Group',
    'R Sydney Harbour Apartment', 'I Iron Ore Rail Line', 'R Vineyard Estate', 'B Airline Startup', 'R Island Resort',
    'I Rare-Earth Refinery', 'R Opera-House Penthouse', 'R Private Atoll', 'I Deep-Sea Mining Fleet', 'I Orbital Satellite Network',
  ],
};

export const ASSETS_PER_REGION = 20;
export const ASSET_MAX_LEVEL = 10;
export const REGION_UNLOCK_OWNED = 10;       // own this many assets in the previous region to open the next one
export const REGION_SET_BONUS = 0.25;        // +25% income from a region once all 20 assets are owned

export const ASSETS = [];
REGIONS.forEach((r, ri) => {
  ASSET_NAMES[r.id].forEach((s, k) => {
    const cat = s[0];
    const name = s.slice(2);
    const index = ri * ASSETS_PER_REGION + k;
    ASSETS.push({ id: `${r.id}-${k + 1}`, region: r.id, regionIndex: ri, k, index, cat: CATEGORIES[cat].id, name });
  });
});
export const ASSET_BY_ID = Object.fromEntries(ASSETS.map(a => [a.id, a]));

// ---------- collectibles: real products at approximate real-world prices (USD) ----------
// Each entry: [name, fallbackArt, price, photoSearch]. photoSearch is what scripts/fetch-images.mjs looks up on Wikimedia Commons (freely licensed photos).
// Prices are rounded list or auction prices and are approximate. Names are the trademarks of their owners and are used only to identify the product.
const ITEM_CATS = [
  { id: 'cars', name: 'Cars', effect: 'income', per: 0.010, set: 0.10, list: [
    ['Suzuki Alto', 'hatch', 9500, 'Suzuki Alto'], ['Toyota Corolla', 'sedan', 22000, 'Toyota Corolla'], ['Honda Civic', 'sedan', 27000, 'Honda Civic'], ['Mazda MX-5 Miata', 'roadster', 30000, 'Mazda MX-5'],
    ['Tesla Model 3', 'ev', 40000, 'Tesla Model 3'], ['Toyota Hilux', 'pickup', 46000, 'Toyota Hilux'], ['Range Rover', 'suv', 110000, 'Range Rover'], ['Mercedes-Benz S-Class', 'limo', 120000, 'Mercedes-Benz S-Class'],
    ['Porsche 911 Carrera', 'coupe', 135000, 'Porsche 911 Carrera'], ['Lamborghini Huracan', 'super', 260000, 'Lamborghini Huracan'], ['Ferrari F8 Tributo', 'super', 280000, 'Ferrari F8 Tributo'], ['Rolls-Royce Phantom', 'limo', 460000, 'Rolls-Royce Phantom'],
    ['McLaren P1', 'hyper', 1150000, 'McLaren P1'], ['Bugatti Veyron', 'hyper', 1900000, 'Bugatti Veyron'], ['Koenigsegg Jesko', 'hyper', 3000000, 'Koenigsegg Jesko'], ['Bugatti Chiron', 'hyper', 3300000, 'Bugatti Chiron'],
    ['Pagani Huayra', 'hyper', 3400000, 'Pagani Huayra'], ['Rolls-Royce Boat Tail', 'gold', 28000000, 'Rolls-Royce Boat Tail'], ['Ferrari 250 GTO', 'vintage', 70000000, 'Ferrari 250 GTO'], ['Mercedes-Benz 300 SLR Uhlenhaut Coupe', 'vintage', 142000000, 'Mercedes-Benz 300 SLR Uhlenhaut']] },
  { id: 'yachts', name: 'Yachts', effect: 'income', per: 0.020, set: 0.15, list: [
    ['Boston Whaler 130 Super Sport', 'rowboat', 18000, 'Boston Whaler 130'], ['Sea Ray Sundancer 320', 'fisher', 250000, 'Sea Ray Sundancer'], ['Azimut 55', 'sport', 1400000, 'Azimut 55 yacht'], ['Sunseeker 76 Yacht', 'motor', 4000000, 'Sunseeker 76 Yacht'],
    ['Feadship Savannah', 'super', 200000000, 'Savannah yacht Feadship'], ['Flying Fox', 'giga', 400000000, 'Flying Fox yacht'], ['Azzam', 'palace', 600000000, 'Azzam yacht'], ['Eclipse', 'nation', 1200000000, 'Eclipse yacht Blohm Voss']] },
  { id: 'jets', name: 'Jets', effect: 'income', per: 0.040, set: 0.20, list: [
    ['Cirrus SR22', 'prop', 900000, 'Cirrus SR22'], ['Cessna Citation CJ4', 'light', 10000000, 'Cessna Citation CJ4'], ['Gulfstream G650', 'biz', 70000000, 'Gulfstream G650'], ['Boeing 747-8 VIP', 'long', 400000000, 'Boeing 747-8 Intercontinental'], ['Airbus A380', 'space', 445000000, 'Airbus A380']] },
  { id: 'watches', name: 'Watches', effect: 'tap', per: 0.030, set: 0.20, list: [
    ['Casio F-91W', 'classic', 20, 'Casio F-91W'], ['Seiko 5 Sports', 'field', 300, 'Seiko 5 watch'], ['Omega Seamaster Diver 300M', 'diver', 5500, 'Omega Seamaster Diver 300M'], ['Omega Speedmaster Moonwatch', 'chrono', 7000, 'Omega Speedmaster Professional'],
    ['Rolex Submariner', 'diver', 10000, 'Rolex Submariner'], ['Audemars Piguet Royal Oak', 'skeleton', 40000, 'Audemars Piguet Royal Oak'], ['Patek Philippe Nautilus', 'calendar', 120000, 'Patek Philippe Nautilus'], ['Richard Mille RM 011', 'repeater', 2000000, 'Richard Mille watch'],
    ['Patek Philippe Henry Graves Supercomplication', 'pocket', 24000000, 'Patek Philippe Graves Supercomplication'], ['Breguet Grande Complication No. 160', 'grand', 30000000, 'Breguet Marie Antoinette watch'], ['Patek Philippe Grandmaster Chime', 'dress', 31000000, 'Patek Philippe Grandmaster Chime'], ['Graff Hallucination', 'diamond', 55000000, 'Graff Hallucination watch']] },
  { id: 'mobiles', name: 'Mobiles', effect: 'tap', per: 0.030, set: 0.20, list: [
    ['Nokia 3310', 'feature', 60, 'Nokia 3310'], ['Samsung Galaxy A15', 'budget', 200, 'Samsung Galaxy A15'], ['Motorola RAZR V3', 'mid', 500, 'Motorola RAZR V3'], ['iPhone 16', 'flagship', 799, 'iPhone 16'],
    ['iPhone 16 Pro Max', 'flagship', 1199, 'iPhone 16 Pro Max'], ['Samsung Galaxy Z Fold6', 'fold', 1900, 'Samsung Galaxy Z Fold'], ['Vertu Signature Touch', 'gold', 9500, 'Vertu Signature Touch'], ['Vertu Signature Cobra', 'sat', 310000, 'Vertu Signature Cobra'],
    ['Goldvish Le Million', 'diamond', 1300000, 'Goldvish Le Million'], ['Stuart Hughes iPhone 3G Kings Button', 'exec', 2500000, 'Stuart Hughes iPhone'], ['Falcon Supernova iPhone 6 Pink Diamond', 'glass', 48500000, 'Falcon Supernova iPhone 6']] },
  { id: 'art', name: 'Art', effect: 'income', per: 0.015, set: 0.12, list: [
    ['The Great Wave off Kanagawa', 'print', 2800000, 'The Great Wave off Kanagawa Hokusai'], ['Van Gogh: Irises', 'impress', 54000000, 'Van Gogh Irises 1889'], ['Van Gogh: Portrait of Dr. Gachet', 'portrait', 82500000, 'Van Gogh Portrait of Dr Gachet'],
    ['Monet: Water Lilies', 'landscape', 85000000, 'Monet Water Lilies'], ['Klimt: Portrait of Adele Bloch-Bauer I', 'icon', 135000000, 'Klimt Portrait of Adele Bloch-Bauer I'], ['Cezanne: The Card Players', 'modern', 250000000, 'Cezanne The Card Players'],
    ['Gauguin: When Will You Marry?', 'mural', 300000000, 'Gauguin Nafea Faa Ipoipo'], ['Leonardo: Salvator Mundi', 'portrait', 450000000, 'Salvator Mundi Leonardo'], ['Leonardo: Mona Lisa', 'portrait', 860000000, 'Mona Lisa'], ['Van Gogh: The Starry Night', 'landscape', 1000000000, 'Van Gogh Starry Night']] },
];

export const ITEM_CATEGORIES = ITEM_CATS.map(c => ({ id: c.id, name: c.name, effect: c.effect, per: c.per, set: c.set, count: c.list.length }));
export const ITEMS = [];
for (const c of ITEM_CATS) {
  c.list.forEach(([name, art, price, q], k) => {
    ITEMS.push({ id: `${c.id}-${k + 1}`, cat: c.id, k, name, art, price, legendary: price >= 5e7, q });
  });
}
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const ITEM_CAT_BY_ID = Object.fromEntries(ITEM_CATS.map(c => [c.id, c]));

// ---------- stock market: fictional look-alikes of the world's biggest companies (spoof names, original marks) ----------
const STOCK_DEFS = [
  ['SBZ', 'Starbuzz Coffee', 'Food & Drink', 0.008, '#2f9e6b'], ['KKC', 'Koko Cola Company', 'Beverages', 0.007, '#e0443d'], ['MCN', "McDonell's Burgers", 'Food & Drink', 0.008, '#f5b50a'],
  ['NKY', 'Nikey Sportswear', 'Apparel', 0.011, '#f97316'], ['LKC', 'Luckee Cement', 'Industrial', 0.012, '#64748b'], ['JZT', 'Jazzy Telecom', 'Telecom', 0.011, '#ef4444'],
  ['DSN', 'Disnay Entertainment', 'Media', 0.012, '#3b82f6'], ['NFX', 'Netflux Streaming', 'Media', 0.016, '#dc2626'], ['TYD', 'Toyoda Motors', 'Automotive', 0.010, '#b91c1c'],
  ['SSG', 'Samsong Electronics', 'Electronics', 0.013, '#2563eb'], ['ENR', 'Enrgo Fertilizer', 'Agriculture', 0.011, '#16a34a'], ['MST', 'Mastercorp Payments', 'Finance', 0.009, '#f59e0b'],
  ['WMK', 'Walmark Stores', 'Retail', 0.008, '#0ea5e9'], ['PRC', 'Pear Computers', 'Technology', 0.014, '#94a3b8'], ['MSC', 'Macrosoft Corporation', 'Technology', 0.013, '#38bdf8'],
  ['GGL', 'Goggle Alphabit', 'Technology', 0.015, '#facc15'], ['AMZ', 'Amazonia Commerce', 'Retail', 0.016, '#fb923c'], ['TSL', 'Teslon Motors', 'Automotive', 0.026, '#f43f5e'],
  ['NVD', 'Nvidya Chips', 'Semiconductors', 0.025, '#84cc16'], ['MTA', 'Metta Platforms', 'Social', 0.020, '#6366f1'], ['BRK', 'Berkshore Holdings', 'Conglomerate', 0.007, '#a16207'],
  ['ARM', 'Aramcore Oil', 'Energy', 0.010, '#14b8a6'],
];
const sig2 = (x) => { const e = Math.floor(Math.log10(x)); return Math.round(x / 10 ** (e - 1)) * 10 ** (e - 1); };
export const STOCKS = STOCK_DEFS.map(([id, name, sector, vol, color], i) => ({ id, name, sector, vol, color, base: sig2(12 * Math.pow(5e21 / 12, i / (STOCK_DEFS.length - 1))) }));
export const STOCK_BY_ID = Object.fromEntries(STOCKS.map(s => [s.id, s]));
export const STOCK_MAX_SHARES = 100_000;     // per player per stock (bounds trading profit)
export const STOCK_FEE = 0.01;               // 1% on every buy and sell
export const STOCK_KAPPA = 0.012;            // mean reversion strength per step (a step is STOCK_STEP_SECONDS long)
export const STOCK_STEP_SECONDS = 5;         // the market moves every 5 seconds
export const STOCK_BAND = [0.25, 4];         // price stays within [base*0.25, base*4]

// ---------- leagues, tiers, industries ----------
export const LEAGUES = [
  { id: 0, name: 'Bronze', color: '#c9803f' },
  { id: 1, name: 'Silver', color: '#aab4c4' },
  { id: 2, name: 'Gold', color: '#f5c542' },
  { id: 3, name: 'Platinum', color: '#6fe0d0' },
  { id: 4, name: 'Diamond', color: '#6fb1ff' },
  { id: 5, name: 'Master', color: '#e07bff' },
];
export const LEAGUE_REWARD_HOURS = [24, 18, 12, 8, 6];   // top-5 reward = this many hours of the player's own income
export const LEAGUE_PROMOTE = 5;
export const LEAGUE_DEMOTE = 5;

// Eight card tiers (names are original look-alikes of famous premium cards). `min` is lifetime earnings.
export const TIERS = [
  { id: 0, name: 'Peasant', card: 'Starter Card', min: 0 },
  { id: 1, name: 'Merchant', card: 'Stratos Rewards', min: 1e6 },
  { id: 2, name: 'Trader', card: 'Citadel Prestige', min: 1e10 },
  { id: 3, name: 'Magnate', card: 'Cutts Silk', min: 1e16 },
  { id: 4, name: 'Baron', card: 'Dubai Royale First', min: 1e22 },
  { id: 5, name: 'Lord', card: 'Merrick Octave Black', min: 1e28 },
  { id: 6, name: 'Sovereign', card: 'JP Morgen Reserve', min: 1e34 },
  { id: 7, name: 'Tycoon', card: 'Centaur Black', min: 1e40 },
];

export const INDUSTRIES = [
  'Technology', 'Software / SaaS', 'Marketing & Advertising', 'Design & Creative', 'E-commerce & Retail',
  'Hardware & Electronics', 'Manufacturing', 'Construction & Real Estate', 'Finance & Fintech', 'Education & Training',
  'Healthcare', 'Food & Hospitality', 'Logistics & Transport', 'Energy', 'Agriculture', 'Media & Entertainment',
  'Consulting & Services', 'Freelancer / Agency', 'Other',
];

// ---------- countries you can expand into (branches) and partner in, grouped by region ----------
// f = market size factor for branch cost; income per branch level is the same everywhere so choose by cost and by partners.
export const REGION_COUNTRIES = {
  africa: [['NG', 1.3], ['EG', 1.3], ['ZA', 1.5], ['KE', 0.9], ['ET', 0.8], ['MA', 0.9], ['GH', 0.8], ['TZ', 0.7], ['DZ', 0.9], ['SN', 0.6]],
  south_america: [['BR', 1.6], ['AR', 1.1], ['CO', 0.9], ['CL', 1.0], ['PE', 0.8], ['UY', 0.6], ['EC', 0.6], ['PY', 0.5], ['BO', 0.5], ['VE', 0.7]],
  asia: [['CN', 1.8], ['IN', 1.7], ['JP', 1.8], ['KR', 1.4], ['PK', 1.0], ['ID', 1.2], ['SA', 1.4], ['AE', 1.5], ['TR', 1.2], ['VN', 0.9], ['BD', 0.8], ['SG', 1.4], ['MY', 1.0], ['TH', 1.0], ['PH', 0.9]],
  europe: [['GB', 1.6], ['DE', 1.7], ['FR', 1.6], ['IT', 1.3], ['ES', 1.2], ['NL', 1.2], ['CH', 1.5], ['SE', 1.1], ['PL', 0.9], ['TR', 0.0]].filter(c => c[1] > 0),
  north_america: [['US', 1.9], ['CA', 1.5], ['MX', 1.2], ['CU', 0.6], ['PA', 0.8], ['CR', 0.6], ['DO', 0.6], ['GT', 0.5]],
  oceania: [['AU', 1.5], ['NZ', 1.1], ['FJ', 0.5], ['PG', 0.5], ['NC', 0.4]],
};
export const BRANCH_MAX_LEVEL = 5;
export const BRANCH_INCOME_PER_LEVEL = 0.015;     // +1.5% total income per branch level (so +7.5% at level 5 in one country)
export const BRANCH_REGION_SET_BONUS = 0.10;      // +10% when every country of a region has a branch
export const PARTNER_INCOME_BONUS = 0.02;         // +2% per active partner
export const PARTNER_MAX = 5;
export const COUNTRY_BY_CODE = {};
for (const [region, list] of Object.entries(REGION_COUNTRIES)) list.forEach(([code, f], i) => { if (!COUNTRY_BY_CODE[code]) COUNTRY_BY_CODE[code] = { code, region, f, order: i }; });

