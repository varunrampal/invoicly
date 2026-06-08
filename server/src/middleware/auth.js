import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "../utils/httpError.js";

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email
    },
    config.jwtSecret,
    { expiresIn: "7d" }
  );
}

export function requireAuth(req, _res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new HttpError(401, "Authentication required"));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.sub,
      email: payload.email
    };
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}
