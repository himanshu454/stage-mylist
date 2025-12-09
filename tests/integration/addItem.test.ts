/**
 * tests/integration/additem.test.ts
 *
 * Integration tests for "add item" endpoint using:
 * - mongodb-memory-server
 * - mongoose
 * - supertest
 * - jest (ts-jest)
 */

import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../../src/app";

import UserModel from "../../src/models/user";
import MovieModel from "../../src/models/movie";
import MyListItemModel from "../../src/models/myListItem";
import TvShowModel from "../../src/models/tvShow";
import EpisodeModel from "../../src/models/episode";

let mongoServer: MongoMemoryServer;

// Setup in-memory MongoDB server before all tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, { dbName: "test" });
});

// Clean up database after tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // clear DB between tests
  const models = mongoose.connection.models;
  await Promise.all(
    Object.keys(models).map((key) => models[key].deleteMany({})),
  );
});

/**
 * Helper to create seeded documents
 */
async function seedAll() {
  const user = await UserModel.create({
    firstName: "Test",
    lastName: "User",
    username: "testuser",
  });

  const movie = await MovieModel.create({
    title: "Test Movie",
    genres: ["Drama", "Action"],
    posterUrl: "http://example.com/poster.jpg",
    description: "A test movie",
    releaseDate: new Date(),
    director: "Jane Doe",
    actors: ["Actor One", "Actor Two"],
    durationMinutes: 120,
  });

  const tvshow = await TvShowModel.create({
    title: "Test Show",
    genres: ["Comedy"],
    posterUrl: "http://example.com/showposter.jpg",
    description: "A test TV show",
  });

  // create an episode that belongs to the tvshow
  const episode = await EpisodeModel.create({
    title: "S1E1",
    showId: tvshow._id,
    season: 1,
    episodeNumber: 1,
    durationMinutes: 60,
  });

  return { user, movie, tvshow, episode };
}

describe("POST /api/mylist/add", () => {
  test("adds a movie to user mylist and persists in DB (201)", async () => {
    const { user, movie } = await seedAll();

    const res = await request(app)
      .post("/api/mylist")
      .set("X-User-Id", user._id.toString())
      .send({
        contentType: "movie",
        contentId: movie._id.toString(),
        snapshot: {
          title: movie.title,
          posterUrl: movie.posterUrl,
        },
      })
      .expect(201);

    expect(res.body).toBeDefined();

    // Response assertions (adjust if your API returns different shape)
    expect(res.body.item.userId).toBe(user._id.toString());
    expect(res.body.item.contentType).toBe("movie");
    expect(res.body.item.contentId).toBe(movie._id.toString());

    // --- Strong DB verification ---
    const dbDoc = await MyListItemModel.findOne({
      userId: user._id,
      contentType: "movie",
      contentId: movie._id,
    }).lean();

    expect(dbDoc).not.toBeNull();
    // optional additional checks
    expect(dbDoc!.userId.toString()).toBe(user._id.toString());
    expect(dbDoc!.contentId.toString()).toBe(movie._id.toString());

    const count = await MyListItemModel.countDocuments({
      userId: user._id,
      contentId: movie._id,
    });
    expect(count).toBe(1);
  });

  test("returns 409 when adding duplicate item and DB still has single record", async () => {
    const { user, movie } = await seedAll();

    // First add
    await request(app)
      .post("/api/mylist")
      .set("X-User-Id", user._id.toString())
      .send({
        contentType: "movie",
        contentId: movie._id.toString(),
        snapshot: {
          title: movie.title,
          posterUrl: movie.posterUrl,
        },
      })
      .expect(201);

    // Duplicate add attempt - should return single count
    await request(app)
      .post("/api/mylist")
      .set("X-User-Id", user._id.toString())
      .send({
        contentType: "movie",
        contentId: movie._id.toString(),
        snapshot: {
          title: movie.title,
          posterUrl: movie.posterUrl,
        },
      })
      .expect(201);

    // Ensure only one document exists
    const count = await MyListItemModel.countDocuments({
      userId: user._id,
      contentId: movie._id,
    });
    expect(count).toBe(1);
  });

  test("returns 404 when user does not exist", async () => {
    const { movie } = await seedAll();
    const fakeUserId = new mongoose.Types.ObjectId().toString();

    await request(app)
      .post("/api/mylist")
      .set("X-User-Id", fakeUserId)
      .send({
        contentType: "movie",
        contentId: movie._id.toString(),
        snapshot: {
          title: movie.title,
          posterUrl: movie.posterUrl,
        },
      })
      .expect(404);

    // DB must not contain a record for the fake user
    const count = await MyListItemModel.countDocuments({ userId: fakeUserId });
    expect(count).toBe(0);
  });

  test("returns 404 when content does not exist", async () => {
    const { user, movie } = await seedAll();
    const fakeItemId = new mongoose.Types.ObjectId().toString();

    await request(app)
      .post("/api/mylist")
      .set("X-User-Id", user._id.toString())
      .send({
        contentType: "movie",
        contentId: fakeItemId,
        snapshot: {
          title: movie.title,
          posterUrl: movie.posterUrl,
        },
      })
      .expect(404);

    // DB must not contain a record for the fake user
    const count = await MyListItemModel.countDocuments({
      contentId: fakeItemId,
    });
    expect(count).toBe(0);
  });

  test("returns 400 when payload is invalid (no DB write)", async () => {
    const { user } = await seedAll();

    await request(app)
      .post("/api/mylist")
      .set("X-User-Id", user._id.toString())
      .send({
        contentType: "movie",
      })
      .expect(400);

    const count = await MyListItemModel.countDocuments({ user: user._id });
    expect(count).toBe(0);
  });
});
