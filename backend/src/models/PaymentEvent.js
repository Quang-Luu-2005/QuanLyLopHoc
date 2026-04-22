const mongoose = require('mongoose');

const paymentEventSchema = new mongoose.Schema(
  {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    orderCode: { type: Number, default: null },
    eventType: { type: String, required: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    receivedAt: { type: Date, default: () => new Date() }
  },
  { timestamps: false }
);

paymentEventSchema.index({ paymentId: 1 });
paymentEventSchema.index({ orderCode: 1 });
paymentEventSchema.index({ receivedAt: -1 });
paymentEventSchema.index({ eventType: 1 });

module.exports = mongoose.model('PaymentEvent', paymentEventSchema);
