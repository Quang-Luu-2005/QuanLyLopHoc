const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ingameName: { type: String, required: true, trim: true },
    zaloPhone: { type: String, trim: true, default: null },
    isStudent: { type: Boolean, required: true, default: false },
    highestRank: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Player', playerSchema);
