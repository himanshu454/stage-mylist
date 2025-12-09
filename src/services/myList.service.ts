import MyListItemModel from "../models/myListItem";
import UserModel from "../models/user";
import MovieModel from "../models/movie";
import TVShowModel from "../models/tvShow";
import EpisodeModel from "../models/episode";
import { Types } from "mongoose";
import { redis, userVersionKey, pageCacheKey } from "./myList.cache";
import logger from "../utils/logger";
import { HttpError } from "../utils/httpError";

const PAGE_TTL_SECONDS = Number(process.env.MYLIST_CACHE_TTL_SECONDS ?? 60);
const MAX_LIMIT = Number(process.env.MYLIST_MAX_LIMIT ?? 100);
const DEFAULT_LIMIT = Number(process.env.MYLIST_DEFAULT_LIMIT ?? 20);

export interface ListOptions {
  limit?: number;
  cursor?: string; // base64 encoded "addedAt|_id"
  contentType?: "movie" | "tvshow";
}

export type AddPayload = {
  contentId: string; // id of movie or tvshow
  contentType: "movie" | "tvshow";
  episodeId?: string; // optional id of episode when saving an episode
  snapshot?: {
    title: string;
    posterUrl?: string;
    genres?: string[];
    shortDescription?: string;
  };
  position?: number;
};

export async function addToList(
  userId: string,
  payload: AddPayload,
  includeTotal: boolean = false,
) {
  // const doc = {
  //   userId: new Types.ObjectId(userId),
  //   contentId: new Types.ObjectId(payload.contentId),
  //   contentType: payload.contentType,
  //   snapshot: payload.snapshot
  // };
  // Basic validation
  if (!Types.ObjectId.isValid(userId)) {
    throw new HttpError(400, "invalid userId", "INVALID_USER_ID");
  }
  if (!Types.ObjectId.isValid(payload.contentId)) {
    throw new HttpError(400, "invalid contentId", "INVALID_CONTENT_ID");
  }
  if (payload.episodeId && !Types.ObjectId.isValid(payload.episodeId)) {
    throw new HttpError(400, "invalid episodeId", "INVALID_EPISODE_ID");
  }

  const userOid = new Types.ObjectId(userId);
  const contentOid = new Types.ObjectId(payload.contentId);
  const episodeOid = payload.episodeId
    ? new Types.ObjectId(payload.episodeId)
    : undefined;

  //verify user exists
  const userExists = await UserModel.exists({ _id: userOid });
  if (!userExists) {
    throw new HttpError(404, "user not found", "USER_NOT_FOUND");
  }

  let snapshot = payload.snapshot;
  if (payload.contentType === "movie") {
    const movie = await MovieModel.findById(contentOid).lean();
    if (!movie) {
      throw new HttpError(404, "movie not found", "CONTENT_NOT_FOUND");
    }
    // if no snapshot provided, build one from movie
    if (!snapshot) {
      snapshot = {
        title: movie.title,
        posterUrl: (movie as any).posterUrl,
        genres: (movie as any).genres || [],
        shortDescription: (movie as any).description || "",
      };
    }
    // episodeId must not be provided for movies
    if (episodeOid) {
      throw new HttpError(
        400,
        "episodeId provided for movie contentType",
        "INVALID_PAYLOAD",
      );
    }
  } else {
    // contentType === "tvshow"
    const show = await TVShowModel.findById(contentOid).lean();
    if (!show) {
      throw new HttpError(404, "tv show not found", "CONTENT_NOT_FOUND");
    }
    // build snapshot if absent
    if (!snapshot) {
      snapshot = {
        title: show.title,
        posterUrl: (show as any).posterUrl,
        genres: (show as any).genres || [],
        shortDescription: (show as any).description || "",
      };
    }
    // if episodeId present, verify episode exists and belongs to this show
    if (episodeOid) {
      const episode = await EpisodeModel.findById(episodeOid).lean();
      if (!episode) {
        throw new HttpError(404, "episode not found", "EPISODE_NOT_FOUND");
      }
      // episode.showId or equivalent must match contentId
      const linkedShowId = (episode as any).showId;
      if (
        !linkedShowId ||
        new Types.ObjectId(linkedShowId).toString() !== contentOid.toString()
      ) {
        throw new HttpError(
          400,
          "episode does not belong to provided tv show",
          "EPISODE_MISMATCH",
        );
      }
    }
  }
  //Prepare document to insert
  const doc: any = {
    userId: userOid,
    contentType: payload.contentType,
    contentId: contentOid,
    addedAt: new Date(),
    snapshot,
    contentVisibility: "available",
  };
  if (episodeOid) doc.episodeId = episodeOid;
  try {
    const item = await MyListItemModel.create(doc);
    // bump version for cache invalidation
    await bumpUserVersion(userId);
    return item;
  } catch (err: any) {
    // duplicate key means already exists
    if (err.code === 11000) {
      // return existing item
      const existing = await MyListItemModel.findOne({
        userId: doc.userId,
        contentId: doc.contentId,
      }).lean();
      if (existing) {
        // still bump version to ensure clients see the latest consistent state if needed
        await bumpUserVersion(userId).catch(() => {});
        return existing;
      }
      throw new HttpError(
        500,
        "duplicate key but fetch failed",
        "INTERNAL_ERROR",
      );
    }
    logger.error("addToList failed", err);
    throw new HttpError(500, "failed to add item to list", "INTERNAL_ERROR");
  }
}

