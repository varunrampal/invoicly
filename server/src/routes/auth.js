import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(1, "Password is required")
});

function toSafeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [input.name, email, passwordHash]
    );

    const user = toSafeUser(result.rows[0]);
    res.status(201).json({
      user,
      token: signToken(user)
    });
  } catch (error) {
    if (error.code === "23505") {
      return next(new HttpError(409, "An account already exists for this email"));
    }

    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await query(
      `SELECT id, name, email, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [input.email.toLowerCase()]
    );

    const userRow = result.rows[0];

    if (!userRow) {
      throw new HttpError(401, "Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      userRow.password_hash
    );

    if (!passwordMatches) {
      throw new HttpError(401, "Invalid email or password");
    }

    const user = toSafeUser(userRow);
    res.json({
      user,
      token: signToken(user)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) {
      throw new HttpError(404, "User not found");
    }

    res.json({ user: toSafeUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

export default router;
