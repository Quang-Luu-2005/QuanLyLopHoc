const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FormSubmission', default: null },
    weekKey: { type: Date, default: null },
    eventDate: { type: Date, default: null },
    orderCode: { type: Number, required: true, unique: true },
    paymentCode: { type: String, default: null },
    paymentLinkId: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    qrCode: { type: String, default: null },
    amount: { type: Number, required: true },
    paidAmount: { type: Number, default: null },
    paymentStatus: { type: String, default: 'pending' },
    paymentRef: { type: String, default: null },
    paidContent: { type: String, default: null },
    needPayment: { type: Boolean, default: true },
    groupLink: { type: String, default: null },
    supportMessage: { type: String, default: null },
    paidAt: { type: Date, default: null },
    groupMailSentAt: { type: Date, default: null },
    lastMailAt: { type: Date, default: null },
    lastError: { type: String, default: null }
  },
  { timestamps: true }
);

paymentSchema.index({ playerId: 1 });
paymentSchema.index({ submissionId: 1 });
paymentSchema.index({ paymentStatus: 1 });
paymentSchema.index({ weekKey: 1 });
paymentSchema.index({ eventDate: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ paidAt: -1 });
paymentSchema.index({ paymentLinkId: 1 }, { sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
