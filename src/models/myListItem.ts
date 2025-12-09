import { Schema, model, Document } from "mongoose";
import { Types } from "mongoose";

export interface IMyListItem extends Document {
  userId: Types.ObjectId;
  // contentId points to either Movies or TVShows collection
  contentId: Types.ObjectId;
  contentType: "movie" | "tvshow";
  // optional: if user saved a specific episode
  episodeId?: Types.ObjectId;
  addedAt: Date;
  // denormalized snapshot of content details at time of addition
  // to avoid extra joins and for historical accuracy
  snapshot: {
    title: string;
    posterUrl?: string;
    genres?: string[];
    shortDescription?: string;
  };
  // indicates platform-level availability (soft delete)
  contentVisibility?: "available" | "unavailable" | "removed";
}

const MyListItemSchema = new Schema<IMyListItem>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    contentType: { type: String, required: true, enum: ["movie", "tvshow"] },
    // polymorphic ref: refer to Movies or TVShows depending on contentType
    contentId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "contentType",
    },
    episodeId: { type: Schema.Types.ObjectId, required: false },
    addedAt: { type: Date, default: () => new Date(), index: true },
    snapshot: {
      title: { type: String, required: true },
      posterUrl: String,
      genres: [String],
      shortDescription: String,
    },
    contentVisibility: {
      type: String,
      enum: ["available", "unavailable", "removed"],
      default: "available",
    },
  },
  { timestamps: true },
);

// prevent duplicates: a user cannot save same contentRef twice in same list
MyListItemSchema.index({ userId: 1, contentId: 1 }, { unique: true });
MyListItemSchema.index({ userId: 1, addedAt: -1, _id: -1 });

export default model<IMyListItem>("MyListItem", MyListItemSchema);
