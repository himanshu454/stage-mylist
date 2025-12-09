import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  username: string;
  preferences?: {
    favoriteGenres?: string[];
    dislikedGenres?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

// create separate modle for watch history
/*
 watchHistory: Array<{
    contentId: string;
    watchedOn: Date;
    rating?: number;
14  }>

*/

const UserSchema = new Schema<IUser>(
  {
    firstName: { type: String },
    lastName: { type: String },
    username: { type: String, required: true, unique: true },
    preferences: {
      favoriteGenres: { type: [String], default: [] },
      dislikedGenres: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

export default model<IUser>("User", UserSchema);
