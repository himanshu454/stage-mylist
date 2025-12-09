// src/scripts/seed_mylist_items.ts
import mongoose from "mongoose";
import dotenv from "dotenv";
import { faker } from "@faker-js/faker";
dotenv.config();

// import models
import UserModel from "../models/user";
import MovieModel from "../models/movie";
import TVShowModel from "../models/tvShow";
import EpisodeModel from "../models/episode";
import MyListItemModel from "../models/myListItem";
import logger from "../utils/logger";

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ott_stage";
const BATCH_SIZE = 500;

/** Utility: pick random element */
function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Get ONE random user from DB */
async function getRandomUserId(): Promise<string> {
  const result = await UserModel.aggregate([{ $sample: { size: 1 } }]).project({
    _id: 1,
  });
  if (!result || result.length === 0) {
    throw new Error("No users found. Seed users first.");
  }
  return result[0]._id.toString();
}

/**
 * MyListItems only for ONE random user.
 * numItems = number of list documents to create.
 * allowEpisodeSaveProb = probability user saves specific episode when TV show chosen.
 */
export async function seedMyListItemsForOneUser(
  numItems: number,
  allowEpisodeSaveProb: number = 0.5,
) {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  // 1) Pick ONE random user
  const userId = await getRandomUserId();
  console.log("Selected Random User:", userId);

  // 2) Load required content lists
  const movies = await MovieModel.find(
    {},
    { _id: 1, title: 1, genres: 1, posterUrl: 1, description: 1 },
  )
    .lean()
    .exec();
  if (!movies.length) throw new Error("No movies found.");

  const shows = await TVShowModel.find(
    {},
    { _id: 1, title: 1, genres: 1, posterUrl: 1, description: 1 },
  )
    .lean()
    .exec();
  if (!shows.length) throw new Error("No TV shows found.");

  const allEpisodes = await EpisodeModel.find(
    {},
    { _id: 1, showId: 1, title: 1 },
  )
    .lean()
    .exec();

  // map showId → episode array
  const episodesByShow = new Map<string, any[]>();
  for (const ep of allEpisodes) {
    const sid = ep.showId.toString();
    if (!episodesByShow.has(sid)) episodesByShow.set(sid, []);
    episodesByShow.get(sid)!.push(ep);
  }

  console.log("Loaded content. Starting generation...");

  // 3) Insert in batches
  let attempted = 0;
  let insertedTotal = 0;
  let duplicatesTotal = 0;

  for (let offset = 0; offset < numItems; offset += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, numItems - offset);
    const batch: any[] = [];

    for (let i = 0; i < batchSize; i++) {
      attempted++;

      // random: movie (60%) or tvshow (40%)
      const isMovie = Math.random() < 0.6;

      if (isMovie) {
        const movie = pick(movies);
        batch.push({
          userId: new mongoose.Types.ObjectId(userId),
          contentType: "movie",
          contentId: movie._id,
          episodeId: undefined,
          addedAt: faker.date.recent({ days: 90 }),
          snapshot: {
            title: movie.title,
            posterUrl: movie.posterUrl ?? "",
            genres: movie.genres ?? [],
            shortDescription: movie.description ?? "",
          },
          contentVisibility: "available",
        });
      } else {
        const show = pick(shows);
        const episodeList = episodesByShow.get(show._id.toString()) ?? [];

        let ep = undefined;
        if (episodeList.length > 0 && Math.random() < allowEpisodeSaveProb) {
          ep = pick(episodeList);
        }

        batch.push({
          userId: new mongoose.Types.ObjectId(userId),
          contentType: "tvshow",
          contentId: show._id,
          episodeId: ep ? ep._id : undefined,
          addedAt: faker.date.recent({ days: 90 }),
          snapshot: {
            title: show.title,
            posterUrl: show.posterUrl ?? "",
            genres: show.genres ?? [],
            shortDescription: show.description ?? "",
          },
          contentVisibility: "available",
        });
      }
    }

    // 4) InsertMany with ordered: false
    try {
      const res = await MyListItemModel.insertMany(batch, { ordered: false });
      insertedTotal += res.length;
      console.log(`Batch inserted: ${res.length}/${batch.length}`);
    } catch (err: any) {
      // estimate duplicates
      if (err?.result?.nInserted != null) {
        const ins = err.result.nInserted;
        insertedTotal += ins;
        duplicatesTotal += batch.length - ins;
        console.warn(
          `Batch error: inserted ${ins}, duplicates ${batch.length - ins}`,
        );
      } else if (Array.isArray(err.writeErrors)) {
        let dupCount = 0;
        for (const we of err.writeErrors) {
          if (we.code === 11000) dupCount++;
        }
        const succeeded = batch.length - err.writeErrors.length;
        insertedTotal += succeeded;
        duplicatesTotal += dupCount;
        console.warn(
          `Batch error: inserted ${succeeded}, duplicates approx ${dupCount}`,
        );
      } else {
        console.error("Unexpected insert error:", err);
      }
    }
  }

  console.log("✔ MyList seeding (one user) complete");
  console.log("Attempted:", attempted);
  console.log("Inserted:", insertedTotal);
  console.log("Duplicates:", duplicatesTotal);

  await mongoose.disconnect();
  console.log("Disconnected.");
}

// CLI support
if (require.main === module) {
  const num = Number(process.argv[2] ?? 1000);
  seedMyListItemsForOneUser(num).catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}

// run using below command (adjust path as needed):
// ts-node src/scripts/seed_myListItems.ts 5000