export async function removeFromList(userId: string, contentId: string) {
  try {
    const res = await MyListItemModel.findOneAndDelete({
      userId: new Types.ObjectId(userId),
      contentId: new Types.ObjectId(contentId),
    });
    if (res) {
      // bump version for cache invalidation
      await bumpUserVersion(userId);
    }
    return res;
  } catch (err) {
    throw new HttpError(
      500,
      "failed to remove item from list",
      "INTERNAL_ERROR",
    );
  }
}

/** decode and validate cursor */
function decodeCursorSafe(cursor: string) {
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const [addedAtStr, idStr] = raw.split("|");
    if (!addedAtStr || !idStr) throw new Error("invalid cursor format");
    const addedAt = new Date(addedAtStr);
    if (Number.isNaN(addedAt.getTime())) throw new Error("invalid cursor date");
    if (!Types.ObjectId.isValid(idStr)) throw new Error("invalid cursor id");
    return { addedAt, id: new Types.ObjectId(idStr) };
  } catch (err) {
    logger.error("cursor decode error:", err);
    throw new HttpError(400, "Invalid cursor", "INVALID_CURSOR");
  }
}

/**
 * Read path with Redis page cache and cursor pagination.
 * Returns { items, nextCursor }.
 */
export async function getList(
  userId: string,
  opts: {
    limit?: number;
    cursor?: string;
    contentType?: "movie" | "tvshow";
  } = {},
  includeTotal: boolean = false,
) {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  if (!Types.ObjectId.isValid(userId)) throw new Error("invalid userId");

  // fetch version atomically
  const versionKey = userVersionKey(userId);
  let version = await redis.get(versionKey);
  if (!version) {
    // initialize to "0" if absent
    await redis.setnx(versionKey, "0");
    version = "0";
  }

  const cacheKey = pageCacheKey(userId, version, limit, opts.cursor);
  // try cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // log and continue to DB read; do not fail the request
    logger.error("redis get failed", err);
  }

  // build DB query
  const queryAny: any = { userId: new Types.ObjectId(userId) };
  if (opts.contentType) queryAny.contentType = opts.contentType;

  if (opts.cursor) {
    const { addedAt, id } = decodeCursorSafe(opts.cursor);
    queryAny.$or = [
      { addedAt: { $lt: addedAt } },
      { addedAt: addedAt, _id: { $lt: id } },
    ];
  }

  // lean for performance
  const docs = await MyListItemModel.find(queryAny)
    .sort({ addedAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
    .exec();

  let nextCursor: string | null = null;
  if (docs.length > limit) {
    const last = docs[limit - 1];
    nextCursor = Buffer.from(
      `${last.addedAt.toISOString()}|${last._id}`,
    ).toString("base64");
    docs.splice(limit);
  }

  const payload: any = { items: docs, nextCursor };

  if (includeTotal) {
    const total = await MyListItemModel.countDocuments({
      userId: new Types.ObjectId(userId),
    });
    payload.total = total;
  }

  // cache write with NX to avoid overwriting; short TTL for freshness
  try {
    await redis.set(
      cacheKey,
      JSON.stringify(payload),
      "EX",
      PAGE_TTL_SECONDS,
      "NX",
    );
  } catch (err) {
    logger.error("redis set failed", err);
  }

  return payload;
}

/**
 * Mutation helpers: add and remove, each bumps user version for invalidation.
 * We return latest result so clients see immediate effect.
 */

async function bumpUserVersion(userId: string) {
  const versionKey = userVersionKey(userId);
  try {
    await redis.incr(versionKey);
    // optional TTL so version keys for inactive users expire
    await redis.expire(versionKey, 60 * 60 * 24 * 30);
  } catch (err) {
    logger.error("redis incr failed", err);
  }
}
