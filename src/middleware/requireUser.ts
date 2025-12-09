// We assume authentication produced a user id; simple middleware reads X-User-Id.

import { Request, Response, NextFunction } from "express";

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const userId = req.header("X-User-Id");
  if (!userId) {
    return res.status(401).json({ message: "Missing X-User-Id header" });
  }
  // put it on req for handlers
  (req as any).userId = userId;
  next();
}
