import { Schema, model } from "mongoose";

export interface ITVShow {
  title: string;
  genres: string[];
  description?: string;
  seasons?: number;
  posterUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TVShowSchema = new Schema(
  {
    title: { type: String, required: true },
    genres: [String],
    posterUrl: String,
    description: String,
    seasons: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true },
);

export default model<ITVShow>("TVShow", TVShowSchema);
