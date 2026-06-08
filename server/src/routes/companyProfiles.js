import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getCompanyProfile,
  upsertCompanyProfile
} from "../services/companyProfiles.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const companyProfile = await getCompanyProfile(req.user.id);
    res.json({ companyProfile });
  } catch (error) {
    next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const companyProfile = await upsertCompanyProfile(req.user.id, req.body);
    res.json({ companyProfile });
  } catch (error) {
    next(error);
  }
});

export default router;
