const mongoose = require('mongoose');

const weeklyPrioritySchema = new mongoose.Schema(
  {
    weekKey: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    priority: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

weeklyPrioritySchema.index({ weekKey: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyPriority', weeklyPrioritySchema);
