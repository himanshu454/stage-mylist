import { Schema, model, Document } from "mongoose";

export interface IMovie extends Document {
  title: string;
  genres: string[];
  description?: string;
  releaseDate?: Date;
  director?: string;
  actors?: string[];
  durationMinutes?: number;
  posterUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MovieSchema = new Schema<IMovie>(
  {
    title: { type: String, required: true },
    genres: { type: [String], default: [] },
    posterUrl: { type: String },
    description: { type: String },
    releaseDate: { type: Date },
    director: { type: String },
    actors: { type: [String], default: [] },
    durationMinutes: { type: Number },
  },
  { timestamps: true },
);

export default model<IMovie>("Movie", MovieSchema);
