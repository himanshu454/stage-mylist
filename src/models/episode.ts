import { Schema, model, Types } from "mongoose";

export interface IEpisode {
  showId: Types.ObjectId;
  season: number;
  episodeNumber: number;
  title: string;
  durationMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const EpisodeSchema = new Schema(
  {
    showId: { type: Types.ObjectId, ref: "TVShow", required: true },
    season: Number,
    episodeNumber: Number,
    title: String,
    durationMinutes: Number,
  },
  { timestamps: true },
);

export default model<IEpisode>("Episode", EpisodeSchema);
