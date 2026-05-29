import { faker } from "@faker-js/faker";

/**
 * Test data utility — random and formatted data generators for Playwright tests.
 *
 * Import:
 *   import { dataUtils } from "../utils/data-utils.js";
 *
 * Every method is a function call so each test gets a fresh value:
 *   const email = dataUtils.email();
 */
export const dataUtils = {

  // ════════════════════════════════════════════════════════════════════════════
  // PERSON
  // ════════════════════════════════════════════════════════════════════════════

  /** Full name e.g. "John Smith" */
  fullName:        () => faker.person.fullName(),
  firstName:       () => faker.person.firstName(),
  lastName:        () => faker.person.lastName(),
  /** "Mr" | "Mrs" | "Ms" | "Dr" etc. */
  namePrefix:      () => faker.person.prefix(),
  /** "Jr." | "Sr." | "III" etc. */
  nameSuffix:      () => faker.person.suffix(),
  gender:          () => faker.person.sex(),
  jobTitle:        () => faker.person.jobTitle(),
  jobDepartment:   () => faker.person.jobArea(),
  bio:             () => faker.person.bio(),

  // ════════════════════════════════════════════════════════════════════════════
  // CONTACT
  // ════════════════════════════════════════════════════════════════════════════

  email:           () => faker.internet.email(),
  /** Work email using the supplied name, e.g. john.smith@acme.com */
  workEmail:       (firstName?: string, lastName?: string, company?: string) =>
                     faker.internet.email({
                       firstName: firstName ?? faker.person.firstName(),
                       lastName:  lastName  ?? faker.person.lastName(),
                       provider:  company   ? `${company.toLowerCase().replace(/\s+/g, "")}.com` : undefined,
                     }),

  /** Generic phone number */
  phone:           () => faker.phone.number(),
  /** US format: (555) 867-5309 */
  phoneUS:         () => faker.phone.number({ style: "national" }),
  /** E.164 international format: +15558675309 */
  phoneIntl:       () => faker.phone.number({ style: "international" }),
  /** Mobile number with country code prefix for common locales */
  mobileNumber:    (countryCode = "+1") => {
    const digits = faker.string.numeric(10);
    return `${countryCode}${digits}`;
  },
  /** Indian mobile: +91 9XXXXXXXXX */
  mobileIN:        () => `+91 9${faker.string.numeric(9)}`,
  /** UK mobile: +44 7XXX XXXXXX */
  mobileUK:        () => `+44 7${faker.string.numeric(3)} ${faker.string.numeric(6)}`,
  /** AU mobile: +61 4XX XXX XXX */
  mobileAU:        () => `+61 4${faker.string.numeric(2)} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`,

  // ════════════════════════════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════════════════════════════

  username:        () => faker.internet.username(),
  password:        (length = 12) => faker.internet.password({ length, memorable: false }),
  /** Strong password with upper, lower, digit, and special character */
  strongPassword:  () => {
    const upper   = faker.string.alpha({ length: 2, casing: "upper" });
    const lower   = faker.string.alpha({ length: 4, casing: "lower" });
    const digits  = faker.string.numeric(2);
    const special = faker.helpers.arrayElement(["!", "@", "#", "$", "%", "&"]);
    return faker.helpers.shuffle([...upper, ...lower, ...digits, special]).join("") as string;
  },
  /** 4-digit OTP */
  otp4:            () => faker.string.numeric(4),
  /** 6-digit OTP (most common) */
  otp6:            () => faker.string.numeric(6),
  /** 8-digit OTP */
  otp8:            () => faker.string.numeric(8),
  /** Numeric PIN of any length (default 4) */
  pin:             (length = 4) => faker.string.numeric(length),

  // ════════════════════════════════════════════════════════════════════════════
  // STRING GENERATORS
  // ════════════════════════════════════════════════════════════════════════════

  /** Letters only (a-z A-Z) */
  alphaOnly:       (length = 8) => faker.string.alpha(length),
  /** Lowercase letters only */
  alphaLower:      (length = 8) => faker.string.alpha({ length, casing: "lower" }),
  /** Uppercase letters only */
  alphaUpper:      (length = 8) => faker.string.alpha({ length, casing: "upper" }),
  /** Digits only (as a string, with no leading-zero guarantee) */
  numericString:   (length = 8) => faker.string.numeric(length),
  /** Alphanumeric (letters + digits) */
  alphanumeric:    (length = 8) => faker.string.alphanumeric(length),
  /** Alphanumeric lowercase */
  alphanumericLower: (length = 8) => faker.string.alphanumeric({ length, casing: "lower" }),
  /** Random string from a custom character set */
  fromChars:       (chars: string, length = 8) =>
                     Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join(""),
  /** Slug-safe string: lowercase letters, digits, hyphens */
  slug:            (words = 3) =>
                     Array.from({ length: words }, () => faker.lorem.word()).join("-"),
  /** URL-safe token */
  token:           (length = 32) => faker.string.alphanumeric({ length, casing: "lower" }),
  /** Hex string (without # prefix) */
  hexString:       (length = 6) => faker.string.hexadecimal({ length, prefix: "" }),

  // ════════════════════════════════════════════════════════════════════════════
  // NUMBERS
  // ════════════════════════════════════════════════════════════════════════════

  /** Integer between min and max (inclusive) */
  number:          (min = 1, max = 100) => faker.number.int({ min, max }),
  /** Float rounded to 2 decimal places */
  float:           (min = 1.0, max = 100.0) =>
                     faker.number.float({ min, max, fractionDigits: 2 }),
  /** Price string e.g. "29.99" */
  price:           (min = 1, max = 9999) =>
                     faker.number.float({ min, max, fractionDigits: 2 }).toFixed(2),
  /** Percentage 0–100 */
  percentage:      () => faker.number.int({ min: 0, max: 100 }),
  /** Positive integer (no upper bound) */
  positiveInt:     () => faker.number.int({ min: 1, max: 999999 }),
  /** Integer as a padded string e.g. "007" */
  paddedInt:       (value?: number, pad = 3) =>
                     String(value ?? faker.number.int({ min: 1, max: 999 })).padStart(pad, "0"),
  /** Quantity (small positive number) */
  quantity:        (max = 99) => faker.number.int({ min: 1, max }),

  // ════════════════════════════════════════════════════════════════════════════
  // DATE HANDLER
  // ════════════════════════════════════════════════════════════════════════════

  /** Today as ISO date string "YYYY-MM-DD" */
  today:           () => new Date().toISOString().split("T")[0] as string,
  /** Yesterday */
  yesterday:       () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0] as string;
  },
  /** Tomorrow */
  tomorrow:        () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0] as string;
  },
  /** Add N days to today */
  addDays:         (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0] as string;
  },
  /** Subtract N days from today */
  subtractDays:    (days: number) => {
    const d = new Date(); d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0] as string;
  },
  /** Random past date "YYYY-MM-DD" */
  pastDate:        () => faker.date.past().toISOString().split("T")[0] as string,
  /** Random future date "YYYY-MM-DD" */
  futureDate:      () => faker.date.future().toISOString().split("T")[0] as string,
  /** Random recent date (last 7 days) */
  recentDate:      () => faker.date.recent({ days: 7 }).toISOString().split("T")[0] as string,
  /** Date of birth for a person aged between minAge and maxAge */
  dateOfBirth:     (minAge = 18, maxAge = 60) =>
                     faker.date.birthdate({ min: minAge, max: maxAge, mode: "age" })
                       .toISOString().split("T")[0] as string,
  /** Date in DD/MM/YYYY format */
  dateDDMMYYYY:    (date?: Date) => {
    const d = date ?? faker.date.past();
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  },
  /** Date in MM/DD/YYYY format */
  dateMMDDYYYY:    (date?: Date) => {
    const d = date ?? faker.date.past();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  },
  /** Date in DD-MM-YYYY format */
  dateDDMMYYYYDash: (date?: Date) => {
    const d = date ?? faker.date.past();
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  },
  /** Date in Month D, YYYY format e.g. "January 5, 2024" */
  dateLong:        (date?: Date) => {
    const d = date ?? faker.date.past();
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  },
  /** Random date between two dates (ISO strings or Date objects) */
  dateBetween:     (from: string | Date, to: string | Date) =>
                     faker.date.between({ from, to }).toISOString().split("T")[0] as string,
  /** Credit-card-style expiry month/year e.g. "09/27" */
  cardExpiry:      () => {
    const d = faker.date.future({ years: 5 });
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TIME HANDLER
  // ════════════════════════════════════════════════════════════════════════════

  /** Current time as "HH:MM" (24-hour) */
  currentTime24:   () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  },
  /** Current time as "HH:MM AM/PM" (12-hour) */
  currentTime12:   () => {
    const d = new Date();
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    return `${String(h % 12 || 12).padStart(2, "0")}:${m} ${ampm}`;
  },
  /** Random time as "HH:MM" (24-hour) */
  randomTime24:    () => {
    const h = String(faker.number.int({ min: 0, max: 23 })).padStart(2, "0");
    const m = String(faker.number.int({ min: 0, max: 59 })).padStart(2, "0");
    return `${h}:${m}`;
  },
  /** Random time as "HH:MM AM/PM" */
  randomTime12:    () => {
    const h = faker.number.int({ min: 1, max: 12 });
    const m = String(faker.number.int({ min: 0, max: 59 })).padStart(2, "0");
    const ampm = faker.helpers.arrayElement(["AM", "PM"] as const);
    return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
  },
  /** Random time with seconds "HH:MM:SS" */
  randomTimeWithSeconds: () => {
    const h = String(faker.number.int({ min: 0, max: 23 })).padStart(2, "0");
    const m = String(faker.number.int({ min: 0, max: 59 })).padStart(2, "0");
    const s = String(faker.number.int({ min: 0, max: 59 })).padStart(2, "0");
    return `${h}:${m}:${s}`;
  },
  /** Random time between two 24h strings e.g. timeBetween("09:00", "17:00") */
  timeBetween:     (startHHMM: string, endHHMM: string) => {
    const [sh, sm] = startHHMM.split(":").map(Number);
    const [eh, em] = endHHMM.split(":").map(Number);
    const startMin = (sh ?? 0) * 60 + (sm ?? 0);
    const endMin   = (eh ?? 0) * 60 + (em ?? 0);
    const rand     = faker.number.int({ min: startMin, max: endMin });
    return `${String(Math.floor(rand / 60)).padStart(2, "0")}:${String(rand % 60).padStart(2, "0")}`;
  },
  /** Current epoch timestamp in milliseconds */
  timestamp:       () => Date.now(),
  /** Current ISO datetime string */
  isoDateTime:     () => new Date().toISOString(),

  // ════════════════════════════════════════════════════════════════════════════
  // ADDRESS
  // ════════════════════════════════════════════════════════════════════════════

  streetAddress:   () => faker.location.streetAddress(),
  secondaryAddress: () => faker.location.secondaryAddress(),
  city:            () => faker.location.city(),
  state:           () => faker.location.state(),
  /** State abbreviation e.g. "CA" */
  stateAbbr:       () => faker.location.state({ abbreviated: true }),
  zipCode:         () => faker.location.zipCode(),
  /** UK postcode format */
  postcodeUK:      () => faker.location.zipCode("??# #??").toUpperCase(),
  /** Indian PIN code (6 digits starting with 1-9) */
  pinCodeIN:       () => `${faker.number.int({ min: 1, max: 9 })}${faker.string.numeric(5)}`,
  country:         () => faker.location.country(),
  countryCode:     () => faker.location.countryCode("alpha-2"),
  /** ISO 3166-1 alpha-3 country code e.g. "USA" */
  countryCode3:    () => faker.location.countryCode("alpha-3"),
  /** Full address as a single string */
  fullAddress:     () =>
                     `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode()}, ${faker.location.country()}`,
  /** Address as a structured object */
  addressObject:   () => ({
    street:      faker.location.streetAddress(),
    unit:        faker.location.secondaryAddress(),
    city:        faker.location.city(),
    state:       faker.location.state(),
    stateCode:   faker.location.state({ abbreviated: true }),
    zipCode:     faker.location.zipCode(),
    country:     faker.location.country(),
    countryCode: faker.location.countryCode("alpha-2"),
  }),
  latitude:        () => faker.location.latitude(),
  longitude:       () => faker.location.longitude(),
  /** Lat/Lng pair */
  coordinates:     () => ({
    lat: faker.location.latitude(),
    lng: faker.location.longitude(),
  }),
  timezone:        () => faker.location.timeZone(),

  // ════════════════════════════════════════════════════════════════════════════
  // COUNTRIES (common list for dropdowns)
  // ════════════════════════════════════════════════════════════════════════════

  /** Pick a random country from a curated list of 20 common countries */
  commonCountry:   () => faker.helpers.arrayElement([
    "United States", "United Kingdom", "Canada", "Australia", "Germany",
    "France", "India", "Japan", "China", "Brazil", "Mexico", "Italy",
    "Spain", "South Korea", "Netherlands", "Sweden", "Singapore",
    "New Zealand", "South Africa", "UAE",
  ]),
  /** ISO alpha-2 code for a common country e.g. "US" */
  commonCountryCode: () => faker.helpers.arrayElement([
    "US", "GB", "CA", "AU", "DE", "FR", "IN", "JP", "CN", "BR",
    "MX", "IT", "ES", "KR", "NL", "SE", "SG", "NZ", "ZA", "AE",
  ]),

  // ════════════════════════════════════════════════════════════════════════════
  // INTERNET / DIGITAL
  // ════════════════════════════════════════════════════════════════════════════

  url:             () => faker.internet.url(),
  httpsUrl:        () => faker.internet.url({ protocol: "https" }),
  domainName:      () => faker.internet.domainName(),
  ipAddress:       () => faker.internet.ip(),
  ipv6:            () => faker.internet.ipv6(),
  macAddress:      () => faker.internet.mac(),
  userAgent:       () => faker.internet.userAgent(),
  /** Random HTTP status code */
  httpStatus:      () => faker.helpers.arrayElement([200, 201, 400, 401, 403, 404, 422, 500]),
  /** MIME type */
  mimeType:        () => faker.system.mimeType(),

  // ════════════════════════════════════════════════════════════════════════════
  // FILE
  // ════════════════════════════════════════════════════════════════════════════

  /** Filename without extension */
  fileNameBase:    () => faker.system.fileName({ extensionCount: 0 }),
  /** Filename with extension e.g. "report_2024.pdf" */
  fileName:        (ext?: string) =>
                     ext
                       ? `${faker.lorem.slug(2)}.${ext}`
                       : faker.system.fileName(),
  /** Common upload extension */
  uploadExtension: () => faker.helpers.arrayElement(["pdf", "docx", "xlsx", "png", "jpg", "csv", "txt", "zip"]),
  /** Image filename */
  imageFileName:   () => `${faker.lorem.slug(2)}.${faker.helpers.arrayElement(["jpg", "png", "webp", "gif"])}`,
  /** File size string e.g. "2.4 MB" */
  fileSize:        () => `${faker.number.float({ min: 0.1, max: 99, fractionDigits: 1 })} ${faker.helpers.arrayElement(["KB", "MB"])}`,

  // ════════════════════════════════════════════════════════════════════════════
  // PRODUCT / E-COMMERCE
  // ════════════════════════════════════════════════════════════════════════════

  productName:     () => faker.commerce.productName(),
  productCategory: () => faker.commerce.department(),
  productDescription: () => faker.commerce.productDescription(),
  sku:             () => `SKU-${faker.string.alphanumeric({ length: 6, casing: "upper" })}`,
  barcode:         () => faker.string.numeric(13),
  /** Price string with 2 decimal places e.g. "49.99" */
  productPrice:    (min = 1, max = 9999) =>
                     faker.number.float({ min, max, fractionDigits: 2 }).toFixed(2),
  discountPercent: () => faker.helpers.arrayElement([5, 10, 15, 20, 25, 30, 40, 50]),
  couponCode:      () => faker.string.alphanumeric({ length: 8, casing: "upper" }),
  orderNumber:     () => `ORD-${faker.string.numeric(8)}`,
  invoiceNumber:   () => `INV-${new Date().getFullYear()}-${faker.string.numeric(5)}`,

  // ════════════════════════════════════════════════════════════════════════════
  // PAYMENT
  // ════════════════════════════════════════════════════════════════════════════

  /** Test Visa card number (Luhn-valid) */
  cardNumberVisa:      () => "4111111111111111",
  /** Test Mastercard number */
  cardNumberMC:        () => "5500005555555559",
  /** Test Amex number */
  cardNumberAmex:      () => "371449635398431",
  /** Last 4 digits of a fake card */
  cardLast4:           () => faker.string.numeric(4),
  /** 3-digit CVV */
  cvv3:                () => faker.string.numeric(3),
  /** 4-digit CVV (Amex) */
  cvv4:                () => faker.string.numeric(4),
  /** Cardholder name (uppercase, as printed on card) */
  cardholderName:      () => faker.person.fullName().toUpperCase(),

  // ════════════════════════════════════════════════════════════════════════════
  // COLOR
  // ════════════════════════════════════════════════════════════════════════════

  /** Hex color e.g. "#a3f2c1" */
  colorHex:        () => faker.color.rgb({ format: "hex" }),
  /** RGB string e.g. "rgb(120,200,80)" */
  colorRgb:        () => {
    const [r, g, b] = [
      faker.number.int({ min: 0, max: 255 }),
      faker.number.int({ min: 0, max: 255 }),
      faker.number.int({ min: 0, max: 255 }),
    ];
    return `rgb(${r},${g},${b})`;
  },
  /** CSS color name e.g. "red" */
  colorName:       () => faker.color.human(),

  // ════════════════════════════════════════════════════════════════════════════
  // TEXT / CONTENT
  // ════════════════════════════════════════════════════════════════════════════

  word:            () => faker.lorem.word(),
  words:           (count = 3) => faker.lorem.words(count),
  sentence:        () => faker.lorem.sentence(),
  sentences:       (count = 3) => faker.lorem.sentences(count),
  paragraph:       () => faker.lorem.paragraph(),
  /** Page / blog title */
  title:           () => faker.lorem.sentence({ min: 3, max: 6 }).replace(/\.$/, ""),
  /** Form description / textarea content */
  description:     (sentences = 2) => faker.lorem.sentences(sentences),
  /** Search keyword (single word) */
  searchKeyword:   () => faker.lorem.word(),
  /** Multi-word search query */
  searchQuery:     (words = 2) => faker.lorem.words(words),
  /** Comment / review text */
  comment:         () => faker.lorem.sentences(faker.number.int({ min: 1, max: 3 })),
  /** Tags array */
  tags:            (count = 3) => Array.from({ length: count }, () => faker.lorem.word()),

  // ════════════════════════════════════════════════════════════════════════════
  // COMPANY
  // ════════════════════════════════════════════════════════════════════════════

  companyName:     () => faker.company.name(),
  companySuffix:   () => faker.company.name().split(" ").pop() ?? "Inc",
  catchPhrase:     () => faker.company.catchPhrase(),
  industry:        () => faker.company.buzzNoun(),
  taxId:           () => `${faker.string.numeric(2)}-${faker.string.numeric(7)}`,

  // ════════════════════════════════════════════════════════════════════════════
  // IDENTIFIERS
  // ════════════════════════════════════════════════════════════════════════════

  uuid:            () => faker.string.uuid(),
  nanoid:          (size = 21) => faker.string.nanoid(size),
  /** Reference / ticket number e.g. "TKT-20240501-00042" */
  ticketNumber:    () =>
                     `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${faker.string.numeric(5)}`,
  /** Git-style short commit hash */
  commitHash:      () => faker.git.commitSha({ length: 7 }),

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  /** Pick a random item from an array */
  pick:            <T>(items: T[]): T => faker.helpers.arrayElement(items),
  /** Pick N unique items from an array */
  pickMany:        <T>(items: T[], count: number): T[] =>
                     faker.helpers.arrayElements(items, count),
  /** Shuffle an array (non-mutating) */
  shuffle:         <T>(items: T[]): T[] => faker.helpers.shuffle([...items]),
  /** Return true / false randomly (optional weight 0–1, default 0.5) */
  bool:            (weight = 0.5) => faker.datatype.boolean(weight),
  /** Pause helper — await dataUtils.wait(500) */
  wait:            (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};
