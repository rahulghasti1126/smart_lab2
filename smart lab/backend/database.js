import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend folder
dotenv.config({ path: resolve(__dirname, '.env') });

/* =========================================================
   PASSWORD HASHING
   ========================================================= */

/**
 * Passwords are deliberately hashed with bcrypt.  The SHA-256 helper below is
 * kept only to migrate accounts created by versions of Smart Lab prior to
 * bcrypt; new passwords are never stored using it.
 */
const hashPassword = (password) => bcrypt.hash(String(password), 12);
const legacySha256 = (password) => crypto.createHash('sha256').update(String(password)).digest('hex');
const isLegacyPasswordHash = (hash) => /^[a-f0-9]{64}$/i.test(String(hash || ''));

const verifyPassword = async (password, passwordHash) => {
  if (isLegacyPasswordHash(passwordHash)) {
    return { valid: legacySha256(password) === passwordHash, needsUpgrade: true };
  }
  return { valid: await bcrypt.compare(String(password), String(passwordHash || '')), needsUpgrade: false };
};

/* =========================================================
   MONGODB CONFIGURATION
   ========================================================= */

const MONGO_URI = process.env.MONGO_URI?.trim();

if (!MONGO_URI) {
  console.error('MONGO_URI environment variable is missing. Database features are unavailable until it is configured.');
}

/* =========================================================
   DATABASE CONNECTION
   ========================================================= */

const connectDB = async () => {
  if (!MONGO_URI) throw new Error('MONGO_URI environment variable is missing.');
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
      connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10000,
    });

    console.log('Connected to MongoDB.');

    await seedInitialData();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
};

/* =========================================================
   COMMON OPTIONS
   ========================================================= */

const baseOptions = {
  versionKey: false,
};

/* =========================================================
   USER SCHEMA
   ========================================================= */

const UserSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
    },

    password_hash: {
      type: String,
    },

    name: {
      type: String,
    },

    role: {
      type: String,
      enum: ['admin', 'pathologist', 'technician'],
      default: 'technician',
    },

    created_at: {
      type: String,
    },
  },
  baseOptions
);

/* =========================================================
   PATIENT SCHEMA
   ========================================================= */

const PatientSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    name: {
      type: String,
    },

    age: {
      type: Number,
    },

    gender: {
      type: String,
    },

    phone: {
      type: String,
    },

    email: {
      type: String,
    },

    doctor: {
      type: String,
    },

    dob: {
      type: String,
    },

    address: {
      type: String,
    },

    date: {
      type: String,
    },

    status: {
      type: String,
      default: 'pending',
    },
  },
  baseOptions
);

/* =========================================================
   SAMPLE SCHEMA
   ========================================================= */

const SampleSchema = new mongoose.Schema(
  {
    sample_id: {
      type: String,
      required: true,
      unique: true,
    },
    patient_id: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: 'REGISTERED',
    },
    collection_date: {
      type: String,
    },
    analyzer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalyzerConfig',
    },
    tests: {
      type: [String],
      default: [],
    },
  },
  baseOptions
);

/* =========================================================
   TEST SCHEMA
   ========================================================= */

const TestSchema = new mongoose.Schema(
  {
    test_id: {
      type: String,
      required: true,
      unique: true,
    },
    sample_id: {
      type: String,
      required: true,
    },
    patient_id: {
      type: String,
      required: true,
    },
    test_name: {
      type: String,
      required: true,
    },
    test_code: {
      type: String,
      default: '',
    },
    reference_range: {
      type: String,
      default: '',
    },
    analyzer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalyzerConfig',
    },
    status: {
      type: String,
      default: 'ASSIGNED',
    },
    assigned_date: {
      type: String,
    },
  },
  baseOptions
);

/* =========================================================
   RESULT SCHEMA
   ========================================================= */

const ResultSchema = new mongoose.Schema(
  {
    patient_id: {
      type: String,
    },

    sample_id: {
      type: String,
    },

    test_name: {
      type: String,
    },

    test_code: {
      type: String,
      default: '',
    },

    result_value: {
      type: String,
    },

    unit: {
      type: String,
    },

    reference_range: {
      type: String,
    },

    machine_name: {
      type: String,
    },

    status: {
      type: String,
    },

    date: {
      type: String,
    },

    raw_data: {
      type: String,
    },
    analyzer_result_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalyzerResult',
    },
  },
  baseOptions
);

/* =========================================================
   ANALYZER CONFIGURATION SCHEMA
   ========================================================= */

