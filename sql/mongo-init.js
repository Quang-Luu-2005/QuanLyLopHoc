/*
 * MongoDB bootstrap indexes for QuanLyLopHoc.
 * Run with:
 *   mongosh "<MONGO_URI>" --file sql/mongo-init.js
 */

const dbName = process.env.MONGO_DB_NAME || "tournament_app";
const target = db.getSiblingDB(dbName);

// players
target.players.createIndex({ email: 1 }, { unique: true });

// form submissions
target.formsubmissions.createIndex(
  { sourceSheetName: 1, sourceSheetRow: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceSheetName: { $type: "string" },
      sourceSheetRow: { $type: "number" }
    }
  }
);
target.formsubmissions.createIndex({ weekKey: 1 });
target.formsubmissions.createIndex({ playerId: 1, weekKey: 1 });

// play dates
target.playdates.createIndex({ playDate: 1 }, { unique: true });

// selection counts
target.selectioncountlogs.createIndex(
  { weekKey: 1, eventDate: 1, email: 1 },
  { unique: true }
);

// weekly priorities
target.weeklypriorities.createIndex(
  { weekKey: 1, email: 1 },
  { unique: true }
);

// payments
target.payments.createIndex({ orderCode: 1 }, { unique: true });
target.payments.createIndex({ paymentLinkId: 1 }, { sparse: true });
target.payments.createIndex({ playerId: 1 });
target.payments.createIndex({ submissionId: 1 });
target.payments.createIndex({ paymentStatus: 1 });
target.payments.createIndex({ weekKey: 1 });
target.payments.createIndex({ eventDate: 1 });
target.payments.createIndex({ createdAt: -1 });
target.payments.createIndex({ paidAt: -1 });

// payment events
target.paymentevents.createIndex({ paymentId: 1 });
target.paymentevents.createIndex({ orderCode: 1 });
target.paymentevents.createIndex({ receivedAt: -1 });
target.paymentevents.createIndex({ eventType: 1 });

print(`MongoDB indexes ensured for database: ${dbName}`);
