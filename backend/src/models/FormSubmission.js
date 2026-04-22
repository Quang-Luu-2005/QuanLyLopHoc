const mongoose = require('mongoose');

const formSubmissionSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    submittedAt: { type: Date, required: true },
    weekKey: { type: String, default: null },
    sourceSheetRow: { type: Number, default: null },
    sourceSheetName: { type: String, default: null },
    availableDateIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PlayDate' }]
  },
  { timestamps: true }
);

// Unique on (sourceSheetName, sourceSheetRow) only when both are set
formSubmissionSchema.index(
  { sourceSheetName: 1, sourceSheetRow: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceSheetName: { $type: 'string' },
      sourceSheetRow: { $type: 'number' }
    }
  }
);

formSubmissionSchema.index({ weekKey: 1 });
formSubmissionSchema.index({ playerId: 1, weekKey: 1 });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);
