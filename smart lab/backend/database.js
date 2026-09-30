import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI?.trim();

if (!MONGO_URI) {
  console.error('MONGO_URI environment variable is missing.');
  process.exit(1);
}

console.log('MongoDB URI detected:', MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB.');
    await seedInitialData();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

const baseOptions = { versionKey: false };

// Done
const UserSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password_hash: String,
    name: String,
    role: { type: String, default: 'technician' },
    created_at: String,
  },
  baseOptions
);



const PatientSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: String,
    age: Number,
    gender: String,
    phone: String,
    email: String,
    doctor: String,
    test_type: String,
    machine: String,
    date: String,
    status: { type: String, default: 'pending' },
  },
  baseOptions
);

const ResultSchema = new mongoose.Schema(
  {
    patient_id: String,
    test_name: String,
    result_value: String,
    unit: String,
    reference_range: String,
    machine_name: String,
    status: String,
    date: String,
    raw_data: String,
  },
  baseOptions
);

const AnalyzerConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    model: { type: String, default: '' },
    ip_address: { type: String, required: true },
    server_ip: { type: String, required: true },
    port: { type: Number, required: true },
    connection_type: { type: String, default: 'NETWORK' },
    tcp_mode: { type: String, default: 'CLIENT' },
    protocol: { type: String, required: true },
    auto_connect: { type: Boolean, default: false },
    auto_receive: { type: Boolean, default: true },
    enabled: { type: Boolean, default: false },
    connection_status: { type: String, default: 'STOPPED' },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  baseOptions
);

const AnalyzerMessageSchema = new mongoose.Schema(
  {
    analyzer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AnalyzerConfig', required: true },
    analyzer_name: String,
    analyzer_ip: String,
    source: String,
    connection_at: String,
    raw_message: { type: String, required: true },
    raw_escaped: { type: String, required: true },
    raw_byte_length: { type: Number, required: true },
    message_hash: { type: String, required: true, index: true },
    received_at: { type: String, required: true },
    processing_status: String,
    error: String,
  },
  baseOptions
);

const AnalyzerResultSchema = new mongoose.Schema(
  {
    message_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AnalyzerMessage', required: true },
    analyzer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AnalyzerConfig', required: true },
    analyzer_name: String,
    sample_id: String,
    barcode: String,
    order_id: String,
    patient_id: String,
    test_order_id: String,
    parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
    received_at: String,
    processing_status: String,
    review_reason: String,
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  baseOptions
);

const ReagentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    machine: String,
    stock: Number,
    unit: String,
    expiry: String,
    threshold: { type: Number, default: 20 },
  },
  baseOptions
);

const ReportSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    patient_id: String,
    report_type: String,
    status: String,
    generated_at: String,
    verified_at: String,
    distributed_at: String,
    findings: String,
    doctor_notes: String,
  },
  baseOptions
);

const InvoiceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    patient_id: String,
    amount: Number,
    discount: Number,
    status: String,
    payment_method: String,
    date: String,
    items: mongoose.Schema.Types.Mixed,
  },
  baseOptions
);

const LabSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    payment_qr: String,
  },
  baseOptions
);

const AuditLogSchema = new mongoose.Schema(
  {
    event: String,
    subject: String,
    actor: String,
    timestamp: String,
    details: String,
  },
  baseOptions
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Patient = mongoose.models.Patient || mongoose.model('Patient', PatientSchema);
const Result = mongoose.models.Result || mongoose.model('Result', ResultSchema);
const AnalyzerConfig = mongoose.models.AnalyzerConfig || mongoose.model('AnalyzerConfig', AnalyzerConfigSchema);
const AnalyzerMessage = mongoose.models.AnalyzerMessage || mongoose.model('AnalyzerMessage', AnalyzerMessageSchema);
const AnalyzerResult = mongoose.models.AnalyzerResult || mongoose.model('AnalyzerResult', AnalyzerResultSchema);
const Reagent = mongoose.models.Reagent || mongoose.model('Reagent', ReagentSchema);
const Report = mongoose.models.Report || mongoose.model('Report', ReportSchema);
const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
const LabSettings = mongoose.models.LabSettings || mongoose.model('LabSettings', LabSettingsSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);

const seedInitialData = async () => {
  try {
    const adminUser = await User.findOne({ username: 'admin' });
    if (!adminUser) {
      await User.create({
        id: 'U1',
        username: 'admin',
        password_hash: hashPassword('admin123'),
        name: 'Dr. Pathologist',
        role: 'admin',
        created_at: new Date().toISOString(),
      });
    }

    const rahulUser = await User.findOne({ username: 'rahul' });
    if (!rahulUser) {
      await User.create({
        id: 'U2',
        username: 'rahul',
        password_hash: hashPassword('1234'),
        name: 'Rahul Technician',
        role: 'technician',
        created_at: new Date().toISOString(),
      });
    }

    const reagentSeeds = [
      { name: 'CBC Reagent Pack', machine: 'Hematology Analyzer', stock: 15, unit: '%', expiry: '2026-12-01', threshold: 20 },
      { name: 'Glucose Reagent', machine: 'Biochemistry Analyzer', stock: 85, unit: '%', expiry: '2027-05-15', threshold: 20 },
      { name: 'Lipid Panel', machine: 'Biochemistry Analyzer', stock: 45, unit: '%', expiry: '2026-10-20', threshold: 20 },
      { name: 'Wash Buffer', machine: 'All Analyzers', stock: 10, unit: '%', expiry: '2026-08-30', threshold: 20 },
    ];

    for (const seed of reagentSeeds) {
      const existing = await Reagent.findOne({ name: seed.name });
      if (!existing) {
        await Reagent.create(seed);
      }
    }
  } catch (err) {
    console.error('Initial data seed error:', err.message);
  }
};

export {
  connectDB,
  hashPassword,
  User,
  Patient,
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
