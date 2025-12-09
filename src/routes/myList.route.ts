import { Router } from "express";
import {
  addItem,
  removeItem,
  listItems,
} from "../controllers/myList.controller";

const router = Router();

router.post("/", addItem); // add item
router.get("/", listItems); // list items, supports ?limit=&cursor=&contentType=
router.delete("/:contentId", removeItem); // remove item

export default router;
