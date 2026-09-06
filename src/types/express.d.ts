import { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { userId: string };
      file?: Express.Multer.File;
    }
  }
}