const AnalyzerConfigSchema = new mongoose.Schema(
  {
    analyzer_id: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
    },

    model: {
      type: String,
      default: '',
    },

    manufacturer: {
      type: String,
      default: '',
    },

    category: {
      type: String,
      default: '',
    },

    ip_address: {
      type: String,
      default: '',
    },

    server_ip: {
      type: String,
      default: '',
    },

    port: {
      type: Number,
    },

    connection_type: {
      type: String,
      enum: ['ETHERNET', 'WIFI', 'NETWORK', 'RS232', 'SERIAL', 'USB_SERIAL', 'USB'],
      default: 'NETWORK',
    },

    serial_port: {
      type: String,
      default: '',
    },
    
    baud_rate: {
      type: Number,
      default: 9600,
    },

    data_bits: { type: Number, default: 8 },
    stop_bits: { type: Number, default: 1 },
    parity: { type: String, default: 'none' },
    flow_control: { type: String, default: 'none' },
    server_port: { type: Number },

    tcp_mode: {
      type: String,
      default: 'CLIENT',
    },

    protocol: {
      type: String,
      required: true,
    },

    protocol_options: { type: mongoose.Schema.Types.Mixed, default: {} },
    remote_control_supported: { type: Boolean, default: false },

    auto_connect: {
      type: Boolean,
      default: false,
    },

    auto_receive: {
      type: Boolean,
      default: true,
    },

    timeout: {
      type: Number,
      default: 30000,
    },

    reconnect_interval: {
      type: Number,
      default: 5000,
    },

    enabled: {
      type: Boolean,
      default: false,
    },

    connection_status: {
      type: String,
      default: 'STOPPED',
    },

    created_at: {
      type: String,
      default: () => new Date().toISOString(),
    },

    updated_at: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  baseOptions
);

/* =========================================================
   ANALYZER MESSAGE SCHEMA
   ========================================================= */

const AnalyzerMessageSchema = new mongoose.Schema(
  {
    analyzer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalyzerConfig',
      required: true,
    },

    analyzer_name: {
      type: String,
    },

    analyzer_ip: {
      type: String,
    },

    source: {
      type: String,
    },

    connection_at: {
      type: String,
    },

    raw_message: {
      type: String,
      required: true,
    },

    raw_escaped: {
      type: String,
      required: true,
    },

    raw_byte_length: {
      type: Number,
      required: true,
    },

    message_hash: {
      type: String,
      required: true,
      index: true,
    },

    received_at: {
      type: String,
      required: true,
    },

    processing_status: {
      type: String,
    },

    error: {
      type: String,
    },
  },
  baseOptions
);

/* =========================================================
   ANALYZER RESULT SCHEMA
   ========================================================= */

const AnalyzerResultSchema = new mongoose.Schema(
  {
    message_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalyzerMessage',
      required: true,
    },

    analyzer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalyzerConfig',
      required: true,
    },

    analyzer_name: {
      type: String,
    },

    sample_id: {
      type: String,
    },

    barcode: {
      type: String,
    },

    order_id: {
      type: String,
    },

    patient_id: {
      type: String,
    },

    test_order_id: {
      type: String,
    },

    parameters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    normalized_results: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    reviewed_parameters: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },

    received_at: {
      type: String,
    },

    processing_status: {
      type: String,
    },

    match_status: { type: String, default: 'UNMATCHED' },
    matched_sample_id: { type: String, default: '' },

    review_reason: {
      type: String,
    },

    created_at: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  baseOptions
);

/* =========================================================
   REAGENT SCHEMA
   ========================================================= */

const ReagentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },

    machine: {
      type: String,
    },
    manufacturer: { type: String, default: '' },
    lot_number: { type: String, default: '' },
    analyzer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AnalyzerConfig' },
    storage_location: { type: String, default: '' },
    status: { type: String, default: 'ACTIVE' },
    usage_history: { type: [mongoose.Schema.Types.Mixed], default: [] },

    stock: {
      type: Number,
    },

    unit: {
      type: String,
    },

    expiry: {
      type: String,
    },

    threshold: {
      type: Number,
      default: 20,
    },
  },
  baseOptions
);

/* =========================================================
   REPORT SCHEMA
   ========================================================= */

const ReportSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    patient_id: {
      type: String,
    },

    report_type: {
      type: String,
    },

    status: {
      type: String,
    },
    revision: { type: Number, default: 1 },
    previous_report_id: { type: String, default: '' },
    approval: {
      pathologist_id: { type: String, default: '' },
      pathologist_name: { type: String, default: '' },
      signed_at: { type: String, default: '' },
      comment: { type: String, default: '' },
    },

    generated_at: {
      type: String,
    },

    verified_at: {
      type: String,
    },

    distributed_at: {
      type: String,
    },

    findings: {
      type: String,
    },

    doctor_notes: {
      type: String,
    },

    machine_parameters: {
      type: [mongoose.Schema.Types.Mixed],
      default: undefined,
    },

    source_analyzer_result_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalyzerResult',
      default: undefined,
    },
  },
  baseOptions
);

/* =========================================================
   INVOICE SCHEMA
   ========================================================= */

const InvoiceSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    patient_id: {
      type: String,
    },

    amount: {
      type: Number,
    },

    discount: {
      type: Number,
    },

    status: {
      type: String,
    },

    payment_method: {
      type: String,
    },

    date: {
      type: String,
    },

    items: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  baseOptions
);

/* =========================================================
   LAB SETTINGS SCHEMA
   ========================================================= */

const LabSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },

    payment_qr: {
      type: String,
    },
  },
  baseOptions
);

/* =========================================================
   AUDIT LOG SCHEMA
   ========================================================= */

const AuditLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
    },

    subject: {
      type: String,
    },

    actor: {
      type: String,
    },

    timestamp: {
      type: String,
    },

    details: {
      type: String,
    },
    action: { type: String },
    entity: { type: String },
    entity_id: { type: String },
    role: { type: String },
    ip_address: { type: String },
    old_value: { type: mongoose.Schema.Types.Mixed },
    new_value: { type: mongoose.Schema.Types.Mixed },
  },
  baseOptions
);

// Query indexes used by patient/sample matching and live communication views.
SampleSchema.index({ sample_id: 1 }, { unique: true });
SampleSchema.index({ patient_id: 1, status: 1 });
ResultSchema.index({ sample_id: 1, test_code: 1 });
AnalyzerMessageSchema.index({ analyzer_id: 1, received_at: -1 });
AnalyzerResultSchema.index({ sample_id: 1, received_at: -1 });
AuditLogSchema.index({ timestamp: -1 });

/* =========================================================
   MONGOOSE MODELS
   ========================================================= */

const User =
  mongoose.models.User ||
  mongoose.model('User', UserSchema);

const Patient =
  mongoose.models.Patient ||
  mongoose.model('Patient', PatientSchema);

const Sample =
  mongoose.models.Sample ||
  mongoose.model('Sample', SampleSchema);

const Test =
  mongoose.models.Test ||
  mongoose.model('Test', TestSchema);

const Result =
  mongoose.models.Result ||
  mongoose.model('Result', ResultSchema);

const AnalyzerConfig =
  mongoose.models.AnalyzerConfig ||
  mongoose.model('AnalyzerConfig', AnalyzerConfigSchema);

const AnalyzerMessage =
  mongoose.models.AnalyzerMessage ||
  mongoose.model('AnalyzerMessage', AnalyzerMessageSchema);

const AnalyzerResult =
  mongoose.models.AnalyzerResult ||
  mongoose.model('AnalyzerResult', AnalyzerResultSchema);

const Reagent =
  mongoose.models.Reagent ||
  mongoose.model('Reagent', ReagentSchema);

const Report =
  mongoose.models.Report ||
  mongoose.model('Report', ReportSchema);

const Invoice =
  mongoose.models.Invoice ||
  mongoose.model('Invoice', InvoiceSchema);

const LabSettings =
  mongoose.models.LabSettings ||
  mongoose.model('LabSettings', LabSettingsSchema);

const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model('AuditLog', AuditLogSchema);

/* =========================================================
   INITIAL DATA SEED
   ========================================================= */

const seedInitialData = async () => {
  try {
    /* -----------------------------------------------------
       ADMIN USER
       ----------------------------------------------------- */

    const adminUser = await User.findOne({ username: process.env.ADMIN_INITIAL_USERNAME || 'admin' });
    const initialAdminPassword = process.env.ADMIN_INITIAL_PASSWORD;
    if (!adminUser && initialAdminPassword) {
      await User.create({
        id: 'U1',
        username: process.env.ADMIN_INITIAL_USERNAME || 'admin',
        password_hash: await hashPassword(initialAdminPassword),
        role: 'admin',
        name: process.env.ADMIN_INITIAL_NAME || 'Laboratory Administrator',
        created_at: new Date().toISOString(),
      });

      console.log('Admin user created.');
    }

    /* -----------------------------------------------------
       REAGENT SEED DATA
       ----------------------------------------------------- */

    const reagentSeeds = [
      {
        name: 'CBC Reagent Pack',
        machine: 'Hematology Analyzer',
        stock: 15,
        unit: '%',
        expiry: '2026-12-01',
        threshold: 20,
      },

      {
        name: 'Glucose Reagent',
        machine: 'Biochemistry Analyzer',
        stock: 85,
        unit: '%',
        expiry: '2027-05-15',
        threshold: 20,
      },

      {
        name: 'Lipid Panel',
        machine: 'Biochemistry Analyzer',
        stock: 45,
        unit: '%',
        expiry: '2026-10-20',
        threshold: 20,
      },

      {
        name: 'Wash Buffer',
        machine: 'All Analyzers',
        stock: 10,
        unit: '%',
        expiry: '2026-08-30',
        threshold: 20,
      },
    ];

    if (process.env.SEED_DEMO_DATA !== 'true') return;
    for (const seed of reagentSeeds) {
      const existing = await Reagent.findOne({
        name: seed.name,
      });

      if (!existing) {
        await Reagent.create(seed);
      }
    }

    console.log('Initial data seed completed.');
  } catch (err) {
    console.error(
      'Initial data seed error:',
      err.message
    );
  }
};

/* =========================================================
   EXPORTS
   ========================================================= */

export {
  connectDB,
  hashPassword,
  verifyPassword,
  isLegacyPasswordHash,
  User,
  Patient,
  Sample,
  Test,
  Result,
  AnalyzerConfig,
  AnalyzerMessage,
  AnalyzerResult,
  Reagent,
  Report,
  Invoice,
  LabSettings,
  AuditLog,
};
