// src/scripts/seed.ts
import mongoose from "mongoose";
import { faker } from "@faker-js/faker";
import dotenv from "dotenv";
dotenv.config();

// import models
import UserModel from "../models/user";
import MovieModel from "../models/movie";
import TVShowModel from "../models/tvShow";
import EpisodeModel from "../models/episode";

// Config
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ott_stage";
const NUM_USERS = 10;
const NUM_MOVIES = 1000;
const NUM_TVSHOWS = 500;
const MIN_EPISODES = 1;
const MAX_EPISODES = 8;

// Batch sizes for insertMany
const MOVIE_BATCH = 200;
const TVSHOW_BATCH = 100;
const EPISODE_BATCH = 500;

async function connect() {
  await mongoose.connect(MONGO_URI, {
    // pass options here if needed
  });
  console.log("Connected to MongoDB:", MONGO_URI);
}

/**
 * Utility to generate a short set of genres
 */
function sampleGenres() {
  const pool = [
    "Action",
    "Comedy",
    "Drama",
    "Fantasy",
    "Horror",
    "Romance",
    "SciFi",
  ];
  // pick 1-3 genres
  const count = faker.number.int({ min: 1, max: 3 });
  return faker.helpers.arrayElements(pool, count);
}

async function seedUsers() {
  console.log("Seeding users...");
  const users: any[] = [];
  for (let i = 0; i < NUM_USERS; i++) {
    users.push({
      username: faker.internet.username().toLowerCase() + (i + 1), // ensure uniqueness
      preferences: {
        favoriteGenres: sampleGenres(),
        dislikedGenres: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  // wipe and insert
  await UserModel.deleteMany({});
  const inserted = await UserModel.insertMany(users);
  console.log(`Inserted ${inserted.length} users`);
  return inserted;
}

async function seedMovies() {
  console.log("Seeding movies...");
  await MovieModel.deleteMany({});
  const allMovies: any[] = [];
  for (let i = 0; i < NUM_MOVIES; i++) {
    const title = faker.lorem.words(faker.number.int({ min: 1, max: 4 }));
    allMovies.push({
      title: `${title} ${i + 1}`,
      description: faker.lorem.sentences(2),
      genres: sampleGenres(),
      posterUrl: faker.image.urlPicsumPhotos({ width: 300, height: 450 }),
      releaseDate: faker.date.past({ years: 20 }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // insert in batches
  let insertedCount = 0;
  for (let i = 0; i < allMovies.length; i += MOVIE_BATCH) {
    const batch = allMovies.slice(i, i + MOVIE_BATCH);
    const res = await MovieModel.insertMany(batch);
    insertedCount += res.length;
    console.log(`Inserted movies: ${insertedCount}/${NUM_MOVIES}`);
  }
  return insertedCount;
}

async function seedTVShowsAndEpisodes() {
  console.log("Seeding TV shows and episodes...");
  await TVShowModel.deleteMany({});
  await EpisodeModel.deleteMany({});

  const allShows: any[] = [];
  for (let i = 0; i < NUM_TVSHOWS; i++) {
    const title = faker.lorem.words(faker.number.int({ min: 1, max: 4 }));
    allShows.push({
      title: `${title} Series ${i + 1}`,
      description: faker.lorem.sentences(2),
      genres: sampleGenres(),
      posterUrl: faker.image.urlPicsumPhotos({ width: 300, height: 450 }),
      seasons: faker.number.int({ min: 1, max: 8 }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Insert TV shows in batches and create episodes for each inserted show
  let insertedShowsCount = 0;
  let totalEpisodes = 0;
  for (let i = 0; i < allShows.length; i += TVSHOW_BATCH) {
    const batch = allShows.slice(i, i + TVSHOW_BATCH);
    const insertedShows = await TVShowModel.insertMany(batch);
    insertedShowsCount += insertedShows.length;
    console.log(`Inserted TV shows: ${insertedShowsCount}/${NUM_TVSHOWS}`);

    // For each inserted show, create between MIN_EPISODES and MAX_EPISODES episodes
    const episodeDocs: any[] = [];
    insertedShows.forEach((showDoc) => {
      const numEpisodes = faker.number.int({
        min: MIN_EPISODES,
        max: MAX_EPISODES,
      });
      for (let e = 0; e < numEpisodes; e++) {
        episodeDocs.push({
          showId: showDoc._id, // adjust field name to your Episode schema
          season: 1,
          episodeNumber: e + 1,
          title: `S1E${e + 1} - ${faker.lorem.words(3)}`,
          durationMinutes: faker.number.int({ min: 18, max: 60 }),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        totalEpisodes++;
      }
    });

    // insert episodes in batches if large
    for (let j = 0; j < episodeDocs.length; j += EPISODE_BATCH) {
      const chunk = episodeDocs.slice(j, j + EPISODE_BATCH);
      await EpisodeModel.insertMany(chunk);
      console.log(
        `Inserted episodes chunk (show batch ${i / TVSHOW_BATCH + 1}) - chunk size ${chunk.length}`,
      );
    }
  }

  console.log(`Inserted total episodes: ${totalEpisodes}`);
  return { shows: insertedShowsCount, episodes: totalEpisodes };
}

async function main() {
  try {
    await connect();

    const users = await seedUsers();
    await seedMovies();
    const tvResp = await seedTVShowsAndEpisodes();

    console.log("Seeding complete.");
    console.log(`Users: ${users.length}`);
    console.log(`TV Shows: ${tvResp.shows}, Episodes: ${tvResp.episodes}`);
    // keep connection open briefly to ensure all writes persisted
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  } catch (err) {
    console.error("Seed failed", err);
    process.exit(1);
  }
}

main();
