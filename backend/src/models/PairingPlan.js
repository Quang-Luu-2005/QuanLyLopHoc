const mongoose = require('mongoose');

const pairingPlayerSchema = new mongoose.Schema(
  {
    playerId: { type: String, default: null },
    submissionId: { type: String, default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: null },
    ingame: { type: String, default: null },
    rank: { type: String, default: null },
    paymentRequired: { type: Boolean, default: false },
    priority: { type: Boolean, default: false }
  },
  { _id: false }
);

const pairingItemSchema = new mongoose.Schema(
  {
    pairId: { type: String, required: true, trim: true },
    pairNo: { type: Number, required: true },
    rank: { type: String, default: null },
    a: { type: pairingPlayerSchema, required: true },
    b: { type: pairingPlayerSchema, required: true }
  },
  { _id: false }
);

const pairingPlanSchema = new mongoose.Schema(
  {
    weekKey: { type: String, required: true, trim: true },
    eventDate: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ['DRAFT', 'SENT'], default: 'DRAFT' },
    sentAt: { type: Date, default: null },
    pairs: { type: [pairingItemSchema], default: [] }
  },
  { timestamps: true }
);

pairingPlanSchema.index({ weekKey: 1, eventDate: 1 }, { unique: true });

module.exports = mongoose.model('PairingPlan', pairingPlanSchema);
