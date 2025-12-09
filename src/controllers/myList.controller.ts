import { Request, Response } from "express";
import * as service from "../services/myList.service";
import { toNumberOrDefault } from "../utils/pagination";
import { z } from "zod";
import { HttpError } from "../utils/httpError";

const AddSchema = z.object({
  contentId: z.string().min(1),
  contentType: z.enum(["movie", "tvshow"]),
  episodeId: z.string().min(1).optional(),
  snapshot: z.object({
    title: z.string(),
    posterUrl: z.string().optional(),
    genres: z.array(z.string()).optional(),
    shortDescription: z.string().optional(),
  }),
});

export async function addItem(req: Request, res: Response) {
  const parsed = AddSchema.safeParse(req.body);
  if (!parsed.success)
    throw new HttpError(400, JSON.stringify(parsed.error.issues));
  const userId = (req as any).userId;
  const item = await service.addToList(userId, parsed.data);
  res.status(201).json({ success: true, item });
}

export async function removeItem(req: Request, res: Response) {
  const userId = (req as any).userId;
  const { contentId } = req.params;
  const removed = await service.removeFromList(userId, contentId);
  if (!removed)
    return res.status(404).json({ success: false, message: "Item not found" });
  return res.status(200).json({ success: true, message: "Removed" });
}

export async function listItems(req: Request, res: Response) {
  const userId = (req as any).userId;
  const limit = toNumberOrDefault(req.query.limit, 20);
  const cursor = req.query.cursor as string | undefined;
  const contentType = (req.query.contentType as any) || undefined;
  const includeTotal = req?.query?.includeTotal ?? false;

  const result = await service.getList(
    userId,
    { limit, cursor, contentType },
    includeTotal as boolean,
  );
  res.json(result);
}
