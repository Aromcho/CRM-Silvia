import { Schema, model } from 'mongoose';

const activitySchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'property_created', 'property_updated', 'property_synced',
        'property_status_changed', 'lead_created', 'lead_updated',
        'lead_status_changed', 'lead_assigned', 'user_login', 'sync_completed', 'rentals_imported',
      ],
      required: true,
      index: true,
    },
    description: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userName: String,
    userEmail: String,
    entityId: String,
    entityType: { type: String, enum: ['property', 'lead', 'user', 'system'], index: true },
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export default model('Activity', activitySchema);
