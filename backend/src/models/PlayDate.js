const mongoose = require('mongoose');

const playDateSchema = new mongoose.Schema(
  {
    playDate: { type: Date, required: true, unique: true }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = mongoose.model('PlayDate', playDateSchema);
