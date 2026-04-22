const mongoose = require('mongoose');

const selectionCountLogSchema = new mongoose.Schema(
  {
    weekKey: { type: String, required: true },
    eventDate: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: null },
    ingame: { type: String, default: null },
    rank: { type: String, default: null },
    source: { type: String, default: null }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

selectionCountLogSchema.index({ weekKey: 1, eventDate: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('SelectionCountLog', selectionCountLogSchema);
